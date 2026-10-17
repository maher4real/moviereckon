import { describe, expect, it } from "vitest";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import { buildTodaysPicks, pickKey, type PickCandidate } from "./todaysPicks";

const NOW = Date.parse("2026-10-17T12:00:00Z");

function movie(id: number, overrides: Partial<Movie> = {}): Movie {
  return {
    id, title: `Movie ${id}`, original_title: `Movie ${id}`, overview: "", poster_path: `/m${id}.jpg`, backdrop_path: null,
    release_date: "2019-05-01", vote_average: 7.4, vote_count: 900, popularity: 50, genre_ids: [18], original_language: "en",
    adult: false, video: false, ...overrides,
  };
}
function show(id: number, overrides: Partial<TVShow> = {}): TVShow {
  return {
    id, name: `Show ${id}`, original_name: `Show ${id}`, overview: "", poster_path: `/s${id}.jpg`, backdrop_path: null,
    first_air_date: "2020-03-01", vote_average: 7.9, vote_count: 700, popularity: 40, genre_ids: [18], original_language: "en",
    origin_country: [], ...overrides,
  };
}
const feed = (item: Movie | TVShow, reason?: string): PickCandidate => ({ item, reason, source: "feed" });

describe("buildTodaysPicks", () => {
  it("returns a movie/series mix instead of six titles of one kind", () => {
    const pool = [...Array.from({ length: 10 }, (_, i) => feed(movie(i + 1))), ...Array.from({ length: 10 }, (_, i) => feed(show(i + 1)))];
    const picks = buildTodaysPicks(pool, { now: NOW });
    expect(picks).toHaveLength(6);
    expect(picks.filter((p) => p.type === "movie")).toHaveLength(3);
    expect(picks.filter((p) => p.type === "tv")).toHaveLength(3);
  });

  it("alternates type after the lead so the grid reads as a mix", () => {
    const pool = [...Array.from({ length: 6 }, (_, i) => feed(movie(i + 1))), ...Array.from({ length: 6 }, (_, i) => feed(show(i + 1)))];
    const types = buildTodaysPicks(pool, { now: NOW }).map((p) => p.type);
    for (let i = 1; i < types.length; i += 1) expect(types[i]).not.toBe(types[i - 1]);
  });

  it("spreads picks across genres and languages when the pool allows it", () => {
    const genres = [18, 35, 53, 878, 27, 10749];
    const pool = Array.from({ length: 24 }, (_, i) =>
      feed(i % 2 ? show(i, { genre_ids: [genres[i % 6]], original_language: i % 3 ? "en" : "ko" }) : movie(i, { genre_ids: [genres[i % 6]], original_language: i % 3 ? "hi" : "en" })));
    const picks = buildTodaysPicks(pool, { now: NOW });
    expect(new Set(picks.map((p) => p.item.genre_ids[0])).size).toBeGreaterThanOrEqual(5);
    expect(new Set(picks.map((p) => p.item.original_language)).size).toBeGreaterThanOrEqual(3);
  });

  it("skips watched titles, duplicates, posterless and low-signal titles", () => {
    const pool = [
      feed(movie(1)), feed(movie(1)), feed(movie(2)),
      feed(movie(3, { poster_path: null })),
      feed(movie(4, { vote_count: 3, vote_average: 9.5 })),
      feed(movie(5, { vote_average: 4.1 })),
      feed(show(6)),
    ];
    const picks = buildTodaysPicks(pool, { excludeKeys: new Set([pickKey(movie(2))]), now: NOW });
    expect(picks.map((p) => p.key).sort()).toEqual(["movie_1", "tv_6"]);
  });

  it("keeps brand-new releases that have no votes yet", () => {
    const fresh = movie(9, { release_date: "2026-09-20", vote_count: 0, vote_average: 0 });
    const picks = buildTodaysPicks([feed(fresh)], { now: NOW });
    expect(picks).toHaveLength(1);
    expect(picks[0].reason).toBe("Fresh release");
  });

  it("honours the type filter and fills the whole count from that type", () => {
    const pool = [...Array.from({ length: 8 }, (_, i) => feed(movie(i + 1))), ...Array.from({ length: 8 }, (_, i) => feed(show(i + 1)))];
    const picks = buildTodaysPicks(pool, { filter: "tv", now: NOW });
    expect(picks).toHaveLength(6);
    expect(picks.every((p) => p.type === "tv")).toBe(true);
  });

  it("relaxes the split when one type runs out", () => {
    const pool = [...Array.from({ length: 8 }, (_, i) => feed(movie(i + 1))), feed(show(1))];
    const picks = buildTodaysPicks(pool, { now: NOW });
    expect(picks).toHaveLength(6);
    expect(picks.filter((p) => p.type === "tv")).toHaveLength(1);
  });

  it("prefers the feed's own reason and lets a saved title through the quality gate", () => {
    const saved = movie(7, { vote_count: 2, vote_average: 5 });
    const picks = buildTodaysPicks([feed(movie(1), "Matches your selected thrillers"), { item: saved, source: "watchlist" }], { now: NOW });
    expect(picks.find((p) => p.key === "movie_1")?.reason).toBe("Matches your selected thrillers");
    expect(picks.find((p) => p.key === "movie_7")?.reason).toBe("Waiting in your watchlist");
  });

  it("is deterministic per seed and changes with a new seed", () => {
    const pool = Array.from({ length: 30 }, (_, i) => feed(i % 2 ? show(i, { genre_ids: [18 + (i % 5)] }) : movie(i, { genre_ids: [18 + (i % 5)] })));
    const keys = (seed: number) => buildTodaysPicks(pool, { seed, now: NOW }).map((p) => p.key).join();
    expect(keys(1)).toBe(keys(1));
    expect(new Set([keys(1), keys(2), keys(3), keys(4)]).size).toBeGreaterThan(1);
  });

  it("returns nothing for an empty or fully excluded pool", () => {
    expect(buildTodaysPicks([], { now: NOW })).toEqual([]);
    expect(buildTodaysPicks([feed(movie(1))], { excludeKeys: new Set(["movie_1"]), now: NOW })).toEqual([]);
  });
});
