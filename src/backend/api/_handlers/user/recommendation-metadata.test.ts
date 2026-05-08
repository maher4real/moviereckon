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

function movieWithKeywords(id: number) {
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
      keywords: [{ id: 10, name: "heist" }],
    },
    { typeHint: "movie", sourceTag: "test" },
  )!;
}

function tv(id: number) {
  return normalizeTmdbItem(
    {
      id,
      name: `Show ${id}`,
      overview: "A contained mystery.",
      genre_ids: [9648],
      first_air_date: "2024-01-01",
      vote_average: 7.5,
      vote_count: 1000,
      popularity: 80,
      original_language: "en",
    },
    { typeHint: "tv", sourceTag: "test" },
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

  it("respects limit across multiple candidates", async () => {
    const candidates = [movie(6), movie(7), movie(8)];
    const fetchMovieKeywords = vi.fn(async (id: number) => [
      { id, name: `keyword ${id}` },
    ]);

    const enriched = await enrichCandidatesWithKeywords(candidates, {
      fetchMovieKeywords,
      fetchTVKeywords: vi.fn(async () => []),
      limit: 2,
    });

    expect(fetchMovieKeywords).toHaveBeenCalledTimes(2);
    expect(fetchMovieKeywords).toHaveBeenCalledWith(6);
    expect(fetchMovieKeywords).toHaveBeenCalledWith(7);
    expect(enriched[0].keywords.map((keyword) => keyword.name)).toContain(
      "keyword 6",
    );
    expect(enriched[1].keywords.map((keyword) => keyword.name)).toContain(
      "keyword 7",
    );
    expect(enriched[2]).toBe(candidates[2]);
  });

  it("skips candidates that already have keywords", async () => {
    const candidate = movieWithKeywords(4);
    const fetchMovieKeywords = vi.fn(async () => [{ id: 20, name: "new keyword" }]);

    const enriched = await enrichCandidatesWithKeywords([candidate], {
      fetchMovieKeywords,
      fetchTVKeywords: vi.fn(async () => []),
      limit: 1,
    });

    expect(fetchMovieKeywords).not.toHaveBeenCalled();
    expect(enriched[0]).toBe(candidate);
    expect(enriched[0].keywordTokens).toContain("heist");
  });

  it("enriches TV candidates using fetchTVKeywords", async () => {
    const fetchTVKeywords = vi.fn(async () => [
      { id: 30, name: "small town" },
      { id: 31, name: "cold case" },
    ]);

    const enriched = await enrichCandidatesWithKeywords([tv(5)], {
      fetchMovieKeywords: vi.fn(async () => []),
      fetchTVKeywords,
      limit: 1,
    });

    expect(fetchTVKeywords).toHaveBeenCalledWith(5);
    expect(enriched[0].keywords.map((keyword) => keyword.name)).toContain(
      "small town",
    );
    expect(enriched[0].keywords.map((keyword) => keyword.name)).toContain(
      "cold case",
    );
  });

  it("limits concurrent keyword lookups", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMovieKeywords = vi.fn(async (id: number) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return [{ id, name: `keyword ${id}` }];
    });

    await enrichCandidatesWithKeywords([movie(11), movie(12), movie(13), movie(14)], {
      fetchMovieKeywords,
      fetchTVKeywords: vi.fn(async () => []),
      limit: 4,
      concurrency: 2,
    });

    expect(fetchMovieKeywords).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("stops scheduling keyword lookups after the deadline expires", async () => {
    vi.useFakeTimers();

    try {
      const fetchMovieKeywords = vi.fn(
        (id: number) =>
          new Promise<{ id: number; name: string }[]>((resolve) => {
            setTimeout(() => resolve([{ id, name: `keyword ${id}` }]), 10);
          }),
      );

      const enrichment = enrichCandidatesWithKeywords(
        [movie(21), movie(22), movie(23), movie(24), movie(25)],
        {
          fetchMovieKeywords,
          fetchTVKeywords: vi.fn(async () => []),
          limit: 5,
          concurrency: 2,
          deadlineMs: 5,
        },
      );

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMovieKeywords).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(100);
      await enrichment;

      expect(fetchMovieKeywords).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
