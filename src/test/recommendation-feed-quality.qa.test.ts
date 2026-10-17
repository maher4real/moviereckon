import { describe, expect, it, vi } from "vitest";
import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";
import { buildTasteProfile } from "@/shared/lib/recommendation/taste";
import { passesQualityFloor, rankCandidatesForTaste, scoreCandidate } from "@/backend/api/_handlers/user/recommendations-v2";
import { NOW, TRUE_GENRES, buildCatalogue, eventsFromItems, precisionAt } from "./helpers/coldStartFixture";

vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/backend/services/tmdbServer", () => ({ discoverServerMovies: vi.fn(), discoverServerTVShows: vi.fn() }));

function movie(overrides: Record<string, unknown>): UnifiedContentItem {
  const item = normalizeTmdbItem(
    { title: "Fixture", original_language: "en", release_date: "2018-06-01", vote_average: 7, vote_count: 2000, popularity: 60, ...overrides },
    { typeHint: "movie", useCache: false },
  );
  if (!item) throw new Error("fixture must normalize");
  return item;
}

/**
 * A viewer with a long history of dark thrillers, crime and mystery. Before
 * this change every genre saturated to the same affinity once activity piled
 * up, so the feed collapsed to "highest raw rating" and ranked worse than a
 * brand-new account.
 */
describe("feed quality for viewers with history", () => {
  const { items, relevantKeys } = buildCatalogue();
  const liked = items.filter((item) => relevantKeys.has(item.key)).slice(0, 40);
  const likedKeys = new Set(liked.map((item) => item.key));
  const candidates = items.filter((item) => !likedKeys.has(item.key));
  const rich = buildTasteProfile(eventsFromItems(liked), { preferredGenres: [53], preferredLanguages: ["en"] }, null, NOW);

  // Before this change the top 10 was ranked by raw rating alone (precision
  // 0.0-0.1, several off-taste and 30-vote titles). Remaining misses are about
  // release era: activity records carry no year, so a 2010s-only habit cannot
  // be learned from history yet, only from explicit era picks.
  it("fills a rich-history viewer's top 10 with their core genres", () => {
    const top = rankCandidatesForTaste(candidates, rich, [], { exploration: "familiar" }).slice(0, 10);
    const onTaste = top.filter(({ item }) => item.genreIds.some((genreId) => TRUE_GENRES.includes(genreId)));
    expect(onTaste.length).toBeGreaterThanOrEqual(9);
    expect(precisionAt(top, relevantKeys, 10)).toBeGreaterThanOrEqual(0.2);
  });

  it("separates a core genre from a rarely-watched one instead of saturating both", () => {
    const core = scoreCandidate(movie({ id: 9001, genre_ids: [9648] }), rich);
    const fringe = scoreCandidate(movie({ id: 9002, genre_ids: [10751, 99] }), rich);
    expect(core.explanation.scoreBreakdown.genre - fringe.explanation.scoreBreakdown.genre).toBeGreaterThan(0.3);
  });

  it("keeps a 9.8-rated 6-vote title below a solid 7.6-rated title for an experienced viewer too", () => {
    const junk = scoreCandidate(movie({ id: 9003, genre_ids: [53], vote_average: 9.8, vote_count: 6 }), rich);
    const solid = scoreCandidate(movie({ id: 9004, genre_ids: [53], vote_average: 7.6, vote_count: 4000 }), rich);
    expect(solid.score).toBeGreaterThan(junk.score);
  });
});

describe("diversity of the final ranking", () => {
  it("does not let one franchise fill the top of the feed", () => {
    const profile = buildTasteProfile([], { preferredGenres: [28], preferredLanguages: ["en"] }, null, NOW);
    const franchise = Array.from({ length: 6 }, (_, index) =>
      movie({ id: 100 + index, genre_ids: [28, 12], belongs_to_collection: { id: 77 }, vote_average: 7.4 }));
    const others = Array.from({ length: 6 }, (_, index) =>
      movie({ id: 200 + index, genre_ids: [28, index % 2 ? 53 : 80], vote_average: 7.1 }));
    const top = rankCandidatesForTaste([...franchise, ...others], profile).slice(0, 6);
    expect(top.filter(({ item }) => item.collectionId === 77).length).toBeLessThanOrEqual(3);
  });

  it("keeps strict ordering when the viewer sorts by rating", () => {
    const profile = buildTasteProfile([], { preferredGenres: [28] }, null, NOW);
    const pool = [7.1, 8.4, 6.2, 7.9].map((rating, index) => movie({ id: 300 + index, genre_ids: [28], vote_average: rating }));
    const ratings = rankCandidatesForTaste(pool, profile, [], { sort: "rating" }).map(({ item }) => item.voteAverage);
    expect(ratings).toEqual([8.4, 7.9, 7.1, 6.2]);
  });
});

describe("adventurous mode", () => {
  it("lifts titles outside the viewer's usual genres relative to familiar mode", () => {
    const { items, relevantKeys } = buildCatalogue();
    const liked = items.filter((item) => relevantKeys.has(item.key)).slice(0, 40);
    const profile = buildTasteProfile(eventsFromItems(liked), {}, null, NOW);
    const outside = movie({ id: 9100, genre_ids: [35], vote_average: 8.1, vote_count: 6000 });
    const inside = movie({ id: 9101, genre_ids: [9648], vote_average: 7.0, vote_count: 3000 });
    const gap = (mode: "familiar" | "adventurous") =>
      scoreCandidate(inside, profile, mode).score - scoreCandidate(outside, profile, mode).score;
    expect(gap("adventurous")).toBeLessThan(gap("familiar") - 0.05);
  });
});

describe("quality floor", () => {
  const now = Date.parse(NOW);
  it("drops older titles with almost no votes", () => {
    expect(passesQualityFloor(movie({ id: 1, vote_count: 4, release_date: "2015-01-01" }), now)).toBe(false);
  });
  it("keeps fresh releases that have not collected votes yet", () => {
    expect(passesQualityFloor(movie({ id: 2, vote_count: 0, release_date: "2026-08-20" }), now)).toBe(true);
  });
  it("keeps well-voted titles", () => {
    expect(passesQualityFloor(movie({ id: 3, vote_count: 250, release_date: "1999-01-01" }), now)).toBe(true);
  });
});
