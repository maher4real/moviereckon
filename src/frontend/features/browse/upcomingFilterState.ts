import {
  getSeriesProviderOptions,
  isValidMovieGenre,
  isValidSeriesGenre,
  type WatchRegion,
} from "./browseFilterState";

export type UpcomingSection = "all" | "movies" | "series";
export type MovieSectionFilter = "all" | "bollywood" | "hollywood";

export interface UpcomingFilterState {
  section: UpcomingSection;
  movieSectionFilter: MovieSectionFilter;
  bollywoodLanguage: string;
  movieGenre: string;
  seriesGenre: string;
  seriesOtt: string;
  seriesLanguage: string;
  watchRegion: WatchRegion;
  selectedFilterDate: string;
}

const UPCOMING_SECTIONS: readonly UpcomingSection[] = ["all", "movies", "series"];
const MOVIE_SECTION_FILTERS: readonly MovieSectionFilter[] = ["all", "bollywood", "hollywood"];
const BOLLYWOOD_LANGUAGES = new Set(["all", "hi", "gu", "ta", "te", "kn"]);
const SERIES_LANGUAGES = new Set(["all", "en", "hi", "ko", "ja", "ta", "te", "es", "fr"]);
const WATCH_REGIONS: readonly WatchRegion[] = ["US", "IN", "GB", "CA", "AU"];

export const BOLLYWOOD_LANGUAGE_LIST = ["hi", "gu", "ta", "te", "kn"] as const;
export const UPCOMING_WATCH_REGION_OPTIONS: readonly { value: WatchRegion; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "IN", label: "India" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
];

function oneOf<T extends string>(value: string | null | undefined, values: readonly T[], fallback: T): T {
  return value && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function isValidUpcomingDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeWatchRegion(value: string | null | undefined): WatchRegion {
  return value && (WATCH_REGIONS as readonly string[]).includes(value)
    ? (value as WatchRegion)
    : "US";
}

export function normalizeUpcomingFilterState(input: Partial<UpcomingFilterState>): UpcomingFilterState {
  const section = oneOf(input.section, UPCOMING_SECTIONS, "all");
  const movieSectionFilter = oneOf(input.movieSectionFilter, MOVIE_SECTION_FILTERS, "all");
  const watchRegion = normalizeWatchRegion(input.watchRegion);
  const providerIds = new Set(getSeriesProviderOptions(watchRegion).map((option) => option.value));
  const selectedFilterDate =
    input.selectedFilterDate === "all" || isValidUpcomingDateKey(input.selectedFilterDate)
      ? input.selectedFilterDate || "all"
      : "all";

  const movieScope = section === "movies";
  const seriesScope = section === "series";
  const activeMovieSection = movieScope ? movieSectionFilter : "all";

  return {
    section,
    movieSectionFilter: activeMovieSection,
    bollywoodLanguage:
      activeMovieSection === "bollywood"
        ? oneOf(input.bollywoodLanguage, ["all", "hi", "gu", "ta", "te", "kn"], "all")
        : "all",
    movieGenre: movieScope && isValidMovieGenre(input.movieGenre) ? input.movieGenre || "" : "",
    seriesGenre: seriesScope && isValidSeriesGenre(input.seriesGenre) ? input.seriesGenre || "" : "",
    seriesOtt:
      seriesScope && input.seriesOtt && providerIds.has(input.seriesOtt) ? input.seriesOtt : "all",
    seriesLanguage:
      seriesScope && input.seriesLanguage && SERIES_LANGUAGES.has(input.seriesLanguage)
        ? input.seriesLanguage
        : "all",
    watchRegion: seriesScope ? watchRegion : "US",
    selectedFilterDate,
  };
}

export function parseUpcomingFilterState(searchParams: URLSearchParams): UpcomingFilterState {
  return normalizeUpcomingFilterState({
    section: (searchParams.get("section") || undefined) as UpcomingSection | undefined,
    movieSectionFilter: (searchParams.get("movieType") || undefined) as MovieSectionFilter | undefined,
    bollywoodLanguage: searchParams.get("bollyLang") || undefined,
    movieGenre: searchParams.get("movieGenre") || undefined,
    seriesGenre: searchParams.get("seriesGenre") || undefined,
    seriesOtt: searchParams.get("ott") || undefined,
    seriesLanguage: searchParams.get("lang") || undefined,
    watchRegion: searchParams.get("region") as WatchRegion | undefined,
    selectedFilterDate: searchParams.get("date") || undefined,
  });
}

export function serializeUpcomingFilterState(
  source: URLSearchParams,
  state: UpcomingFilterState,
): URLSearchParams {
  const normalized = normalizeUpcomingFilterState(state);
  const params = new URLSearchParams(source);
  [
    "section",
    "movieType",
    "bollyLang",
    "movieGenre",
    "seriesGenre",
    "ott",
    "lang",
    "region",
    "date",
  ].forEach((key) => params.delete(key));

  if (normalized.section !== "all") params.set("section", normalized.section);
  if (normalized.section === "movies") {
    if (normalized.movieSectionFilter !== "all") params.set("movieType", normalized.movieSectionFilter);
    if (normalized.movieSectionFilter === "bollywood" && normalized.bollywoodLanguage !== "all") {
      params.set("bollyLang", normalized.bollywoodLanguage);
    }
    if (normalized.movieGenre) params.set("movieGenre", normalized.movieGenre);
  }
  if (normalized.section === "series") {
    if (normalized.seriesGenre) params.set("seriesGenre", normalized.seriesGenre);
    if (normalized.seriesOtt !== "all") params.set("ott", normalized.seriesOtt);
    if (normalized.seriesLanguage !== "all") params.set("lang", normalized.seriesLanguage);
    if (normalized.watchRegion !== "US") params.set("region", normalized.watchRegion);
  }
  if (normalized.selectedFilterDate !== "all") params.set("date", normalized.selectedFilterDate);

  return params;
}

export function getUpcomingQueryKey(state: UpcomingFilterState): readonly unknown[] {
  const normalized = normalizeUpcomingFilterState(state);
  return [
    "upcoming-infinite",
    normalized.section,
    normalized.movieSectionFilter,
    normalized.bollywoodLanguage,
    normalized.movieGenre,
    normalized.seriesGenre,
    normalized.seriesOtt,
    normalized.seriesLanguage,
    normalized.watchRegion,
    normalized.selectedFilterDate,
  ];
}
