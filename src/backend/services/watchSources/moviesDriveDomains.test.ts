import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalMoviesDriveArchive, createMoviesDriveFetcher, moviesDriveDomainPolicy } from "./moviesDriveDomains";
import { discoverMoviesDrivePages, parseMoviesDrivePage, searchMoviesDrive } from "./moviesDrive";
import { sourcePageId } from "./store";
import { sourcePageUrl } from "./config";
import { canCheckWatchLink } from "@/shared/lib/watchSources";

const base = "https://new1.moviesdrive.cyou";
const moved = "https://new2.moviesdrive.cyou";
const config = { provider: "moviesdrive" as const, baseUrl: base, batchSize: 20, concurrency: 3, discoveryPages: 1, refreshHours: 24, budgetMs: 210_000 };
const html = () => new Response("<h1>Weapons (2025)</h1>", { headers: { "content-type": "text/html" } });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("MoviesDrive domain rotation", () => {
  it("follows a numbered domain move, drops old validators, and reuses the working origin", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: `${moved}/weapons-2025/` } }))
      .mockImplementation(async () => new Response("<h1>Weapons (2025)</h1>", { headers: { "content-type": "text/html", etag: '"new"' } }));
    vi.stubGlobal("fetch", fetch);
    const document = createMoviesDriveFetcher("catalog");
    expect(await document(`${base}/weapons-2025/`, base, { etag: '"old"' })).toMatchObject({ finalUrl: `${moved}/weapons-2025/`, etag: null });
    expect(fetch.mock.calls[0][1].headers["If-None-Match"]).toBe('"old"');
    expect(fetch.mock.calls[1][1].headers["If-None-Match"]).toBeUndefined();
    await document(`${base}/another-2025/`, base, { etag: '"old"' });
    expect(fetch.mock.calls[2][0]).toBe(`${moved}/another-2025/`);
    expect(fetch.mock.calls[2][1].headers["If-None-Match"]).toBeUndefined();
  });
  it("tries configured backups on DNS failure while preserving encoded search parameters", async () => {
    vi.stubEnv("MOVIESDRIVE_FALLBACK_ORIGINS", "https://catalog-backup.example");
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith(base)) throw new TypeError("DNS failure");
      return Response.json({ found: 0, hits: [] });
    });
    vi.stubGlobal("fetch", fetch);
    const document = createMoviesDriveFetcher("catalog");
    await document(`${base}/search.php?q=A%20%26%20B&page=2`, base, {}, { format: "json" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`${base}/search.php?q=A%20%26%20B&page=2`,
      `${base}/search.php?q=A%20%26%20B&page=2`, "https://catalog-backup.example/search.php?q=A%20%26%20B&page=2"]);
  });
  it("recovers when a cached mirror fails and expires cached moves after five minutes", async () => {
    let now = 1000, failMirror = false;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubEnv("MOVIESDRIVE_FALLBACK_ORIGINS", moved);
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith(moved) && failMirror) return new Response(null, { status: 410 });
      if (url.startsWith(base) && !failMirror) return new Response(null, { status: 410 });
      return html();
    });
    vi.stubGlobal("fetch", fetch);
    const document = createMoviesDriveFetcher("catalog");
    await document(`${base}/post/`, base);
    failMirror = true;
    await document(`${base}/post/`, base);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`${base}/post/`, `${moved}/post/`, `${moved}/post/`, `${base}/post/`]);
    failMirror = false;
    await document(`${base}/post/`, base);
    now += 300_001;
    fetch.mockClear();
    await document(`${base}/post/`, base);
    expect(fetch.mock.calls[0][0]).toBe(`${base}/post/`);
  });
  it.each(["https://moviesdrive.cyou.evil.example/post/", "https://evil.moviesdrive.cyou/post/", "https://mdrive.lol/post/",
    "http://new2.moviesdrive.cyou/post/", "https://127.0.0.1/post/", "https://new2.moviesdrive.cyou:8443/post/", "https://user:pass@new2.moviesdrive.cyou/post/"])("never follows an untrusted redirect: %s", async (location) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal("fetch", fetch);
    await expect(createMoviesDriveFetcher("catalog")(`${base}/post/`, base)).rejects.toThrow("redirect");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("bounds redirect loops and rejects a 304 after changing origins", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(null, { status: 302, headers: { location: `${moved}/post/` } }));
    vi.stubGlobal("fetch", fetch);
    await expect(createMoviesDriveFetcher("catalog")(`${base}/post/`, base)).rejects.toThrow("redirect");
    expect(fetch).toHaveBeenCalledTimes(4);
    fetch.mockReset().mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: `${moved}/post/` } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(createMoviesDriveFetcher("catalog")(`${base}/post/`, base, { etag: '"old"' })).rejects.toThrow("invalid 304");
  });
  it("honors cancellation without starting a fallback request", async () => {
    vi.stubEnv("MOVIESDRIVE_FALLBACK_ORIGINS", moved);
    const controller = new AbortController();
    const fetch = vi.fn(async () => { controller.abort(); throw controller.signal.reason; });
    vi.stubGlobal("fetch", fetch);
    await expect(createMoviesDriveFetcher("catalog")(`${base}/post/`, base, {}, { signal: controller.signal })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("never reuses a primary-origin snapshot after a backup returns an unsolicited 304", async () => {
    vi.stubEnv("MOVIESDRIVE_FALLBACK_ORIGINS", moved);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 410 }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetch);
    await expect(createMoviesDriveFetcher("catalog")(`${base}/post/`, base, { etag: '"old"' })).rejects.toThrow("invalid 304");
  });
  it("rebases absolute links from trusted mirrors while keeping queue IDs stable", async () => {
    vi.stubEnv("MOVIESDRIVE_FALLBACK_ORIGINS", "https://previous-catalog.example");
    expect(discoverMoviesDrivePages(`<div class="movies-grid"><a href="${moved}/weapons-2025/"><div class="poster-card"></div></a></div>`, base))
      .toEqual([`${base}/weapons-2025/`]);
    const fetchDocument = vi.fn().mockResolvedValue({ html: JSON.stringify({ found: 2, hits: [
      { document: { permalink: "https://previous-catalog.example/weapons-2025/" } },
      { document: { permalink: `${moved}/weapons-2025/` } },
    ] }), etag: null, lastModified: null });
    expect(await searchMoviesDrive(["Weapons"], config, fetchDocument)).toEqual({ urls: [`${base}/weapons-2025/`], errors: 0 });
    expect(sourcePageUrl(`${moved}/weapons-2025/`, config)).toBe(`${base}/weapons-2025/`);
    expect(sourcePageId(`${moved}/weapons-2025/`, "moviesdrive")).toBe(sourcePageId(`${base}/weapons-2025/`, "moviesdrive"));
  });
  it("keeps saved archive link IDs checkable and resolves them through the newly configured domain", async () => {
    vi.stubEnv("MOVIESDRIVE_ARCHIVE_BASE_URL", "https://new-archive.example");
    const page = (origin: string) => `<h1>Weapons (2025)</h1><main class="page-body"><h5><a href="${origin}/archive/123/">720p_x264 [1GB]</a></h5></main>`;
    const old = parseMoviesDrivePage(page("https://mdrive.lol"), `${base}/weapons-2025/`).links[0];
    const current = parseMoviesDrivePage(page("https://new-archive.example"), `${base}/weapons-2025/`).links[0];
    expect(current).toEqual(old);
    expect(canCheckWatchLink(current)).toBe(true);
    const fetch = vi.fn().mockImplementation(async () => html());
    vi.stubGlobal("fetch", fetch);
    await createMoviesDriveFetcher("archive")(old.url, "https://mdrive.lol");
    expect(fetch.mock.calls[0][0]).toBe("https://new-archive.example/archive/123/");
    expect(canonicalMoviesDriveArchive("https://new-archive.example/archive/123/?ad=1")).toBeNull();
    expect(canonicalMoviesDriveArchive("/archive/123/")).toBeNull();
    expect(canonicalMoviesDriveArchive("https://unknown.example/archive/123/")).toBeNull();
  });
  it.each(["http://example.com", "https://127.0.0.1", "https://user:pass@example.com", "https://example.com/path/", "https://example.com:8443", "https://example.com?next=1"])("rejects unsafe configured backups: %s", (value) => {
    vi.stubEnv("MOVIESDRIVE_FALLBACK_ORIGINS", value);
    expect(() => moviesDriveDomainPolicy("catalog")).toThrow("HTTPS origins");
  });
  it("bounds the number of configured fallback domains", () => {
    vi.stubEnv("MOVIESDRIVE_FALLBACK_ORIGINS", "https://one.example,https://two.example,https://three.example,https://four.example");
    expect(() => moviesDriveDomainPolicy("catalog")).toThrow("at most three");
  });
});
