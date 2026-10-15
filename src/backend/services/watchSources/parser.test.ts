import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discoverSourcePages, parseSourcePage, publicLink } from "./parser";

const base = "https://new7.hdhub4u.cl";
const fixture = (name: string) => readFileSync(`${process.cwd()}/src/backend/services/watchSources/fixtures/${name}.html`, "utf8");

describe("published source links", () => {
  it("keeps published direct files even without a quality label and preserves episode scope", () => {
    const page = parseSourcePage(`<h1>Example (Season 1)</h1><h2>DOWNLOAD LINKS</h2><h3>Episode 2</h3>
      <a href="https://media.example/s1e2.mp4?token=abc">Download</a>
      <a href="https://media.example/s1e2.m3u8">Watch</a>`, `${base}/example/`);
    expect(page.links).toHaveLength(2);
    expect(page.links.every((link) => link.scope === "episode" && link.season === 1 && link.episode === 2)).toBe(true);
  });
  it("collects all movie quality, player and collection links with metadata", () => {
    const page = parseSourcePage(fixture("movie"), `${base}/weapons-2025-hindi-studio-dub-bluray-full-movie/`);
    expect(page).toMatchObject({ title: "Weapons", year: 2025, imdbId: "tt26581740", mediaType: "movie" });
    expect(page.links).toHaveLength(10);
    expect(page.links.filter((link) => link.kind === "watch")).toHaveLength(2);
    expect(page.links.filter((link) => link.kind === "download").map((link) => link.resolution)).toEqual([480, 720, 720, 1080, 1080, 1080, 2160]);
    expect(page.links[1]).toMatchObject({ codec: "HEVC", bitDepth: 10, size: "1GB", languages: ["hindi", "english"], verification: "unverified" });
    expect(page.links.at(-1)?.kind).toBe("collection");
    expect(page.links.every((link) => link.scope === "movie" && link.episode === null)).toBe(true);
    expect(page.links.some((link) => /youtube|advert|comment/.test(link.url))).toBe(false);
  });

  it("keeps season packs separate and inherits the episode and row quality for Drive/Watch labels", () => {
    const page = parseSourcePage(fixture("series"), `${base}/the-trap-season-1-webrip-hindi-full-series/`);
    expect(page).toMatchObject({ title: "The Trap", mediaType: "tv", season: 1 });
    expect(page.links.filter((link) => link.scope === "season")).toHaveLength(6);
    expect(page.links.filter((link) => link.scope === "episode")).toHaveLength(30);
    const watch = page.links.filter((link) => link.kind === "watch");
    expect(watch).toHaveLength(6);
    expect(watch.map((link) => link.episode)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(watch.every((link) => link.resolution === 720 && link.season === 1 && link.codec === "H.264")).toBe(true);
    expect(watch[0].url).toContain("#jw3f1m");
  });

  it("handles episode ranges, duplicate links and rejects unsafe or unrelated destinations", () => {
    const html = `<h1>Example (Season 2) [English]</h1><h2>DOWNLOAD LINKS</h2>
      <h3>EPISODES 1–3</h3><h4>1080p <a href="https://host.example/watch">WATCH</a></h4>
      <h4>1080p <a href="https://host.example/watch">WATCH</a></h4>
      <a href="javascript:alert(1)">720p</a><a href="http://127.0.0.1/movie">720p</a>
      <a href="https://user:password@host.example/movie">720p</a>
      <h2>Storyline</h2><a href="https://host.example/advert">WATCH</a>`;
    const page = parseSourcePage(html, `${base}/example/`);
    expect(page.links).toHaveLength(1);
    expect(page.links[0]).toMatchObject({ scope: "episode-range", season: 2, episode: 1, episodeEnd: 3 });
    expect(publicLink("https://[::1]/foo", base)).toBeNull();
  });

  it("discovers unique same-origin post pages and excludes navigation", () => {
    const html = `<a href="/example-2025-full-movie/">Movie</a><a href="/example-2025-full-movie/">Again</a>
      <a href="/example-season-1-all-episodes/">TV</a><a href="/category/movies/">Category</a>
      <a href="https://other.example/example-full-movie/">Other</a><a href="/example-full-movie/?ad=1">Ad</a>`;
    expect(discoverSourcePages(html, base)).toEqual([`${base}/example-2025-full-movie/`, `${base}/example-season-1-all-episodes/`]);
  });
});
