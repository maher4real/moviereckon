import { describe, expect, it, vi } from "vitest";
import { normalizeTmdbItem } from "@/shared/lib/recommendation";
import { enrichCandidatesWithKeywords } from "./recommendation-metadata";

function movie(id: number) {
  return normalizeTmdbItem(
    {
      id,
      title: `Movie ${id}`,
      overview: "A contained thriller.",
      genre_ids: [53],
      release_date: "2024-01-01",
      vote_average: 7.5,
      vote_count: 1000,
      popularity: 80,
      original_language: "en",
    },
    { typeHint: "movie", sourceTag: "test" },
  )!;
}

describe("recommendation metadata enrichment", () => {
  it("adds TMDB keywords to bounded candidates", async () => {
    const fetchMovieKeywords = vi.fn(async () => [
      { id: 1, name: "time loop" },
      { id: 2, name: "survival" },
    ]);
    const fetchTVKeywords = vi.fn(async () => []);

    const enriched = await enrichCandidatesWithKeywords([movie(1)], {
      fetchMovieKeywords,
      fetchTVKeywords,
      limit: 1,
    });

    expect(fetchMovieKeywords).toHaveBeenCalledWith(1);
    expect(enriched[0].keywords.map((keyword) => keyword.name)).toContain(
      "time loop",
    );
    expect(enriched[0].keywordTokens).toContain("survival");
  });

  it("keeps original candidates when keyword lookup fails", async () => {
    const candidate = movie(2);
    const enriched = await enrichCandidatesWithKeywords([candidate], {
      fetchMovieKeywords: vi.fn(async () => {
        throw new Error("tmdb failed");
      }),
      fetchTVKeywords: vi.fn(async () => []),
      limit: 1,
    });

    expect(enriched[0].key).toBe(candidate.key);
    expect(enriched[0].keywords).toEqual(candidate.keywords);
  });
});
