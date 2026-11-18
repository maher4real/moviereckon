import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverAdditionalPages, parseAdditionalPage, searchAdditionalCatalog } from "./additionalCatalogs";
import { getCatalogConfigs, sourcePageUrl } from "./config";
import { canCheckWatchLink } from "@/shared/lib/watchSources";
import { fetchContentSources } from "./contentImport";
import { emptyImportSummary } from "./importer";

const base = { batchSize: 20, concurrency: 3, discoveryPages: 1, refreshHours: 24, budgetMs: 210_000 };
const movie = { ...base, provider: "movies4u" as const, baseUrl: "https://movies4u.one" };
const rog = { ...base, provider: "rogmovies" as const, baseUrl: "https://rogmovies.im" };
const moviePath = "/19858-weapons-2025-hindi-bluray-720p.html";
const rogPath = "/download-weapons-2025-hindi/";
const releaseRows = `<h3>720p x265</h3><h3><div class="downloads-btns-div"><a href="https://nexdrive.help/genxfm175139605628678/">Click Here To Download [1.26GB]</a></div></h3>
  <h3>1080p x264</h3><p><a href="https://nexdrive.beer/genxfm546621708268624/">Download [2.08GB]</a></p>`;
const moviePost = `<div class="single-service-content"><h1>Weapons 2025 Hindi BluRay 720p - 1080p</h1><div class="download-links-div">${releaseRows}</div></div>`;
const rogPost = `<h1 class="post-title">Download Weapons (2025) Hindi BluRay</h1><main class="page-body">${releaseRows}</main>`;
const response = (html: string) => ({ html, etag: null, lastModified: null });
afterEach(() => vi.unstubAllEnvs());

