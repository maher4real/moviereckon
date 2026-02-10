import { describe, expect, it } from "vitest";
import {
  getRecommendations,
  normalizeTmdbItem,
  scoreCandidate,
} from "@/lib/recommendation";

function buildMovie(
  id: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title: `Movie ${id}`,
    overview: "A futuristic thriller about survival and identity.",
    genre_ids: [878, 53],
    release_date: "2020-01-01",
    vote_average: 7.8,
    vote_count: 4200,
    popularity: 100,
    runtime: 120,
    keywords: [
      { id: 1, name: "future" },
      { id: 2, name: "survival" },
    ],
    cast: [
      { id: 10, name: "Actor A", order: 0 },
      { id: 11, name: "Actor B", order: 1 },
    ],
    crew: [{ id: 99, name: "Director D", job: "Director" }],
    ...overrides,
  };
}

describe("recommendation engine scoring", () => {
  it("ranks strong content matches above weak matches", () => {
    const seed = normalizeTmdbItem(buildMovie(100))!;
    const strongCandidate = normalizeTmdbItem(buildMovie(101, { popularity: 80 }))!;
    const weakCandidate = normalizeTmdbItem(
      buildMovie(102, {
        title: "Romantic Comedy 102",
        genre_ids: [35, 10749],
        release_date: "1985-01-01",
        runtime: 85,
        keywords: [{ id: 901, name: "wedding" }],
        cast: [{ id: 300, name: "Different Lead", order: 0 }],
        crew: [{ id: 301, name: "Another Director", job: "Director" }],
        vote_average: 6.2,
        vote_count: 90,
        popularity: 12,
      }),
    )!;

    const strongScore = scoreCandidate(seed, strongCandidate);
    const weakScore = scoreCandidate(seed, weakCandidate);

    expect(strongScore.score).toBeGreaterThan(weakScore.score);
    expect(strongScore.reasons.length).toBeGreaterThanOrEqual(2);
    expect(strongScore.reasons.length).toBeLessThanOrEqual(3);
  });

  it("applies novelty boost to unseen candidates", () => {
    const seed = normalizeTmdbItem(buildMovie(200))!;
    const candidate = normalizeTmdbItem(buildMovie(201))!;

    const unseen = scoreCandidate(seed, candidate, { seenIds: [] });
    const seen = scoreCandidate(seed, candidate, { seenIds: [candidate.key] });

    expect(unseen.score - seen.score).toBeCloseTo(0.05, 5);
  });

  it("keeps at least 30% hidden gems in top 20 when available", () => {
    const seed = normalizeTmdbItem(buildMovie(300))!;

    const mainstream = Array.from({ length: 20 }, (_, index) =>
      buildMovie(301 + index, {
        popularity: 250 - index * 3,
        vote_average: 7.6,
        vote_count: 6000,
      }),
    );

    const hiddenGems = Array.from({ length: 10 }, (_, index) =>
      buildMovie(401 + index, {
        popularity: 8 + index,
        vote_average: 7.4 + index * 0.03,
        vote_count: 700 + index * 20,
      }),
    );

    const ranked = getRecommendations(
      [seed],
      [...mainstream, ...hiddenGems],
      { maxCandidates: 200 },
    );

    const topTwenty = ranked.slice(0, 20);
    const hiddenCount = topTwenty.filter((entry) => entry.isHiddenGem).length;

    expect(hiddenCount).toBeGreaterThanOrEqual(6);
  });
});
