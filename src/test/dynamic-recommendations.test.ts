import { describe, expect, it } from "vitest";
import { reorderDynamicRecommendations } from "@/frontend/lib/dynamicRecommendations";
import type { RecommendationExplanation } from "@/frontend/lib/mongodbClient";
import type { Movie } from "@/shared/lib/tmdb";

function buildMovie(
  id: number,
  language: string,
  popularity: number,
): Movie {
  return {
    id,
    title: `Movie ${id}`,
    original_title: `Movie ${id}`,
    overview: "Test overview",
    poster_path: null,
    backdrop_path: null,
    release_date: "2024-01-01",
    vote_average: 7.8,
    vote_count: 2200,
    popularity,
    genre_ids: [18, 53],
    original_language: language,
    adult: false,
    video: false,
  };
}

function buildExplanation(score: number): RecommendationExplanation {
  return {
    reasons: [{ label: "Strong match" }],
    score,
    scoreBreakdown: {
      genre: 0.2,
      keywords: 0.2,
      people: 0.1,
      year: 0.05,
      runtime: 0.03,
      quality: 0.12,
      popularity: 0.1,
      novelty: 0.05,
      diversityPenalty: 0,
    },
    seedTitle: "Seed",
  };
}

describe("dynamic recommendation ordering", () => {
  it("keeps the same recommendation set while rotating the top window", () => {
    const items = [
      buildMovie(1, "en", 120),
      buildMovie(2, "en", 118),
      buildMovie(3, "hi", 112),
      buildMovie(4, "ta", 110),
      buildMovie(5, "en", 108),
      buildMovie(6, "ko", 106),
      buildMovie(7, "ja", 104),
      buildMovie(8, "es", 102),
    ];

    const explanationById = Object.fromEntries(
      items.map((item, index) => [
        `movie_${item.id}`,
        buildExplanation(0.88 - index * 0.018),
      ]),
    );

    const first = reorderDynamicRecommendations(items, explanationById, "slot-a");
    const second = reorderDynamicRecommendations(items, explanationById, "slot-b");

    expect(first.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      items.map((item) => item.id).sort((a, b) => a - b),
    );
    expect(second.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      items.map((item) => item.id).sort((a, b) => a - b),
    );
    expect(first.slice(0, 6).map((item) => item.id)).not.toEqual(
      second.slice(0, 6).map((item) => item.id),
    );
  });

  it("keeps the highest-scoring recommendation near the front", () => {
    const items = [
      buildMovie(11, "en", 140),
      buildMovie(12, "hi", 126),
      buildMovie(13, "ta", 122),
      buildMovie(14, "en", 118),
      buildMovie(15, "ja", 114),
      buildMovie(16, "ko", 112),
    ];

    const explanationById = Object.fromEntries(
      items.map((item, index) => [
        `movie_${item.id}`,
        buildExplanation(0.93 - index * 0.03),
      ]),
    );

    const reordered = reorderDynamicRecommendations(items, explanationById, "slot-c");
    const topThreeIds = reordered.slice(0, 3).map((item) => item.id);

    expect(topThreeIds).toContain(11);
  });
});