describe("Movies4U and RogMovies catalogs", () => {
  it.each([[movie, moviePost, moviePath], [rog, rogPost, rogPath]] as const)("parses actual release rows for $0.provider", (config, html, path) => {
    const parsed = parseAdditionalPage(html, config.baseUrl + path, config);
    expect(parsed).toMatchObject({ title: "Weapons", year: 2025, mediaType: "movie" });
    expect(parsed.links).toHaveLength(2);
    expect(parsed.links[0]).toMatchObject({ resolution: 720, codec: "HEVC", size: "1.26GB", releaseYear: 2025 });
    expect(parsed.links[1]).toMatchObject({ resolution: 1080, codec: "H.264", size: "2.08GB" });
    expect(parsed.links.every(canCheckWatchLink)).toBe(true);
  });
  it("retains exact episode scope and excludes related posts", () => {
    const html = `<h1 class="post-title">Download Example (Hindi) – Season 2</h1><main class="page-body"><h3>Season 2 720p x264</h3>
      <p><a href="https://nexdrive.help/genxfm123456/">Episode 1</a><a href="https://nexdrive.help/genxfm123457/">Episode 2</a></p>
      <div class="related-posts">${releaseRows}</div></main>`;
    const parsed = parseAdditionalPage(html, rog.baseUrl + "/download-example/", rog);
    expect(parsed.title).toBe("Example");
    expect(parsed.links.map((link) => [link.scope, link.season, link.episode])).toEqual([["episode", 2, 1], ["episode", 2, 2]]);
  });
  it("discovers only same-origin content cards, supporting numeric HTML paths", () => {
    expect(discoverAdditionalPages(`<article class="post"><a href="${moviePath}">Movie</a><a href="https://evil.example${moviePath}">Ad</a>
      <a href="${moviePath}?tracking=1">Tracking</a><a href="/category/movies/">Category</a></article><aside><article class="post"><a href="/2-other.html">Related</a></article></aside>`, movie))
      .toEqual([movie.baseUrl + moviePath]);
    expect(discoverAdditionalPages(`<div class="movies-grid"><a href="${rogPath}">Movie</a><a href="/category/">Category</a></div>`, rog))
      .toEqual([rog.baseUrl + rogPath]);
  });
  it("paginates the real Movies4U search without executing scripts", async () => {
    const fetchDocument = vi.fn().mockResolvedValueOnce(response(`<article class="post"><a href="${moviePath}">Movie</a></article>
      <div class="navigation"><a onclick="javascript:list_submit(2); return(false)">2</a></div>`)).mockResolvedValueOnce(response('<section class="site-main">No further results</section>'));
    expect(await searchAdditionalCatalog(["Weapons", "Weapons"], movie, fetchDocument)).toEqual({ urls: [movie.baseUrl + moviePath], errors: 0 });
    expect(fetchDocument.mock.calls.map(([url]) => url)).toEqual([1, 2].map((page) => `${movie.baseUrl}/index.php?do=search&subaction=search&story=Weapons&search_start=${page}`));
  });
  it("uses paginated RogMovies JSON and rejects foreign results", async () => {
    const fetchDocument = vi.fn().mockResolvedValueOnce(response(JSON.stringify({ found: 2, hits: [{ document: { permalink: "https://rogmovies.cyou" + rogPath } }] })))
      .mockResolvedValueOnce(response(JSON.stringify({ found: 2, hits: [{ document: { permalink: "https://evil.example/download-other/" } }] })));
    expect(await searchAdditionalCatalog(["Weapons"], rog, fetchDocument)).toEqual({ urls: [rog.baseUrl + rogPath], errors: 0 });
    expect(fetchDocument.mock.calls[1][0]).toBe(rog.baseUrl + "/ts-search.php?q=Weapons&page=2");
  });
  it("reports malformed, failed, truncated and exhausted searches as partial", async () => {
    for (const html of ["invalid", JSON.stringify({ found: 2, hits: [] }), JSON.stringify({ found: 0, hits: [], search_cutoff: true })]) {
      expect((await searchAdditionalCatalog(["Weapons"], rog, vi.fn().mockResolvedValue(response(html)))).errors).toBe(1);
    }
    const request = vi.fn();
    expect((await searchAdditionalCatalog(["Weapons"], rog, request, Date.now() - 1)).errors).toBe(1);
    expect(request).not.toHaveBeenCalled();
    expect((await searchAdditionalCatalog(["Weapons"], movie, vi.fn().mockRejectedValue(new Error("offline")))).errors).toBe(1);
    expect((await searchAdditionalCatalog(["Weapons"], movie, vi.fn().mockResolvedValue(response("<h1>Just a moment</h1>")))).errors).toBe(1);
  });
  it.each([[movie, moviePost, moviePath], [rog, rogPost, rogPath]] as const)("imports matching search candidates for $0.provider", async (config, html, path) => {
    const url = config.baseUrl + path;
    const deps = {
      identity: vi.fn().mockResolvedValue({ title: "Weapons", originalTitle: "Weapons", imdbId: null }),
      lookup: vi.fn().mockResolvedValue({ contentId: 42, contentType: "movie", sources: [] }), repository: vi.fn().mockResolvedValue({}), archive: vi.fn(),
      match: vi.fn().mockResolvedValue({ status: "matched", match: { tmdbId: 42, mediaType: "movie", method: "title" }, reason: null }),
      fetchDocument: vi.fn(async (value: string) => response(value === url ? html : value.includes("ts-search.php") ? JSON.stringify({ found: 1, hits: [{ document: { permalink: path } }] }) :
        value.includes("index.php") ? `<article class="post"><a href="${path}">Movie</a></article>` : "")),
      run: vi.fn().mockResolvedValue({ ...emptyImportSummary(), matched: 1 }),
    };
    expect(await fetchContentSources(42, "movie", undefined, config, deps)).toMatchObject({ status: "imported", importedPages: 1 });
    expect(deps.run.mock.calls[0][0].urls).toEqual([url]);
    deps.match.mockResolvedValueOnce({ status: "matched", match: { tmdbId: 999, mediaType: "movie", method: "title" }, reason: null });
    expect(await fetchContentSources(42, "movie", undefined, config, deps)).toMatchObject({ status: "not_found", importedPages: 0 });
  });
  it.each([movie, rog])("supports configured domain rotation and independent disabling for $provider", (config) => {
    const key = config.provider.toUpperCase();
    vi.stubEnv(`${key}_BASE_URL`, "https://new.example");
    const rotated = getCatalogConfigs({ ...base, baseUrl: "https://hdhub.example" }).find((c) => c.provider === config.provider)!;
    expect(sourcePageUrl(config.provider === "movies4u" ? moviePath : rogPath, rotated)).toContain("https://new.example/");
    expect(() => sourcePageUrl("https://evil.example" + moviePath, rotated)).toThrow();
    vi.stubEnv(`WATCH_${key}_ENABLED`, "false");
    expect(getCatalogConfigs({ ...base, baseUrl: "https://hdhub.example" }).some((c) => c.provider === config.provider)).toBe(false);
  });
});
