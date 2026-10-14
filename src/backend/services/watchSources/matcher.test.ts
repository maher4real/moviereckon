import { describe, expect, it, vi } from "vitest";
import { createContentMatcher } from "./matcher";
import type { ParsedSourcePage } from "@/shared/types/watchSources";

const page: ParsedSourcePage = { title: "Weapons", year: 2025, mediaType: "movie", imdbId: "tt26581740", season: null, links: [] };

describe("source content matching", () => {
  it("resolves an IMDb ID once per run, including concurrent requests", async () => {
    const request = vi.fn().mockResolvedValue({ movie_results: [{ id: 1078605 }], tv_results: [] });
    const match = createContentMatcher(request);
    const results = await Promise.all([match(page), match(page)]);
    expect(results[0]).toMatchObject({ status: "matched", match: { tmdbId: 1078605, mediaType: "movie", method: "imdb" } });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not replace an unmatched authoritative IMDb ID with a title guess", async () => {
    const request = vi.fn().mockResolvedValue({ movie_results: [], tv_results: [{ id: 42 }] });
    expect(await createContentMatcher(request)(page)).toMatchObject({ status: "pending", match: null });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("assigns only a unique exact title and year, and isolates movie/TV cache entries", async () => {
    const request = vi.fn().mockResolvedValue({ results: [{ id: 42, title: "Weapons", release_date: "2025-08-08" }], total_pages: 1 });
    const match = createContentMatcher(request);
    expect(await match({ ...page, imdbId: null })).toMatchObject({ status: "matched", match: { method: "title-year" } });
    expect(await match({ ...page, imdbId: null, mediaType: "tv" })).toMatchObject({ status: "pending", match: null });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("holds ambiguous, incomplete and paginated results for review", async () => {
    const candidate = { id: 42, title: "Weapons", release_date: "2025-08-08" };
    const request = vi.fn().mockResolvedValue({ results: [candidate, { ...candidate, id: 43 }], total_pages: 1 });
    expect(await createContentMatcher(request)({ ...page, imdbId: null })).toMatchObject({ status: "review", match: null });
    request.mockResolvedValue({ results: [candidate], total_pages: 2 });
    expect(await createContentMatcher(request)({ ...page, imdbId: null })).toMatchObject({ status: "review", match: null });
    expect(await createContentMatcher(request)({ ...page, imdbId: null, year: null })).toMatchObject({ status: "review", match: null });
  });

  it("evicts a failed lookup so a later attempt can recover", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue({ movie_results: [{ id: 42 }], tv_results: [] });
    const match = createContentMatcher(request);
    await expect(match(page)).rejects.toThrow("unavailable");
    expect(await match(page)).toMatchObject({ status: "matched" });
  });
});
