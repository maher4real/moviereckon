import { describe, expect, it } from "vitest";
import {
  buildMovieDiscoverFilters,
  buildSeriesDiscoverFilters,
  getMovieBrowseQueryKey,
  getSeriesBrowseQueryKey,
  getSeriesProviderOptions,
  getVerifiedSeriesProviderOptions,
  getSeriesWatchProviderFilter,
  normalizeMovieBrowseState,
  normalizeSeriesBrowseState,
  parseMovieBrowseState,
  parseSeriesBrowseState,
  serializeMovieBrowseState,
  serializeSeriesBrowseState,
} from "./browseFilterState";

describe("movie browse filter state", () => {
  it("drops unsupported controls when a dedicated category is selected", () => {
    const source = new URLSearchParams(
      "category=now_playing&genre=28&year=2020&sort=release_date.desc",
    );
    const state = parseMovieBrowseState(source);

    expect(state).toMatchObject({
      category: "now_playing",
      selectedGenre: "",
      selectedYear: "",
      sortBy: "popularity.desc",
    });
    expect(serializeMovieBrowseState(source, state).toString()).toBe("category=now_playing");
    expect(buildMovieDiscoverFilters(state, 2)).toBeUndefined();
    expect(getMovieBrowseQueryKey(state)).toEqual([
      "movies-infinite",
      "now_playing",
      "",
      "",
      "all",
      "popularity.desc",
    ]);
  });

  it("passes movie selections to the discover request", () => {
    const state = normalizeMovieBrowseState({
      category: "hollywood",
      selectedGenre: "28",
      selectedYear: "2020",
      sortBy: "release_date.desc",
    });

    expect(buildMovieDiscoverFilters(state, 3)).toEqual({
      page: 3,
      sort_by: "release_date.desc",
      with_genres: "28",
      with_original_language: "en",
      region: "US",
      "primary_release_date.gte": "2020-01-01",
      "primary_release_date.lte": "2020-12-31",
    });
  });

  it("round-trips navigable movie selections through the URL", () => {
    const source = new URLSearchParams("category=bollywood&genre=18&year=2024&lang=ta&sort=vote_average.desc");
    const state = parseMovieBrowseState(source);
    const canonical = serializeMovieBrowseState(source, state);

    expect(parseMovieBrowseState(canonical)).toEqual(state);
    expect(getMovieBrowseQueryKey(parseMovieBrowseState(canonical))).toEqual([
      "movies-infinite",
      "bollywood",
      "18",
      "2024",
      "ta",
      "vote_average.desc",
    ]);
  });
});

describe("series browse filter state", () => {
  it("uses the TMDB region catalog to enrich the curated provider fallback", () => {
    const options = getVerifiedSeriesProviderOptions("AU", [
      { provider_id: 8, provider_name: "Netflix AU", display_priority: 1 },
      { provider_id: 9999, provider_name: "Unknown provider", display_priority: 0 },
    ]);

    expect(options[0]).toEqual({ value: "all", label: "All OTT" });
    expect(options.find((option) => option.value === "8")?.label).toBe("Netflix AU");
    expect(options.some((option) => option.value === "9999")).toBe(false);
    expect(options.some((option) => option.value === getSeriesProviderOptions("AU")[1]?.value)).toBe(true);
  });

  it("uses the category language when deriving provider availability", () => {
    expect(
      getSeriesWatchProviderFilter({
        category: "korean",
        ottFilter: "all",
        selectedLanguage: "hi",
      }),
    ).toEqual({});

    expect(
      buildSeriesDiscoverFilters(
        normalizeSeriesBrowseState({
          category: "korean",
          selectedLanguage: "hi",
          ottFilter: "8",
        }),
        1,
        "2026-01-02",
      ),
    ).toMatchObject({
      with_original_language: "ko",
      with_watch_providers: "8",
      watch_region: "US",
    });
  });

  it("clears stale genre and sort values for fixed-order categories", () => {
    const source = new URLSearchParams(
      "category=top_rated&genre=28&sort=first_air_date.asc&year=2020",
    );
    const state = parseSeriesBrowseState(source);

    expect(state).toMatchObject({
      category: "top_rated",
      selectedGenre: "",
      selectedYear: "2020",
      sortBy: "vote_average.desc",
    });
    expect(serializeSeriesBrowseState(source, state).toString()).toBe(
      "category=top_rated&year=2020",
    );
    expect(buildSeriesDiscoverFilters(state, 2, "2026-01-02")).toMatchObject({
      page: 2,
      sort_by: "vote_average.desc",
      "first_air_date.gte": "2020-01-01",
      "first_air_date.lte": "2020-12-31",
    });
    expect(getSeriesBrowseQueryKey(state)).toEqual([
      "series-infinite",
      "top_rated",
      "",
      "2020",
      "vote_average.desc",
      "all",
      "all",
      "US",
    ]);
  });
});
