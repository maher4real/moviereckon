import type { DiscoverFilters, WatchProvider } from "@/shared/lib/tmdb";

export type MovieCategory = "all" | "now_playing" | "trending" | "bollywood" | "hollywood";
export type MovieSortOption =
  | "popularity.desc"
  | "vote_average.desc"
  | "release_date.desc"
  | "revenue.desc";

export type SeriesCategory =
  | "all"
  | "popular"
  | "top_rated"
  | "upcoming"
  | "korean"
  | "indian"
  | "anime";
export type SeriesSortOption =
  | "popularity.desc"
  | "vote_average.desc"
  | "first_air_date.desc"
  | "first_air_date.asc";

export type WatchRegion = "US" | "IN" | "GB" | "CA" | "AU";

export interface MovieBrowseState {
  category: MovieCategory;
  selectedGenre: string;
  selectedYear: string;
  bollywoodLanguage: string;
  sortBy: MovieSortOption;
}

export interface SeriesBrowseState {
  category: SeriesCategory;
  selectedGenre: string;
  selectedYear: string;
  sortBy: SeriesSortOption;
  ottFilter: string;
  selectedLanguage: string;
  watchRegion: WatchRegion;
}

export const DEFAULT_MOVIE_SORT: MovieSortOption = "popularity.desc";
export const DEFAULT_SERIES_SORT: SeriesSortOption = "popularity.desc";

const MOVIE_CATEGORIES: readonly MovieCategory[] = [
  "all",
  "now_playing",
  "trending",
  "bollywood",
  "hollywood",
];
const MOVIE_SORTS: readonly MovieSortOption[] = [
  "popularity.desc",
  "vote_average.desc",
  "release_date.desc",
  "revenue.desc",
];
const MOVIE_SPECIAL_CATEGORIES = new Set<MovieCategory>(["now_playing", "trending"]);

const SERIES_CATEGORIES: readonly SeriesCategory[] = [
  "all",
  "popular",
  "top_rated",
  "upcoming",
  "korean",
  "indian",
  "anime",
];
const SERIES_SORTS: readonly SeriesSortOption[] = [
  "popularity.desc",
  "vote_average.desc",
  "first_air_date.desc",
  "first_air_date.asc",
];
const SERIES_LANGUAGES = new Set(["all", "en", "hi", "ko", "ja", "ta", "te", "es", "fr"]);
const WATCH_REGIONS: readonly WatchRegion[] = ["US", "IN", "GB", "CA", "AU"];
// This is a deliberately small, curated supported subset. The UI enriches
// it with TMDB's region catalog when that request succeeds; keeping this
// fallback makes URL normalization deterministic during outages and gives
// the Indian category a stable provider pool for its aggregate query.
const SERIES_PROVIDER_OPTIONS: Record<WatchRegion, readonly { value: string; label: string }[]> = {
  US: [
    { value: "all", label: "All OTT" },
    { value: "8", label: "Netflix" },
    { value: "9", label: "Prime Video" },
    { value: "337", label: "Disney+" },
    { value: "15", label: "Hulu" },
    { value: "350", label: "Apple TV+" },
    { value: "189", label: "Max" },
    { value: "192", label: "YouTube Movies" },
  ],
  IN: [
    { value: "all", label: "All OTT" },
    { value: "8", label: "Netflix" },
    { value: "119", label: "Prime Video" },
    { value: "122", label: "Hotstar / JioHotstar" },
    { value: "220", label: "JioCinema" },
    { value: "337", label: "Disney+" },
    { value: "350", label: "Apple TV+" },
    { value: "192", label: "YouTube Movies" },
    { value: "237", label: "SonyLIV" },
    { value: "232", label: "ZEE5" },
  ],
  GB: [
    { value: "all", label: "All OTT" },
    { value: "8", label: "Netflix" },
    { value: "9", label: "Prime Video" },
    { value: "337", label: "Disney+" },
    { value: "350", label: "Apple TV+" },
    { value: "189", label: "Max" },
    { value: "192", label: "YouTube Movies" },
  ],
  CA: [
    { value: "all", label: "All OTT" },
    { value: "8", label: "Netflix" },
    { value: "9", label: "Prime Video" },
    { value: "337", label: "Disney+" },
    { value: "350", label: "Apple TV+" },
    { value: "189", label: "Max" },
    { value: "192", label: "YouTube Movies" },
  ],
  AU: [
    { value: "all", label: "All OTT" },
    { value: "8", label: "Netflix" },
    { value: "119", label: "Prime Video" },
    { value: "337", label: "Disney+" },
    { value: "350", label: "Apple TV+" },
    { value: "192", label: "YouTube Movies" },
  ],
};
const SERIES_FORCED_LANGUAGES: Partial<Record<SeriesCategory, string>> = {
  korean: "ko",
  indian: "hi",
  anime: "ja",
};
const SERIES_SPECIAL_CATEGORIES = new Set<SeriesCategory>(["popular", "top_rated"]);
const SERIES_GENRE_FREE_CATEGORIES = new Set<SeriesCategory>(["popular", "top_rated", "anime"]);
const TRUSTED_INDIAN_OTT_PROVIDER_IDS = ["8", "119", "122", "220", "337", "350", "192", "237", "232"];
const MOVIE_GENRE_IDS = new Set([
  12, 14, 16, 18, 27, 28, 35, 36, 37, 53, 80, 99, 878, 9648, 10402, 10749, 10751, 10752, 10770,
]);
const TV_GENRE_IDS = new Set([
  16, 18, 35, 37, 80, 99, 9648, 10751, 10759, 10762, 10763, 10764, 10765, 10766, 10767, 10768,
]);

