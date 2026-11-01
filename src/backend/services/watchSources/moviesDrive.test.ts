import { describe, expect, it, vi } from "vitest";
import { discoverMoviesDrivePages, moviesDriveMirrors, parseMoviesDrivePage, searchMoviesDrive } from "./moviesDrive";
import { canCheckWatchLink, isMoviesDriveArchive } from "@/shared/lib/watchSources";
import { fetchContentSources } from "./contentImport";
import { emptyImportSummary } from "./importer";

const config = { provider: "moviesdrive" as const, baseUrl: "https://new1.moviesdrive.cyou", batchSize: 20,
  concurrency: 3, discoveryPages: 1, refreshHours: 24, budgetMs: 210_000 };
const post = `<article class="post-content"><header class="post-header"><h1>Weapons (2025) DS4K WEB-DL [English DD5.1] | Full Movie</h1></header>
  <main class="page-body"><h3>Movie/Film Info:</h3><a href="https://imdb.com/title/tt26581740/">IMDb</a>
  <a href="https://old.moviesdrive.example/?s=720p">720p</a><h3>Screen-Shots</h3>
  <h5><a href="https://mdrive.lol/archive/14513/">720p_x264 [1.1GB]</a></h5>
  <h5><a href="https://mdrive.lol/archive/14514/">1080p_10BIT_HEVC [2GB]</a></h5>
  <div class="related-posts"><h3>2160p</h3><a href="https://mdrive.lol/archive/999/">Download</a></div></main></article>`;
const archive = `<header><h1>Menu</h1></header><h1 class="entry-title">Weapons (2025) DS4K WEB-DL [English DD5.1] 720p_x264 [1.1GB]</h1>
  <div class="entry-content"><h5>Download LINKS</h5><a href="https://hubcloud.ist/drive/abc"><img alt="HubCloud"></a>
  <a href="https://hubcloud.ist/drive/abc">Duplicate</a><a href="https://evil.example/file/abc">Download</a>
  <a href="https://mdrive.lol/archive/999/">Recursive index</a></div><a href="https://hubdrive.pics/file/999">Unrelated</a>`;
const response = (html: string) => ({ html, etag: null, lastModified: null });

describe("MoviesDrive", () => {
  it("discovers poster cards only on the configured origin", () => {
    expect(discoverMoviesDrivePages(`<div class="movies-grid"><a href="/weapons-2025/"><div class="poster-card"></div></a>
      <a href="https://evil.example/other/"><div class="poster-card"></div></a><a href="/category/movies/"><div class="poster-card"></div></a></div>
      <aside><div class="movies-grid"><a href="/unrelated/"><div class="poster-card"></div></a></div></aside>`, config.baseUrl))
      .toEqual([`${config.baseUrl}/weapons-2025/`]);
  });
  it("parses actual quality-only buttons and preserves per-release metadata", () => {
    const page = parseMoviesDrivePage(post, `${config.baseUrl}/weapons-2025/`);
    expect(page).toMatchObject({ title: "Weapons", year: 2025, imdbId: "tt26581740", mediaType: "movie" });
    expect(page.links).toHaveLength(2);
    expect(page.links[0]).toMatchObject({ resolution: 720, codec: "H.264", size: "1.1GB", scope: "movie", releaseYear: 2025 });
    expect(page.links[1]).toMatchObject({ resolution: 1080, codec: "HEVC", bitDepth: 10, size: "2GB" });
    expect(page.links.every(canCheckWatchLink)).toBe(true);
    expect(parseMoviesDrivePage(post.replace("archive/14513/", "archive/14513"), `${config.baseUrl}/weapons-2025/`).links[0].resolution).toBe(720);
  });
  it("expands image-only mirrors without changing the selected file metadata", () => {
    const link = parseMoviesDrivePage(post, `${config.baseUrl}/weapons-2025/`).links[0];
    expect(moviesDriveMirrors(archive, link, "Weapons")).toEqual([{ ...link, url: "https://hubcloud.ist/drive/abc", host: "hubcloud.ist" }]);
    expect(() => moviesDriveMirrors(archive.replaceAll("Weapons", "Other"), link, "Weapons")).toThrow("does not match");
    expect(() => moviesDriveMirrors(archive.replaceAll("2025", "1999"), link, "Weapons")).toThrow("does not match");
  });
  it.each(["http://mdrive.lol/archive/1/", "https://mdrive.lol.evil.example/archive/1/", "https://mdrive.lol/archive/1/?next=evil", "https://mdrive.lol/archive/author/admin/", "https://127.0.0.1/archive/1/"])("rejects unsupported archive URLs: %s", (url) => {
    expect(isMoviesDriveArchive(url)).toBe(false);
  });
  it("uses paginated JSON search, deduplicates titles, and rejects foreign or navigation results", async () => {
    const fetchDocument = vi.fn().mockResolvedValueOnce(response(JSON.stringify({ found: 3, hits: [
      { document: { permalink: "/weapons-2025/" } }, { document: { permalink: "https://evil.example/weapons/" } }],
    }))).mockResolvedValueOnce(response(JSON.stringify({ found: 3, hits: [{ document: { permalink: "/category/movies/" } }] })));
    expect(await searchMoviesDrive(["Weapons", "Weapons"], config, fetchDocument)).toEqual({ urls: [`${config.baseUrl}/weapons-2025/`], errors: 0 });
    expect(fetchDocument).toHaveBeenCalledTimes(2);
    expect(fetchDocument.mock.calls[1]).toEqual([`${config.baseUrl}/search.php?q=Weapons&page=2`, config.baseUrl, {}, expect.objectContaining({ format: "json" })]);
  });
  it("reports failed, malformed and truncated searches instead of claiming no matches", async () => {
    for (const html of ["<html>Challenge</html>", "{}", JSON.stringify({ found: 3, hits: [] })]) {
      expect(await searchMoviesDrive(["Weapons"], config, vi.fn().mockResolvedValue(response(html)))).toMatchObject({ errors: 1 });
    }
    const fetchDocument = vi.fn().mockResolvedValue(response(JSON.stringify({ found: 100, hits: [{ document: { permalink: "/weapons-2025/" } }] })));
    expect(await searchMoviesDrive(["Weapons"], config, fetchDocument)).toMatchObject({ errors: 1 });
    expect(fetchDocument).toHaveBeenCalledTimes(5);
  });
  it("imports only matching movie releases from JSON results and emits simple progress", async () => {
    const url = `${config.baseUrl}/weapons-2025/`, wrong = `${config.baseUrl}/weapons-other/`;
    const deps = {
      identity: vi.fn().mockResolvedValue({ title: "Weapons", originalTitle: "Weapons", imdbId: "tt26581740" }),
      lookup: vi.fn().mockResolvedValue({ contentId: 42, contentType: "movie", sources: [] }),
      repository: vi.fn().mockResolvedValue({}), archive: vi.fn(), match: vi.fn(),
      fetchDocument: vi.fn(async (value: string) => response(value.includes("search.php") ? JSON.stringify({ found: 2,
        hits: [url, wrong].map((permalink) => ({ document: { permalink } })) }) : value === url ? post :
        value === wrong ? post.replace("tt26581740", "tt9999999") : "<html/>")),
      run: vi.fn().mockResolvedValue({ ...emptyImportSummary(), matched: 1 }),
    };
    const emit = vi.fn();
    expect(await fetchContentSources(42, "movie", undefined, config, deps, emit)).toMatchObject({ status: "imported", importedPages: 1 });
    expect(deps.run.mock.calls[0][0].urls).toEqual([url]);
    expect(deps.match).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith({ type: "progress", message: "Taking a closer look…" });
  });
});
