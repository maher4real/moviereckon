import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "@/frontend/lib/mongodbClient";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import { buildPickPool } from "./todaysPicksSource";

const movie = (id: number): Movie => ({ id, title: `M${id}`, original_title: `M${id}`, overview: "", poster_path: "/p.jpg", backdrop_path: null, release_date: "2020-01-01", vote_average: 7, vote_count: 500, popularity: 1, genre_ids: [18], original_language: "en", adult: false, video: false });
const show = (id: number): TVShow => ({ id, name: `S${id}`, original_name: `S${id}`, overview: "", poster_path: "/p.jpg", backdrop_path: null, first_air_date: "2020-01-01", vote_average: 7, vote_count: 500, popularity: 1, genre_ids: [18], original_language: "en", origin_country: [] });
const saved = (id: number, over: Partial<WatchlistItem> = {}): WatchlistItem => ({ id: `w${id}`, user_id: "u", content_id: id, content_type: "movie", title: `Saved ${id}`, poster_path: "/s.jpg", added_at: "", position: 0, watched: false, ...over });

describe("buildPickPool", () => {
  it("orders feed, then watchlist, then trending/popular interleaved, then top rated", () => {
    const pool = buildPickPool({ feed: [movie(1)], watchlist: [saved(9)], trending: [movie(2), movie(3)], popularTv: [show(4)], topRated: [movie(5)] });
    expect(pool.map((c) => c.source)).toEqual(["feed", "watchlist", "trending", "popular", "trending", "top-rated"]);
  });

  it("carries the feed's own reason through", () => {
    const pool = buildPickPool({ feed: [movie(1)], explanations: { movie_1: { reasons: [{ label: "Because you picked Heat" }] } }, watchlist: [], trending: [], popularTv: [], topRated: [] });
    expect(pool[0].reason).toBe("Because you picked Heat");
  });

  it("only offers saved or in-progress watchlist titles, capped, and rebuilds display fields", () => {
    const watchlist = [
      saved(1), saved(2, { status: "watching" }), saved(3, { status: "completed" }), saved(4, { status: "dropped" }),
      saved(5, { watched: true }), saved(6, { content_type: "tv", genres: [10765], language: "ko" }), saved(7), saved(8), saved(9),
    ];
    const pool = buildPickPool({ feed: [], watchlist, trending: [], popularTv: [], topRated: [] });
    expect(pool).toHaveLength(4);
    expect(pool.every((c) => c.source === "watchlist")).toBe(true);
    const tv = pool.find((c) => !("title" in c.item));
    expect(tv && "name" in tv.item ? tv.item.name : "").toBe("Saved 6");
    expect(tv?.item.genre_ids).toEqual([10765]);
    expect(tv?.item.original_language).toBe("ko");
  });

  it("still returns trending and popular titles for a brand-new account", () => {
    const pool = buildPickPool({ feed: [], watchlist: [], trending: [movie(1)], popularTv: [show(2)], topRated: [] });
    expect(pool).toHaveLength(2);
  });
});