function validYear(value: string | null | undefined): string {
  if (!value || !/^\d{4}$/.test(value)) return "";
  const year = Number(value);
  const currentYear = new Date().getFullYear();
  return year >= 1950 && year <= currentYear ? value : "";
}

function validGenre(value: string | null | undefined, validIds: ReadonlySet<number>): string {
  if (!value || !/^\d+$/.test(value)) return "";
  return validIds.has(Number(value)) ? value : "";
}

function valueOrDefault<T extends string>(
  value: string | null | undefined,
  values: readonly T[],
  fallback: T,
): T {
  return value && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function isMovieSpecialCategory(category: MovieCategory): boolean {
  return MOVIE_SPECIAL_CATEGORIES.has(category);
}

export function isSeriesSpecialCategory(category: SeriesCategory): boolean {
  return SERIES_SPECIAL_CATEGORIES.has(category);
}

export function isValidMovieGenre(value: string | null | undefined): boolean {
  return Boolean(validGenre(value, MOVIE_GENRE_IDS));
}

export function isValidSeriesGenre(value: string | null | undefined): boolean {
  return Boolean(validGenre(value, TV_GENRE_IDS));
}

export function getWatchRegionOptions(): readonly { value: WatchRegion; label: string }[] {
  return [
    { value: "US", label: "United States" },
    { value: "IN", label: "India" },
    { value: "GB", label: "United Kingdom" },
    { value: "CA", label: "Canada" },
    { value: "AU", label: "Australia" },
  ];
}

export function getSeriesProviderOptions(region: WatchRegion): readonly { value: string; label: string }[] {
  return SERIES_PROVIDER_OPTIONS[region];
}

export function getVerifiedSeriesProviderOptions(
  region: WatchRegion,
  catalog: readonly Pick<WatchProvider, "provider_id" | "provider_name" | "display_priority">[] | undefined,
): readonly { value: string; label: string }[] {
  const curated = getSeriesProviderOptions(region);
  if (!catalog?.length) return curated;

  const curatedById = new Map(curated.map((option) => [option.value, option.label]));
  const seen = new Set<string>();
  const verified = [...catalog]
    .filter((provider) => curatedById.has(String(provider.provider_id)))
    .sort((a, b) => (a.display_priority || Number.MAX_SAFE_INTEGER) - (b.display_priority || Number.MAX_SAFE_INTEGER))
    .map((provider) => ({
      value: String(provider.provider_id),
      label: provider.provider_name || curatedById.get(String(provider.provider_id)) || "OTT provider",
    }))
    .filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });

  // TMDB can omit a curated provider temporarily. Keep those options as a
  // deterministic fallback while preferring the region catalog's names and
  // ordering for providers it verifies.
  if (verified.length === 0) return curated;
  return [
    curated[0] || { value: "all", label: "All OTT" },
    ...verified,
    ...curated.slice(1).filter((option) => !seen.has(option.value)),
  ];
}

