import { describe, expect, it } from "vitest";
import { discoverCatalogPages, parseCatalogPage } from "./catalogs";
import type { ImporterConfig } from "./config";

const config: ImporterConfig = { provider: "moviesmod", baseUrl: "https://moviesmod.uk.com", batchSize: 20, concurrency: 3, discoveryPages: 2, refreshHours: 24, budgetMs: 210_000 };
describe("additional release catalogs", () => {
  it("discovers WordPress and UHD cards without following navigation or foreign origins", () => {
    const html = `<article><header><h2 class="front-view-title"><a href="/download-example-2025/">Example</a></h2></header></article>
      <a href="/download-series-season-1/"><center><h1 class="sanket">Series</h1></center></a>
      <aside><h2 class="entry-title"><a href="/unrelated/">Other</a></h2></aside>
      <h2 class="entry-title"><a href="https://evil.example/download-other/">Other</a></h2>
      <a href="/category/movies/">Movies</a><h2 class="entry-title"><a href="/?s=test">Search</a></h2>`;
    expect(discoverCatalogPages(html, config)).toEqual([`${config.baseUrl}/download-example-2025/`, `${config.baseUrl}/download-series-season-1/`]);
  });
  it.each(["moviesmod", "bollyflix", "uhdmovies"] as const)("parses %s quality rows and preserves canonical identity", (provider) => {
    const page = parseCatalogPage(`<h1 class="entry-title">Download Example (2025) Hindi-English WEB-DL</h1><div class="entry-content">
      <a href="https://www.imdb.com/title/tt1234567/">IMDb</a><h2>Storyline</h2><p><a href="https://ads.example/ad">Download</a></p>
      <h4>Example (2025) 720p x264 [1.1GB]</h4><p><a href="https://hubcloud.ist/drive/abc">Download Links</a></p>
      <p><strong>Example.2025.2160p.H.265 [12.5GB]</strong></p><p><a class="maxbutton" href="https://hubcloud.ist/drive/def">Download G-Drive</a></p>
      <h5>Watch Trailer</h5><a href="https://youtube.com/watch?v=123">Watch</a>
      <div class="related-posts"><h4>Other 1080p</h4><a href="https://ads.example/other">Download</a></div></div>`, `${config.baseUrl}/download-example-2025/`, { ...config, provider });
    expect(page).toMatchObject({ title: "Example", year: 2025, mediaType: "movie", imdbId: "tt1234567" });
    expect(page.links).toHaveLength(2);
    expect(page.links[0]).toMatchObject({ resolution: 720, codec: "H.264", size: "1.1GB", releaseYear: 2025 });
    expect(page.links[1]).toMatchObject({ resolution: 2160, codec: "HEVC", size: "12.5GB" });
  });
  it("keeps multi-season packs and exact episode buttons separate", () => {
    const page = parseCatalogPage(`<h1>Download Example (2022) (Season 1-2)</h1><div class="entry-content">
      <p><strong>Example.S01.1080p.HEVC.rar [14GB]</strong></p><a href="https://files.example/pack">Archive Rar</a>
      <pre>Season 02</pre><p><strong>Example.S02E01.720p.H.264 [1GB]</strong></p><p>
      <a href="https://files.example/e1">Episode 1</a><a href="https://files.example/e2">Episode 2</a></p>
      <h3>Season 2 1080p</h3><a href="https://files.example/collection">Episode Links</a></div>`, `${config.baseUrl}/download-example/`, config);
    expect(page.links).toHaveLength(4);
    expect(page.links[1].size).toBe("1GB");
    expect(page.links[2].size).toBeNull();
    expect(page.links.map(({ season, episode, scope }) => ({ season, episode, scope }))).toEqual([
      { season: 1, episode: null, scope: "season" }, { season: 2, episode: 1, scope: "episode" },
      { season: 2, episode: 2, scope: "episode" }, { season: 2, episode: null, scope: "season" },
    ]);
  });
  it("retains published watch buttons but never trailers, private URLs or scripts", () => {
    const page = parseCatalogPage(`<h1>Download Example (2025)</h1><div class="entry-content"><h3>Watch Online</h3>
      <a href="https://player.example/movie/1">Watch</a><a href="http://127.0.0.1/a">Watch</a>
      <a href="javascript:alert(1)">Watch</a><h4>Watch Trailer</h4><a href="https://youtube.com/1">Watch</a></div>`, `${config.baseUrl}/example/`, config);
    expect(page.links).toHaveLength(1);
    expect(page.links[0]).toMatchObject({ kind: "watch", scope: "movie", verification: "unverified" });
  });
});


it("uses the first broadcast year of a series year range for strict matching", () => {
  const page = parseCatalogPage(`<h1>Download Example (Season 1-5) (2008-2013) English</h1><div class="entry-content"><p>Example.S02.1080p.HEVC</p><a href="https://files.example/e3">Episode 3</a></div>`, `${config.baseUrl}/download-example/`, config);
  expect(page).toMatchObject({ title: "Example", year: 2008, mediaType: "tv" });
  expect(page.links[0]).toMatchObject({ season: 2, episode: 3, scope: "episode" });
});


it("retains episode metadata in a link's heading and abbreviated episode buttons", () => {
  const page = parseCatalogPage(`<h1>Download Example (Season 2)</h1><div class="entry-content"><h3>Season 2 Episode 3 720p <a href="https://files.example/e3">Download</a></h3><h3>Season 2 1080p</h3><a href="https://files.example/e4">EP-04</a></div>`, `${config.baseUrl}/download-example/`, config);
  expect(page.links.map(({ episode, resolution }) => ({ episode, resolution }))).toEqual([{ episode: 3, resolution: 720 }, { episode: 4, resolution: 1080 }]);
});
