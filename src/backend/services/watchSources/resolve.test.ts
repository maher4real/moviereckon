import { describe, expect, it, vi } from "vitest";
import { parsePlayerMedia, resolveWatchMedia } from "./resolve";
import { directMediaFormat, isResolvablePlayer } from "@/shared/lib/watchSources";
import { parseSourcePage } from "./parser";

const link = parseSourcePage('<h1>Example (2025)</h1><h2>DOWNLOAD LINKS</h2><a href="https://play4u.org/tt1234567">WATCH</a>', "https://source.example/movie/").links[0];
const identity = { contentId: 42, contentType: "movie" as const };
const data = { ok: true, movie: { tmdb_id: 42, imdb_id: "tt1234567", type_slug: "movie" },
  streams: [{ m3u8_url: "https://media.example/movie.jpg?token=short-lived" }] };
const html = (value: unknown) => `<script>window.__PA_PLAY__ = ${JSON.stringify(value)};</script>`;

describe("direct media resolution", () => {
  it("reads only published player JSON, checks both identities and accepts explicit HLS URLs without relying on extensions", () => {
    expect(parsePlayerMedia(html(data), link.url, identity)).toEqual([
      { url: data.streams[0].m3u8_url, format: "hls", label: "Stream 1 · Auto quality" },
    ]);
    expect(parsePlayerMedia(html(data), link.url, { ...identity, contentId: 43 })).toEqual([]);
    expect(parsePlayerMedia(html(data), "https://play4u.org/tt7654321", identity)).toEqual([]);
    expect(parsePlayerMedia(html(data), link.url, { ...identity, contentType: "tv" })).toEqual([]);
  });
  it("does not execute scripts or accept private URLs, malformed data, trailers or a different media type", () => {
    expect(parsePlayerMedia('<script>window.__PA_PLAY__ = (() => { throw Error("execute"); })();</script>', link.url, identity)).toEqual([]);
    expect(parsePlayerMedia(html({ ...data, movie: { ...data.movie, type_slug: "tv" } }), link.url, identity)).toEqual([]);
    for (const value of ["http://127.0.0.1/media", "https://[::1]/video", "javascript:alert(1)", "https://user:pass@media.example/file", "http://media.example/file"]) {
      expect(parsePlayerMedia(html({ ...data, streams: [{ m3u8_url: value }] }), link.url, identity)).toEqual([]);
    }
  });
  it("fetches only the supported origin on demand and does not follow arbitrary external pages", async () => {
    const fetch = vi.fn().mockResolvedValue({ html: html(data), etag: null, lastModified: null });
    expect(await resolveWatchMedia(link, identity, fetch)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(link.url, "https://play4u.org");
    fetch.mockClear();
    for (const url of ["https://play4u.org.evil.example/tt1234567", "https://play4u.org/tt1234567?next=private", "https://hubstream.art/#episode", "https://other.example/file"]) {
      expect(await resolveWatchMedia({ ...link, url }, identity, fetch)).toEqual([]);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(isResolvablePlayer({ ...link, scope: "episode", season: 1, episode: 1 })).toBe(false);
  });
  it("supports an explicitly scoped episode file without fetching video bytes on the server", async () => {
    const fetch = vi.fn();
    const episode = { ...link, url: "https://media.example/s1e2.mp4?token=123", scope: "episode" as const, season: 1, episode: 2 };
    expect(await resolveWatchMedia(episode, { ...identity, contentType: "tv" }, fetch)).toMatchObject([{ url: episode.url, format: "mp4" }]);
    expect(await resolveWatchMedia({ ...episode, scope: "season" }, identity, fetch)).toEqual([]);
    expect(await resolveWatchMedia({ ...episode, scope: "episode-range", episodeEnd: 3 }, identity, fetch)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not mistake a page URL or a query parameter for a direct file", () => {
    expect(directMediaFormat("https://media.example/movie.webm")).toBe("webm");
    expect(directMediaFormat("https://media.example/movie.m3u8?token=123")).toBe("hls");
    for (const url of ["https://site.example/?file=movie.mp4", "https://site.example/movie.mp4/page", "http://localhost/file.mp4", "https://127.0.0.1/file.mp4", "https://[::1]/file.mp4"]) {
      expect(directMediaFormat(url)).toBeNull();
    }
  });
});
