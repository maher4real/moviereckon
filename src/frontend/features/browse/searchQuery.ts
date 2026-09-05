import {
  MultiSearchResult,
  TMDBResponse,
  searchMovies,
  searchMulti,
  searchPeople,
  searchTVShows,
} from "@/shared/lib/tmdb";

export type SearchFilterType = "all" | "movie" | "tv" | "person";
export type SearchPage = TMDBResponse<MultiSearchResult>;
export type SearchQueryKey = readonly ["search", string, SearchFilterType];
type SearchMediaType = Exclude<SearchFilterType, "all">;

export interface SearchUrlState {
  query: string;
  filterType: SearchFilterType;
}

export function normalizeSearchFilterType(value: string | null | undefined): SearchFilterType {
  return value === "movie" || value === "tv" || value === "person" ? value : "all";
}

export function parseSearchUrlState(searchParams: URLSearchParams): SearchUrlState {
  return {
    query: searchParams.get("q") || "",
    filterType: normalizeSearchFilterType(searchParams.get("type")),
  };
}

export function serializeSearchUrlState(
  source: URLSearchParams,
  state: SearchUrlState,
): URLSearchParams {
  const params = new URLSearchParams(source);
  const query = state.query.trim();
  if (query) params.set("q", query);
  else params.delete("q");

  const filterType = normalizeSearchFilterType(state.filterType);
  if (filterType === "all") params.delete("type");
  else params.set("type", filterType);

  return params;
}

export function normalizeSearchPage(
  page: SearchPage,
  expectedMediaType?: SearchMediaType,
): SearchPage {
  return {
    ...page,
    results: (page.results || []).map((item) => ({
      ...item,
      media_type:
        expectedMediaType ||
        item.media_type ||
        ("first_air_date" in item ? "tv" : "title" in item ? "movie" : "person"),
    })),
  } as SearchPage;
}

export function getSearchQueryKey(
  query: string,
  filterType: SearchFilterType,
): SearchQueryKey {
  return ["search", query.trim(), filterType];
}

export async function fetchSearchPage(
  filterType: SearchFilterType,
  query: string,
  page: number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const normalizedQuery = query.trim();

  switch (filterType) {
    case "movie":
      return normalizeSearchPage(await searchMovies(normalizedQuery, page, signal), "movie");
    case "tv":
      return normalizeSearchPage(await searchTVShows(normalizedQuery, page, signal), "tv");
    case "person":
      return normalizeSearchPage(await searchPeople(normalizedQuery, page, signal), "person");
    case "all":
    default:
      return normalizeSearchPage(await searchMulti(normalizedQuery, page, signal));
  }
}

export function getNextSearchPageParam(
  lastPage: SearchPage | undefined,
): number | undefined {
  if (!lastPage) return undefined;

  const currentPage = Number.isFinite(lastPage.page) && lastPage.page > 0 ? lastPage.page : 1;
  const totalPages = Number.isFinite(lastPage.total_pages) ? Math.max(0, lastPage.total_pages) : 0;

  return currentPage < totalPages ? currentPage + 1 : undefined;
}

export function getSearchResultKey(item: MultiSearchResult): string {
  const mediaType =
    item.media_type ||
    ("first_air_date" in item ? "tv" : "title" in item ? "movie" : "person");

  return `${mediaType}:${item.id}`;
}

export function flattenSearchPages(
  pages: readonly SearchPage[],
): MultiSearchResult[] {
  const seen = new Set<string>();
  const results: MultiSearchResult[] = [];

  for (const page of pages) {
    for (const item of page.results || []) {
      const key = getSearchResultKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  }

  return results;
}