function getDefaultSeriesWatchRegion(category: SeriesCategory): WatchRegion {
  return category === "indian" ? "IN" : "US";
}

function normalizeWatchRegion(value: string | null | undefined, category: SeriesCategory): WatchRegion {
  return value && (WATCH_REGIONS as readonly string[]).includes(value)
    ? (value as WatchRegion)
    : getDefaultSeriesWatchRegion(category);
}

export function normalizeMovieBrowseState(input: Partial<MovieBrowseState>): MovieBrowseState {
  const category = valueOrDefault(input.category, MOVIE_CATEGORIES, "all");
  const specialCategory = isMovieSpecialCategory(category);
  const bollywoodLanguage = valueOrDefault(
    input.bollywoodLanguage,
    ["all", "hi", "gu", "ta", "te", "kn"],
    "hi",
  );
  const requestedSort = valueOrDefault(input.sortBy, MOVIE_SORTS, DEFAULT_MOVIE_SORT);

  return {
    category,
    selectedGenre: specialCategory ? "" : validGenre(input.selectedGenre, MOVIE_GENRE_IDS),
    selectedYear: specialCategory ? "" : validYear(input.selectedYear),
    bollywoodLanguage,
    // TMDB discover payloads do not include revenue, so an all-language
    // Bollywood merge cannot honestly expose a global revenue ordering.
    sortBy:
      specialCategory ||
      (category === "bollywood" && bollywoodLanguage === "all" && requestedSort === "revenue.desc")
        ? DEFAULT_MOVIE_SORT
        : requestedSort,
  };
}

export function parseMovieBrowseState(searchParams: URLSearchParams): MovieBrowseState {
  return normalizeMovieBrowseState({
    category: (searchParams.get("category") || undefined) as MovieCategory | undefined,
    selectedGenre: searchParams.get("genre") || undefined,
    selectedYear: searchParams.get("year") || undefined,
    bollywoodLanguage: searchParams.get("lang") || undefined,
    sortBy: (searchParams.get("sort") || undefined) as MovieSortOption | undefined,
  });
}

export function serializeMovieBrowseState(
  source: URLSearchParams,
  state: MovieBrowseState,
): URLSearchParams {
  const normalized = normalizeMovieBrowseState(state);
  const params = new URLSearchParams(source);
  ["category", "genre", "year", "lang", "sort"].forEach((key) => params.delete(key));

  if (normalized.category !== "all") params.set("category", normalized.category);
  if (normalized.selectedGenre) params.set("genre", normalized.selectedGenre);
  if (normalized.selectedYear) params.set("year", normalized.selectedYear);
  if (normalized.category === "bollywood" && normalized.bollywoodLanguage !== "hi") {
    params.set("lang", normalized.bollywoodLanguage);
  }
  if (normalized.sortBy !== DEFAULT_MOVIE_SORT) params.set("sort", normalized.sortBy);

  return params;
}

