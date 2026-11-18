import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogOriginAllowed, createCatalogFetcher } from "./catalogDomains";
import { sourcePageUrl, type ImporterConfig } from "./config";
import { discoverCatalogPages, parseCatalogPage } from "./catalogs";
import { discoverArchive, sitemapUrls } from "./discovery";
import type { fetchSourceDocument } from "./http";
import type { SourceRepository } from "./store";

const config: ImporterConfig = { baseUrl: "https://new8.hdhub4u.cl", batchSize: 20, concurrency: 3,
  discoveryPages: 1, refreshHours: 24, budgetMs: 210_000 };
const moved = "https://new14.hdhub4u.cl";
const response = (html: string, finalUrl: string) => ({ html, finalUrl, etag: '"new"', lastModified: null });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("catalog domain rotation", () => {
  it.each([
    ["rogmovies", "https://rogmovies.im", "https://rogmovies.cyou"],
    ["hdhub", config.baseUrl, moved], ["moviesmod", "https://moviesmod.uk.com", "https://moviesmod.fi"],
    ["bollyflix", "https://bollyflix.co.za", "https://new1.bollyflix.tours"], ["uhdmovies", "https://uhdmovies.us.org", "https://uhdmovies.ceo"],
  ] as const)("accepts observed %s moves and preserves saved post identity", async (provider, baseUrl, current) => {
    const catalog = { ...config, provider, baseUrl };
    const fetchDocument = vi.fn<typeof fetchSourceDocument>().mockResolvedValue(response(`<h2 class="entry-title"><a href="${current}/weapons-2025/">Weapons</a></h2>
      <a href="https://foreign.example/unrelated/">Other</a>`, current + "/"));
    const read = createCatalogFetcher(fetchDocument)(catalog);
    const result = await read(baseUrl + "/", baseUrl, { etag: '"old"' });
    expect(result).toMatchObject({ etag: null, lastModified: null });
    expect(result.html).toContain(baseUrl + "/weapons-2025/");
    expect(result.html).toContain("https://foreign.example/unrelated/");
    expect(sourcePageUrl(current + "/weapons-2025/", catalog)).toBe(baseUrl + "/weapons-2025/");
    const allows = fetchDocument.mock.calls[0][3]!.redirectOriginAllowed!;
    expect(allows(current)).toBe(true);
    expect(allows("https://evil.example")).toBe(false);
    await read(baseUrl + "/weapons-2025/", baseUrl, { etag: '"old"' });
    expect(fetchDocument.mock.calls[1].slice(0, 3)).toEqual([current + "/weapons-2025/", current, {}]);
  });
  it("discovers archived posts across a redirect instead of rejecting the new sitemap origin", async () => {
    const fetchDocument = vi.fn<typeof fetchSourceDocument>(async (url) => response(url.endsWith("/sitemap.xml") ?
      `<sitemapindex><sitemap><loc>${moved}/post-sitemap.xml</loc></sitemap></sitemapindex>` :
      `<urlset><url><loc>${moved}/weapons-2025/</loc></url><url><loc>https://evil.example/other/</loc></url></urlset>`, moved + new URL(url).pathname));
    const repository = { discovery: vi.fn().mockResolvedValue(null), saveDiscovery: vi.fn() } as unknown as SourceRepository;
    const result = await discoverArchive(config, repository, createCatalogFetcher(fetchDocument)(config));
    expect(result).toEqual({ urls: [config.baseUrl + "/weapons-2025/"], errors: 0 });
    expect(fetchDocument.mock.calls[1][0]).toBe(moved + "/post-sitemap.xml");
  });
  it("rebases WordPress search results and preserves published external release links", async () => {
    const catalog = { ...config, provider: "moviesmod" as const, baseUrl: "https://moviesmod.uk.com" };
    const current = "https://moviesmod.tw";
    const post = "/download-weapons-2025/";
    const fetchDocument = vi.fn<typeof fetchSourceDocument>().mockResolvedValueOnce(response(`<h2 class="front-view-title"><a href="${current}${post}">Weapons</a></h2>`, current + "/search/Weapons"))
      .mockResolvedValueOnce(response('<h1 class="entry-title">Weapons (2025)</h1><div class="entry-content"><h3>720p x264</h3><p><a href="https://hubcloud.ist/drive/abc">Download</a></p></div>', current + post));
    const read = createCatalogFetcher(fetchDocument)(catalog);
    const search = await read(catalog.baseUrl + "/?s=Weapons", catalog.baseUrl);
    expect(discoverCatalogPages(search.html!, catalog)).toEqual([catalog.baseUrl + post]);
    const page = await read(catalog.baseUrl + post, catalog.baseUrl);
    expect(parseCatalogPage(page.html!, catalog.baseUrl + post, catalog).links[0]).toMatchObject({ url: "https://hubcloud.ist/drive/abc", resolution: 720, releaseYear: 2025 });
    // A redirect to /search/... must not poison the origin cache as a domain-only move.
    expect(fetchDocument.mock.calls[1][0]).toBe(catalog.baseUrl + post);
  });
  it("uses the observed current domain after the old domain fails", async () => {
    const fetchDocument = vi.fn<typeof fetchSourceDocument>().mockRejectedValueOnce(new TypeError("DNS failure"))
      .mockResolvedValueOnce(response("<h1>Movie</h1>", moved + "/movie/"));
    expect((await createCatalogFetcher(fetchDocument)(config)(config.baseUrl + "/movie/", config.baseUrl)).html).toContain("Movie");
    expect(fetchDocument.mock.calls.map(([url]) => url)).toEqual([config.baseUrl + "/movie/", moved + "/movie/"]);
  });
  it("expires remembered origins and honors explicit operator overrides", async () => {
    vi.useFakeTimers();
    const fetchDocument = vi.fn<typeof fetchSourceDocument>().mockResolvedValue(response("<h1>Movie</h1>", moved + "/movie/"));
    const create = createCatalogFetcher(fetchDocument);
    const read = create(config);
    await read(config.baseUrl + "/movie/", config.baseUrl);
    vi.advanceTimersByTime(300_001);
    await read(config.baseUrl + "/movie/", config.baseUrl);
    expect(fetchDocument.mock.calls[1][0]).toBe(config.baseUrl + "/movie/");
    const override = { ...config, baseUrl: "https://replacement.example" };
    fetchDocument.mockRejectedValue(new Error("offline"));
    await expect(create(override)(override.baseUrl + "/movie/", override.baseUrl)).rejects.toThrow("offline");
    expect(fetchDocument.mock.calls.slice(2).map(([url]) => url)).toEqual([override.baseUrl + "/movie/"]);
  });
  it.each(["http://new10.hdhub4u.cl", "https://new10.hdhub4u.cl.evil.example", "https://127.0.0.1", "https://moviesmod.tw", "https://user:pass@new10.hdhub4u.cl"])("rejects untrusted HDHub targets: %s", async (origin) => {
    expect(catalogOriginAllowed(config, origin)).toBe(false);
    const fetchDocument = vi.fn<typeof fetchSourceDocument>().mockResolvedValue(response("<h1>Ad</h1>", origin + "/movie/"));
    await expect(createCatalogFetcher(fetchDocument)(config)(config.baseUrl + "/movie/", config.baseUrl)).rejects.toThrow("Untrusted");
  });
  it("never reuses an old-domain 304 or sends its validators after a redirect", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: moved + "/movie/" } }))
      .mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", request);
    await expect(createCatalogFetcher()(config)(config.baseUrl + "/movie/", config.baseUrl, { etag: '"old"' })).rejects.toThrow("304");
    expect(request.mock.calls[1][1].headers["If-None-Match"]).toBeUndefined();
  });
  it("does not start requests after cancellation", async () => {
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    const fetchDocument = vi.fn<typeof fetchSourceDocument>();
    await expect(createCatalogFetcher(fetchDocument)(config)(config.baseUrl + "/", config.baseUrl, {}, { signal: controller.signal })).rejects.toThrow("cancelled");
    expect(fetchDocument).not.toHaveBeenCalled();
  });
  it("keeps XML boundaries strict after rebasing", () => {
    expect(sitemapUrls(`<sitemapindex><sitemap><loc>${config.baseUrl}/category-sitemap.xml</loc></sitemap></sitemapindex>`, config.baseUrl, true)).toEqual([]);
  });
});
