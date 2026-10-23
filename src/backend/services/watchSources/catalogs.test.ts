import { describe, expect, it } from "vitest";
import { discoverCatalogPages, parseCatalogPage } from "./catalogs";
import { sourcePageId } from "./store";
const config = { provider: "4khdhub" as const, baseUrl: "https://4khdhub.one", batchSize: 20, concurrency: 3, discoveryPages: 2, refreshHours: 24, budgetMs: 210000 };

describe("4KHDHub catalog", () => {
  it("discovers only trusted content cards and separates queue identities", () => {
    const html = `<a class="movie-card" href="/weapons-movie-3394/">Weapons</a><a class="movie-card" href="https://evil.example/weapons-movie-1/">Other</a><a href="/category/movies/">Movies</a>`;
    expect(discoverCatalogPages(html, config)).toEqual([`${config.baseUrl}/weapons-movie-3394/`]);
    expect(sourcePageId(`${config.baseUrl}/same/`, "4khdhub")).not.toBe(sourcePageId("https://source.example/same/"));
  });
  it("keeps file metadata and excludes unrelated recommendation links", () => {
    const page = parseCatalogPage(`<h1>Weapons (2025)</h1><div class="download-item"><div class="download-header">2160p HEVC 73.73 GB</div><div class="file-title">Weapons (2025) 2160p REMUX HEVC</div><a href="https://hubcloud.ist/drive/abc">Download HubCloud</a></div><a href="https://hubcloud.ist/drive/unrelated">Other movie</a>`, `${config.baseUrl}/weapons-movie-3394/`, config);
    expect(page).toMatchObject({ title: "Weapons", year: 2025, mediaType: "movie" });
    expect(page.links).toHaveLength(1);
    expect(page.links[0]).toMatchObject({ quality: "2160p", codec: "HEVC", size: "73.73GB", scope: "movie" });
  });
  it("retains exact season and episode identity from file rows", () => {
    const page = parseCatalogPage(`<h1>Example (2025)</h1><div class="download-item"><div class="file-title">Example.S02E03.1080p.x264.mkv</div><a href="https://hubdrive.pics/file/123">Download HubDrive</a></div>`, `${config.baseUrl}/example-series-1/`, config);
    expect(page).toMatchObject({ title: "Example", mediaType: "tv" });
    expect(page.links[0]).toMatchObject({ season: 2, episode: 3, scope: "episode" });
  });
});


describe("4KHDHub identity metadata", () => {
  it("uses a matching Open Graph release year without adding Series to the canonical title", () => {
    const page = parseCatalogPage(`<meta property="og:title" content="Breaking Bad (2008) - 4K-HDHub"><h1>Breaking Bad</h1><div class="download-item"><div class="file-title">Breaking.Bad.S02E03.1080p.x264.mkv</div><a href="https://hubdrive.pics/file/123">Download HubDrive</a></div>`, `${config.baseUrl}/breaking-bad-series-1/`, config);
    expect(page).toMatchObject({ title: "Breaking Bad", year: 2008, mediaType: "tv" });
    expect(page.links[0]).toMatchObject({ season: 2, episode: 3, scope: "episode" });
  });
  it("does not borrow a year from another title's metadata", () => {
    const page = parseCatalogPage(`<meta property="og:title" content="Other (2025) - 4K-HDHub"><h1>Example</h1>`, `${config.baseUrl}/example-series-1/`, config);
    expect(page).toMatchObject({ title: "Example", year: null, mediaType: "tv" });
  });
});