export function getMovieBrowseQueryKey(state: MovieBrowseState): readonly unknown[] {
  const normalized = normalizeMovieBrowseState(state);
  return [
    "movies-infinite",
    normalized.category,
    normalized.selectedGenre,
    normalized.selectedYear,
    normalized.category === "bollywood" ? normalized.bollywoodLanguage : "all",
    normalized.sortBy,
  ];
}

export function buildMovieDiscoverFilters(
  state: MovieBrowseState,
  page: number,
): DiscoverFilters | undefined {
  const normalized = normalizeMovieBrowseState(state);
  if (isMovieSpecialCategory(normalized.category)) return undefined;

  const filters: DiscoverFilters = {
    page,
    sort_by: normalized.sortBy,
    with_genres: normalized.selectedGenre || undefined,
    "primary_release_date.gte": normalized.selectedYear
      ? `${normalized.selectedYear}-01-01`
      : undefined,
    "primary_release_date.lte": normalized.selectedYear
      ? `${normalized.selectedYear}-12-31`
      : undefined,
  };

  if (normalized.category === "hollywood") {
    filters.with_original_language = "en";
    filters.region = "US";
  }

  if (normalized.category === "bollywood") {
    filters.region = "IN";
    if (normalized.bollywoodLanguage !== "all") {
      filters.with_original_language = normalized.bollywoodLanguage;
    }
  }

  return filters;
}

export function normalizeSeriesBrowseState(input: Partial<SeriesBrowseState>): SeriesBrowseState {
  const category = valueOrDefault(input.category, SERIES_CATEGORIES, "all");
  const forcedLanguage = SERIES_FORCED_LANGUAGES[category];
  const specialCategory = isSeriesSpecialCategory(category);
  const watchRegion = normalizeWatchRegion(input.watchRegion, category);
  const providerIds = new Set(getSeriesProviderOptions(watchRegion).map((option) => option.value));

  return {
    category,
    selectedGenre: SERIES_GENRE_FREE_CATEGORIES.has(category) ? "" : validGenre(input.selectedGenre, TV_GENRE_IDS),
    selectedYear: validYear(input.selectedYear),
    sortBy:
      category === "top_rated"
        ? "vote_average.desc"
        : specialCategory
          ? DEFAULT_SERIES_SORT
          : valueOrDefault(input.sortBy, SERIES_SORTS, DEFAULT_SERIES_SORT),
    ottFilter: input.ottFilter && providerIds.has(input.ottFilter) ? input.ottFilter : "all",
    selectedLanguage: forcedLanguage
      ? "all"
      : input.selectedLanguage && SERIES_LANGUAGES.has(input.selectedLanguage)
        ? input.selectedLanguage
        : "all",
    watchRegion,
  };
}

export function parseSeriesBrowseState(searchParams: URLSearchParams): SeriesBrowseState {
  return normalizeSeriesBrowseState({
    category: (searchParams.get("category") || undefined) as SeriesCategory | undefined,
    selectedGenre: searchParams.get("genre") || undefined,
    selectedYear: searchParams.get("year") || undefined,
    sortBy: (searchParams.get("sort") || undefined) as SeriesSortOption | undefined,
    ottFilter: searchParams.get("platform") || undefined,
    selectedLanguage: searchParams.get("lang") || undefined,
    watchRegion: (searchParams.get("region") || undefined) as WatchRegion | undefined,
  });
}

export function serializeSeriesBrowseState(
  source: URLSearchParams,
  state: SeriesBrowseState,
): URLSearchParams {
  const normalized = normalizeSeriesBrowseState(state);
  const params = new URLSearchParams(source);
  ["category", "genre", "year", "sort", "platform", "lang", "region"].forEach((key) => params.delete(key));

  if (normalized.category !== "all") params.set("category", normalized.category);
  if (normalized.selectedGenre) params.set("genre", normalized.selectedGenre);
  if (normalized.selectedYear) params.set("year", normalized.selectedYear);
  if (!isSeriesSpecialCategory(normalized.category) && normalized.sortBy !== DEFAULT_SERIES_SORT) {
    params.set("sort", normalized.sortBy);
  }
  if (normalized.ottFilter !== "all") params.set("platform", normalized.ottFilter);
  if (normalized.watchRegion !== getDefaultSeriesWatchRegion(normalized.category)) {
    params.set("region", normalized.watchRegion);
  }
  if (!SERIES_FORCED_LANGUAGES[normalized.category] && normalized.selectedLanguage !== "all") {
    params.set("lang", normalized.selectedLanguage);
  }

  return params;
}

