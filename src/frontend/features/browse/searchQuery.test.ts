import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchMulti: vi.fn(),
  searchMovies: vi.fn(),
  searchTVShows: vi.fn(),
  searchPeople: vi.fn(),
}));

vi.mock("@/shared/lib/tmdb", () => mocks);

import {
  fetchSearchPage,
  flattenSearchPages,
  getNextSearchPageParam,
  getSearchQueryKey,
  parseSearchUrlState,
  serializeSearchUrlState,
} from "./searchQuery";
import type { MultiSearchResult } from "@/shared/lib/tmdb";

function page(results: MultiSearchResult[], currentPage = 1, totalPages = 1) {
  return {
    page: currentPage,
    results,
    total_pages: totalPages,
    total_results: results.length,
  };
}

describe("search query helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the type-specific TMDB endpoint for each tab and preserves pagination", async () => {
    const signal = new AbortController().signal;
    const response = page([], 3, 4);
    mocks.searchMulti.mockResolvedValue(response);
    mocks.searchMovies.mockResolvedValue(response);
    mocks.searchTVShows.mockResolvedValue(response);
    mocks.searchPeople.mockResolvedValue(response);

    await fetchSearchPage("all", "  dune  ", 3, signal);
    await fetchSearchPage("movie", "  dune  ", 3, signal);
    await fetchSearchPage("tv", "  dune  ", 3, signal);
    await fetchSearchPage("person", "  dune  ", 3, signal);

    expect(mocks.searchMulti).toHaveBeenCalledWith("dune", 3, signal);
    expect(mocks.searchMovies).toHaveBeenCalledWith("dune", 3, signal);
    expect(mocks.searchTVShows).toHaveBeenCalledWith("dune", 3, signal);
    expect(mocks.searchPeople).toHaveBeenCalledWith("dune", 3, signal);
  });

  it("normalizes type-specific results so people are not discarded by the Cast tab", async () => {
    mocks.searchPeople.mockResolvedValue(
      page([{ id: 7, name: "Greta Gerwig", profile_path: null } as MultiSearchResult]),
    );

    const result = await fetchSearchPage("person", "greta", 1);

    expect(result.results[0]).toMatchObject({
      id: 7,
      name: "Greta Gerwig",
      media_type: "person",
    });
  });

  it("stamps movie and TV results with their selected media type", async () => {
    mocks.searchMovies.mockResolvedValue(
      page([{ id: 1, title: "Dune" } as MultiSearchResult]),
    );
    mocks.searchTVShows.mockResolvedValue(
      page([{ id: 2, name: "Dune: Prophecy" } as MultiSearchResult]),
    );

    const [moviePage, tvPage] = await Promise.all([
      fetchSearchPage("movie", "dune", 1),
      fetchSearchPage("tv", "dune", 1),
    ]);

    expect(moviePage.results[0]).toMatchObject({ id: 1, media_type: "movie" });
    expect(tvPage.results[0]).toMatchObject({ id: 2, media_type: "tv" });
  });

  it("keys cached results by normalized query and selected type", () => {
    expect(getSearchQueryKey("  dune  ", "movie")).toEqual([
      "search",
      "dune",
      "movie",
    ]);
    expect(getSearchQueryKey("dune", "tv")).not.toEqual(
      getSearchQueryKey("dune", "movie"),
    );
  });

  it("advances only while another upstream page exists and deduplicates page boundaries", () => {
    expect(getNextSearchPageParam(page([], 1, 2))).toBe(2);
    expect(getNextSearchPageParam(page([], 2, 2))).toBeUndefined();

    const movie = { id: 10, title: "Dune", media_type: "movie" } as MultiSearchResult;
    const person = { id: 10, name: "Dune", media_type: "person" } as MultiSearchResult;

    expect(
      flattenSearchPages([
        page([movie, person]),
        page([movie], 2, 2),
      ]),
    ).toEqual([movie, person]);
  });

  it("round-trips query and tab state through stable URL parameters", () => {
    const state = parseSearchUrlState(new URLSearchParams("q=dune&type=tv&unrelated=1"));
    expect(state).toEqual({ query: "dune", filterType: "tv" });

    expect(
      serializeSearchUrlState(new URLSearchParams("q=old&type=movie&unrelated=1"), {
        query: "  dune  ",
        filterType: "person",
      }).toString(),
    ).toBe("q=dune&type=person&unrelated=1");
  });
});
