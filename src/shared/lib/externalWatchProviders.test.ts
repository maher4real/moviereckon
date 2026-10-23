import { describe, expect, it } from "vitest";
import { externalWatchProviders } from "./externalWatchProviders";
describe("external player destinations", () => {
  it("uses TMDB movie IDs and exact selected TV episodes", () => {
    expect(externalWatchProviders({ contentId: 42, contentType: "movie" }).map((p) => p.url)).toEqual([
      "https://vidlink.pro/movie/42?autoplay=false",
    ]);
    expect(externalWatchProviders({ contentId: 42, contentType: "tv" }, 2, 3).map((p) => p.url)).toEqual([
      "https://vidlink.pro/tv/42/2/3?autoplay=false",
    ]);
  });
  it("requires an exact episode without inventing a season or episode", () => {
    expect(externalWatchProviders({ contentId: 42, contentType: "tv" })).toEqual([]);
    expect(externalWatchProviders({ contentId: 42, contentType: "tv" }, 2)).toEqual([]);
  });
  it("rejects invalid IDs and episodes while allowing season zero specials", () => {
    expect(externalWatchProviders({ contentId: NaN, contentType: "movie" })).toEqual([]);
    expect(externalWatchProviders({ contentId: 42, contentType: "tv" }, 1, 0)).toEqual([]);
    expect(externalWatchProviders({ contentId: 42, contentType: "tv" }, -1, 1)).toEqual([]);
    expect(externalWatchProviders({ contentId: 42, contentType: "tv" }, 0, 1)).toHaveLength(1);
  });
});