export function getSeriesResolvedLanguage(
  category: SeriesCategory,
  selectedLanguage: string,
): string | undefined {
  return SERIES_FORCED_LANGUAGES[category] || (selectedLanguage === "all" ? undefined : selectedLanguage);
}

export function getSeriesWatchProviderFilter({
  category,
  ottFilter,
  watchRegion,
}: {
  category: SeriesCategory;
  ottFilter: string;
  /** @deprecated Language does not determine provider region. */
  selectedLanguage?: string;
  watchRegion?: WatchRegion;
}): Pick<
  DiscoverFilters,
  "with_watch_providers" | "watch_region" | "vote_count.gte" | "vote_average.gte"
> {
  const resolvedRegion = normalizeWatchRegion(watchRegion, category);
  const providerIdsForRegion = new Set(getSeriesProviderOptions(resolvedRegion).map((option) => option.value));
  // Category semantics may provide a trusted Indian provider pool. Original
  // language alone must never select a viewing country.
  const usesIndianContentFilter = category === "indian";
  const qualityGate = usesIndianContentFilter
    ? {
        "vote_count.gte": 20,
        "vote_average.gte": 5,
      }
    : {};

  if (ottFilter !== "all") {
    return {
      with_watch_providers: ottFilter,
      watch_region: resolvedRegion,
      ...qualityGate,
    };
  }

  if (usesIndianContentFilter) {
    const trustedProviders = TRUSTED_INDIAN_OTT_PROVIDER_IDS.filter((id) => providerIdsForRegion.has(id));
    return {
      with_watch_providers: trustedProviders.join("|"),
      watch_region: resolvedRegion,
      ...qualityGate,
    };
  }

  return {};
}

export function buildSeriesDiscoverFilters(
  state: SeriesBrowseState,
  page: number,
  tomorrowStr: string,
): DiscoverFilters {
  const normalized = normalizeSeriesBrowseState(state);
  const yearStart = normalized.selectedYear ? `${normalized.selectedYear}-01-01` : undefined;
  const yearEnd = normalized.selectedYear ? `${normalized.selectedYear}-12-31` : undefined;
  const filters: DiscoverFilters = {
    page,
    sort_by:
      normalized.category === "upcoming"
        ? normalized.sortBy === DEFAULT_SERIES_SORT
          ? "first_air_date.asc"
          : normalized.sortBy
        : normalized.sortBy,
    with_genres: normalized.category === "anime" ? "16" : normalized.selectedGenre || undefined,
    with_original_language: getSeriesResolvedLanguage(normalized.category, normalized.selectedLanguage),
    "first_air_date.gte": yearStart,
    "first_air_date.lte": yearEnd,
    ...getSeriesWatchProviderFilter(normalized),
  };

  if (normalized.category === "upcoming") {
    filters["first_air_date.gte"] = yearStart
      ? yearStart > tomorrowStr
        ? yearStart
        : tomorrowStr
      : tomorrowStr;
  }

  return filters;
}

export function getSeriesBrowseQueryKey(state: SeriesBrowseState): readonly unknown[] {
  const normalized = normalizeSeriesBrowseState(state);
  return [
    "series-infinite",
    normalized.category,
    normalized.selectedGenre,
    normalized.selectedYear,
    normalized.sortBy,
    normalized.ottFilter,
    normalized.selectedLanguage,
    normalized.watchRegion,
  ];
}
