import { beforeEach, describe, expect, it, vi } from "vitest";

const tmdb = vi.hoisted(() => ({
  getServerMovieDetails: vi.fn(),
  getServerTVShowDetails: vi.fn(),
  getServerTVExternalIds: vi.fn(),
  getServerReviews: vi.fn(),
}));
const wikidata = vi.hoisted(() => ({ fetchWikidataRatings: vi.fn() }));
vi.mock("@/backend/services/tmdbServer", () => tmdb);
vi.mock("@/backend/services/wikidataRatings", () => wikidata);

import { loadMeterSources, MAX_REVIEW_PAGES } from "./meterSources";

const review = (id: string, rating: number | null) => ({ id, author_details: { rating } });
const rtCritics = { wikidataId: "Q127367", ratings: [{ id: "rt_critics", kind: "share", value: 91, count: 271, asOf: "2026-04-05" }] };

describe("hybrid meter sources", () => {
  beforeEach(() => {
    Object.values(tmdb).forEach((mock) => mock.mockReset());
    wikidata.fetchWikidataRatings.mockReset();
  });

  it("combines TMDB scores with Wikidata matched through TMDB's IMDb ID", async () => {
    tmdb.getServerMovieDetails.mockResolvedValue({ vote_average: 8.4, vote_count: 26000, imdb_id: "tt0120737" });
    tmdb.getServerReviews.mockImplementation(async (_type: string, _id: number, page: number) => ({
      total_pages: 2,
      results: page === 1 ? [review("a", 9), review("b", null)] : [review("c", 7), review("a", 9)],
    }));
    wikidata.fetchWikidataRatings.mockResolvedValue(rtCritics);

    const payload = await loadMeterSources("movie", 120);

    expect(wikidata.fetchWikidataRatings).toHaveBeenCalledWith("movie", 120, { imdbId: "tt0120737" });
    expect(payload.imdbId).toBe("tt0120737");
    expect(payload.tmdb).toEqual({ average: 8.4, votes: 26000, reviewerRatings: [9, 7], reviewsScanned: 3 });
    expect(payload.wikidata).toEqual(rtCritics);
  });

  it("uses TMDB's external IDs for series", async () => {
    tmdb.getServerTVShowDetails.mockResolvedValue({ vote_average: 8.9, vote_count: 15000 });
    tmdb.getServerTVExternalIds.mockResolvedValue({ imdb_id: "tt0903747" });
    tmdb.getServerReviews.mockResolvedValue({ total_pages: 1, results: [] });
    wikidata.fetchWikidataRatings.mockResolvedValue({ wikidataId: "Q1079", ratings: [] });

    await loadMeterSources("tv", 1396);
    expect(wikidata.fetchWikidataRatings).toHaveBeenCalledWith("tv", 1396, { imdbId: "tt0903747" });
  });

  it("reads at most a few review pages", async () => {
    tmdb.getServerMovieDetails.mockResolvedValue({ vote_average: 7, vote_count: 10 });
    tmdb.getServerReviews.mockResolvedValue({ total_pages: 40, results: [] });
    wikidata.fetchWikidataRatings.mockResolvedValue({ wikidataId: null, ratings: [] });
    await loadMeterSources("movie", 1);
    expect(tmdb.getServerReviews).toHaveBeenCalledTimes(MAX_REVIEW_PAGES);
  });

  it("keeps Wikidata when TMDB fails and TMDB when Wikidata fails", async () => {
    tmdb.getServerMovieDetails.mockRejectedValue(new Error("tmdb down"));
    tmdb.getServerReviews.mockRejectedValue(new Error("tmdb down"));
    wikidata.fetchWikidataRatings.mockResolvedValue(rtCritics);
    const withoutTmdb = await loadMeterSources("movie", 120);
    expect(withoutTmdb.tmdb).toBeNull();
    expect(withoutTmdb.wikidata).toEqual(rtCritics);
    expect(wikidata.fetchWikidataRatings).toHaveBeenCalledWith("movie", 120, { imdbId: null });

    tmdb.getServerMovieDetails.mockResolvedValue({ vote_average: 6.1, vote_count: 900, imdb_id: "bad-id" });
    tmdb.getServerReviews.mockResolvedValue({ total_pages: 1, results: [review("x", 5)] });
    wikidata.fetchWikidataRatings.mockRejectedValue(new Error("wikidata busy"));
    const withoutWikidata = await loadMeterSources("movie", 121);
    expect(withoutWikidata.wikidata).toBeNull();
    expect(withoutWikidata.imdbId).toBeNull();
    expect(withoutWikidata.tmdb).toMatchObject({ average: 6.1, votes: 900, reviewerRatings: [5] });
  });
});
