import { describe, expect, it } from "vitest";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import { buildTop10, freshReleases, homeItemKey, interleaveBlend, libraryItemToCard } from "./homeBlend";

const NOW = Date.parse("2026-10-23T12:00:00Z");

function movie(id: number, language = "en", release_date = "2024-05-01", extra: Partial<Movie> = {}): Movie {
  return {
    id, title: `Movie ${id}`, original_title: `Movie ${id}`, overview: "", poster_path: `/m${id}.jpg`, backdrop_path: null,
    release_date, vote_average: 7, vote_count: 500, popularity: 50, genre_ids: [28], original_language: language,
    adult: false, video: false, ...extra,
  };
}

function series(id: number, first_air_date = "2024-01-01"): TVShow {
  return {
    id, name: `Series ${id}`, original_name: `Series ${id}`, overview: "", poster_path: `/t${id}.jpg`, backdrop_path: null,
    first_air_date, vote_average: 8, vote_count: 300, popularity: 40, genre_ids: [18], original_language: "en", origin_country: ["US"],
  };
}

describe("home blending", () => {
  it("interleaves sources so each appears near the front", () => {
    const hollywood = [movie(1), movie(2), movie(3)];
    const bollywood = [movie(11, "hi"), movie(12, "hi")];
    const shows = [series(21)];
    const blended = interleaveBlend([hollywood, bollywood, shows], { now: NOW });
    expect(blended.map(homeItemKey)).toEqual(["movie:1", "movie:11", "tv:21", "movie:2", "movie:12", "movie:3"]);
  });

  it("drops duplicates, unreleased, posterless and anime titles", () => {
    const blended = interleaveBlend([
      [movie(1), movie(2, "en", "2027-01-01"), movie(3, "en", "2024-01-01", { poster_path: null })],
      [movie(1), movie(4, "ja", "2024-01-01", { genre_ids: [16] }), movie(5, "hi")],
    ], { now: NOW });
    expect(blended.map((item) => item.id)).toEqual([1, 5]);
  });

  it("respects the limit and excluded keys", () => {
    const blended = interleaveBlend([[movie(1), movie(2), movie(3)]], { now: NOW, limit: 2, exclude: new Set(["movie:1"]) });
    expect(blended.map((item) => item.id)).toEqual([2, 3]);
  });

  it("keeps only recent releases, newest first", () => {
    const items = [movie(1, "en", "2026-10-01"), movie(2, "hi", "2026-09-15"), movie(3, "en", "2026-03-01"), movie(4, "en", "2026-11-30")];
    expect(freshReleases(items, 60, NOW).map((item) => item.id)).toEqual([1, 2]);
  });

  it("builds a ten-title top list that alternates films and series", () => {
    const top = buildTop10(Array.from({ length: 8 }, (_, index) => movie(index + 1)), Array.from({ length: 8 }, (_, index) => series(index + 100)), NOW);
    expect(top).toHaveLength(10);
    expect(top.slice(0, 4).map(homeItemKey)).toEqual(["movie:1", "tv:100", "movie:2", "tv:101"]);
  });

  it("turns library rows into routable cards", () => {
    const card = libraryItemToCard({ content_id: 9, content_type: "tv", title: "Saved", poster_path: "/s.jpg" });
    expect(homeItemKey(card)).toBe("tv:9");
  });
});
