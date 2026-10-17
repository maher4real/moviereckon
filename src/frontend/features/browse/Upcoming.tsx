import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Film, Tv } from "lucide-react";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  discoverMovies,
  discoverTVShows,
  getMovieGenres,
  getTVGenres,
  getTVWatchProviderCatalog,
  Movie,
  TVShow,
  Genre,
  DiscoverFilters,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import {
  UpcomingTimelineSkeleton,
  InlineLoadMoreSkeleton,
} from "@/frontend/components/AppSkeletons";
import { Button } from "@/frontend/components/ui/button";
import { BrowseFilters, BrowseHeader, BrowsePosterCard, type ActiveFilter, type BrowseCategory, type BrowseSelect } from "@/frontend/components/browse/BrowseLayout";
import { cn, formatLocalDate, isAnimeLike } from "@/shared/lib/utils";
import { getNextTmdbPage, useCanonicalSearchParams, useLoadMoreOnScroll } from "@/frontend/hooks/useBrowseFeed";
import { BOLLYWOOD_LANGUAGE_OPTIONS, SERIES_LANGUAGE_OPTIONS } from "@/shared/lib/catalogue";
import {
  BOLLYWOOD_LANGUAGE_LIST,
  parseUpcomingFilterState,
  serializeUpcomingFilterState,
  normalizeUpcomingFilterState,
  getUpcomingQueryKey,
  isValidUpcomingDateKey,
  UPCOMING_WATCH_REGION_OPTIONS,
  type MovieSectionFilter,
  type UpcomingSection,
  type UpcomingFilterState,
} from "./upcomingFilterState";
import { getVerifiedSeriesProviderOptions } from "./browseFilterState";

interface UpcomingPage {
  results: (Movie | TVShow)[];
  total_pages: number;
  page: number;
  total_results: number;
}

const MOVIE_SECTION_OPTIONS: { value: MovieSectionFilter; label: string }[] = [
  { value: "all", label: "All Movies" },
  { value: "bollywood", label: "Bollywood" },
  { value: "hollywood", label: "Hollywood" },
];

const LANGUAGE_OPTIONS = SERIES_LANGUAGE_OPTIONS;
const BOLLYWOOD_LANGUAGE_CODES = new Set<string>(BOLLYWOOD_LANGUAGE_LIST);
const CALENDAR_TIMELINE_DAYS = 180;


const isTVShow = (item: Movie | TVShow): item is TVShow => "first_air_date" in item;

const getReleaseDate = (item: Movie | TVShow) =>
  isTVShow(item) ? item.first_air_date : item.release_date;

const parseDateKey = (value: string): Date | null => {
  if (!isValidUpcomingDateKey(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatDateHeading = (date: Date) =>
  date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });

const getRelativeReleaseLabel = (date: Date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays === -1) return "Yesterday";
  return `${Math.abs(diffDays)} days ago`;
};

const UPCOMING_SECTIONS: BrowseCategory<UpcomingSection>[] = [
  { value: "all", label: "Everything", Icon: CalendarDays },
  { value: "movies", label: "Movies", Icon: Film },
  { value: "series", label: "Series", Icon: Tv },
];

export default function Upcoming() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const searchParamString = searchParams.toString();
  const filterState = useMemo(
    () => parseUpcomingFilterState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );
  const {
    section,
    movieSectionFilter,
    bollywoodLanguage,
    movieGenre,
    seriesGenre,
    seriesOtt,
    seriesLanguage,
    watchRegion,
    selectedFilterDate,
  } = filterState;
  const canonicalSearchParamString = useMemo(
    () => serializeUpcomingFilterState(new URLSearchParams(searchParamString), filterState).toString(),
    [filterState, searchParamString],
  );

  useCanonicalSearchParams(canonicalSearchParamString, searchParamString, setSearchParams);

  const updateFilterState = (changes: Partial<UpcomingFilterState>) => {
    const nextState = normalizeUpcomingFilterState({ ...filterState, ...changes });
    // Explicit user changes create a history entry so Back/Forward restores
    // both the controls and the corresponding query cache identity.
    setSearchParams(serializeUpcomingFilterState(searchParams, nextState));
  };
  const [calendarGroupLimit, setCalendarGroupLimit] = useState(8);

  const { data: movieGenres } = useQuery({
    queryKey: ["movie-genres"],
    queryFn: getMovieGenres,
    staleTime: 1000 * 60 * 60,
  });

  const { data: tvGenres } = useQuery({
    queryKey: ["tv-genres"],
    queryFn: getTVGenres,
    staleTime: 1000 * 60 * 60,
  });

  const { data: providerCatalog } = useQuery({
    queryKey: ["tv-watch-provider-catalog", watchRegion],
    queryFn: ({ signal }) => getTVWatchProviderCatalog(watchRegion, signal),
    staleTime: 1000 * 60 * 60 * 6,
    enabled: section === "series",
  });

  const providerOptions = useMemo(
    () => getVerifiedSeriesProviderOptions(watchRegion, providerCatalog),
    [providerCatalog, watchRegion],
  );

  const {
    data: upcomingData,
    isLoading,
    isError: upcomingError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<UpcomingPage>({
    queryKey: getUpcomingQueryKey(filterState),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);
      const releaseDateGte = selectedFilterDate === "all" ? tomorrowStr : selectedFilterDate;
      const releaseDateLte = selectedFilterDate === "all" ? undefined : selectedFilterDate;

      if (section === "movies") {
        const baseFilters: DiscoverFilters = {
          page,
          sort_by: "primary_release_date.asc",
          with_genres: movieGenre || undefined,
          "primary_release_date.gte": releaseDateGte,
          "primary_release_date.lte": releaseDateLte,
        };

        if (movieSectionFilter === "bollywood" && bollywoodLanguage === "all") {
          const languageResponses = await Promise.allSettled(
            BOLLYWOOD_LANGUAGE_LIST.map((language) =>
              discoverMovies({
                ...baseFilters,
                with_original_language: language,
                region: "IN",
              }),
            ),
          );

          const failedResponse = languageResponses.find(
            (response): response is PromiseRejectedResult => response.status === "rejected",
          );
          if (failedResponse) {
            throw failedResponse.reason instanceof Error
              ? failedResponse.reason
              : new Error("Unable to load all Bollywood release sources");
          }

          const successfulPages = languageResponses.map((response) => {
            if (response.status !== "fulfilled") {
              throw new Error("Unable to load all Bollywood release sources");
            }
            return response.value;
          });

          const deduped = new Map<number, Movie>();
          successfulPages.forEach((data) => {
            (data.results || []).forEach((movie) => {
              if (!deduped.has(movie.id)) {
                deduped.set(movie.id, movie);
              }
            });
          });

          const mergedResults = Array.from(deduped.values()).sort((a, b) => {
            const dateCompare = (a.release_date || "9999-12-31").localeCompare(
              b.release_date || "9999-12-31",
            );
            if (dateCompare !== 0) return dateCompare;
            return (b.popularity || 0) - (a.popularity || 0);
          });

          return {
            page,
            results: mergedResults,
            total_pages: Math.max(...successfulPages.map((data) => data.total_pages || 1)),
            total_results: successfulPages.reduce(
              (total, data) => total + (data.total_results || 0),
              0,
            ),
          };
        }

        const filters: DiscoverFilters = { ...baseFilters };

        if (movieSectionFilter === "hollywood") {
          filters.with_original_language = "en";
          filters.region = "US";
        }

        if (movieSectionFilter === "bollywood") {
          filters.region = "IN";
          if (bollywoodLanguage !== "all") {
            filters.with_original_language = bollywoodLanguage;
          }
        }

        return discoverMovies(filters);
      }

      if (section === "series") {
        const filters: DiscoverFilters = {
          page,
          sort_by: "first_air_date.asc",
          with_genres: seriesGenre || undefined,
          with_original_language: seriesLanguage === "all" ? undefined : seriesLanguage,
          "first_air_date.gte": releaseDateGte,
          "first_air_date.lte": releaseDateLte,
        };

        if (seriesOtt !== "all") {
          filters.with_watch_providers = seriesOtt;
          filters.watch_region = watchRegion;
        }

        return discoverTVShows(filters);
      }

      const [upcomingMovies, upcomingSeries] = await Promise.all([
        discoverMovies({
          page,
          sort_by: "primary_release_date.asc",
          "primary_release_date.gte": releaseDateGte,
          "primary_release_date.lte": releaseDateLte,
        }),
        discoverTVShows({
          page,
          sort_by: "first_air_date.asc",
          "first_air_date.gte": releaseDateGte,
          "first_air_date.lte": releaseDateLte,
        }),
      ]);

      return {
        page,
        results: [...(upcomingMovies.results || []), ...(upcomingSeries.results || [])],
        total_pages: Math.max(upcomingMovies.total_pages || 1, upcomingSeries.total_pages || 1),
        total_results: (upcomingMovies.total_results || 0) + (upcomingSeries.total_results || 0),
      };
    },
    getNextPageParam: getNextTmdbPage,
    staleTime: 1000 * 60 * 5,
    enabled: !!user,
  });

  const filteredUpcoming = useMemo(() => {
    if (!upcomingData?.pages) return [];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatLocalDate(tomorrow);

    const dedupe = new Set<string>();
    const merged: (Movie | TVShow)[] = [];

    upcomingData.pages.forEach((page) => {
      (page.results || []).forEach((item) => {
        const itemIsTV = isTVShow(item);
        if (section === "movies" && itemIsTV) return;
        if (section === "series" && !itemIsTV) return;

        const releaseDate = getReleaseDate(item);
        if (!releaseDate) return;
        if (selectedFilterDate === "all") {
          if (releaseDate < tomorrowStr) return;
        } else if (releaseDate !== selectedFilterDate) {
          return;
        }
        if (isAnimeLike(item)) return;

        if (section === "movies") {
          if (movieSectionFilter === "hollywood" && item.original_language !== "en") return;
          if (
            movieSectionFilter === "bollywood" &&
            bollywoodLanguage === "all" &&
            !BOLLYWOOD_LANGUAGE_CODES.has(item.original_language)
          ) {
            return;
          }
          if (
            movieSectionFilter === "bollywood" &&
            bollywoodLanguage !== "all" &&
            item.original_language !== bollywoodLanguage
          ) {
            return;
          }
          if (movieGenre && !item.genre_ids?.includes(Number(movieGenre))) return;
        }

        if (section === "series") {
          if (seriesLanguage !== "all" && item.original_language !== seriesLanguage) return;
          if (seriesGenre && !item.genre_ids?.includes(Number(seriesGenre))) return;
        }

        const key = `${itemIsTV ? "tv" : "movie"}:${item.id}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);
        merged.push(item);
      });
    });

    return merged.sort((a, b) => {
      const dateComparison = (getReleaseDate(a) || "9999-12-31").localeCompare(
        getReleaseDate(b) || "9999-12-31",
      );
      if (dateComparison !== 0) return dateComparison;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  }, [
    upcomingData,
    section,
    movieSectionFilter,
    bollywoodLanguage,
    movieGenre,
    seriesLanguage,
    seriesGenre,
    selectedFilterDate,
  ]);

  useLoadMoreOnScroll({
    sentinel: calendarLoadMoreRef,
    enabled: Boolean(hasNextPage) && !isFetchingNextPage && !upcomingError,
    onLoadMore: fetchNextPage,
    rootMargin: "500px 0px",
    revision: filteredUpcoming.length,
  });

  const releaseDateKeys = useMemo(() => {
    const keys = new Set<string>();
    filteredUpcoming.forEach((item) => {
      const dateKey = getReleaseDate(item);
      if (dateKey) keys.add(dateKey);
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [filteredUpcoming]);

  const releasesByDate = useMemo(() => {
    const map = new Map<string, (Movie | TVShow)[]>();
    filteredUpcoming.forEach((item) => {
      const dateKey = getReleaseDate(item);
      if (!dateKey) return;

      const existing = map.get(dateKey);
      if (existing) {
        existing.push(item);
      } else {
        map.set(dateKey, [item]);
      }
    });
    return map;
  }, [filteredUpcoming]);

  const allReleaseDateGroups = useMemo(
    () =>
      releaseDateKeys
        .map((dateKey) => {
          const date = parseDateKey(dateKey);
          if (!date) return null;
          return {
            dateKey,
            date,
            items: releasesByDate.get(dateKey) || [],
          };
        })
        .filter(
          (
            group,
          ): group is { dateKey: string; date: Date; items: (Movie | TVShow)[] } => group !== null,
        ),
    [releaseDateKeys, releasesByDate],
  );

  const releaseDateKeySet = useMemo(() => new Set(releaseDateKeys), [releaseDateKeys]);

  const calendarTimelineDates = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);

    return Array.from({ length: CALENDAR_TIMELINE_DAYS }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date,
        dateKey: formatLocalDate(date),
        showMonthLabel: index === 0 || date.getDate() === 1,
      };
    });
  }, []);

  const activeReleaseDateGroups = allReleaseDateGroups;
  const visibleReleaseDateGroups = activeReleaseDateGroups.slice(0, calendarGroupLimit);
  const hasMoreReleaseDateGroups =
    selectedFilterDate === "all" && activeReleaseDateGroups.length > calendarGroupLimit;
  const defaultReleaseDateLabel = visibleReleaseDateGroups[0]
    ? visibleReleaseDateGroups[0].date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "No releases yet";
  const selectedFilterDateObject =
    selectedFilterDate !== "all" ? parseDateKey(selectedFilterDate) : null;
  const selectedReleaseDateLabel = selectedFilterDateObject
    ? selectedFilterDateObject.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : defaultReleaseDateLabel;

  useEffect(() => {
    setCalendarGroupLimit(8);
  }, [
    section,
    movieSectionFilter,
    bollywoodLanguage,
    movieGenre,
    seriesGenre,
    seriesOtt,
    seriesLanguage,
    watchRegion,
    selectedFilterDate,
  ]);

  const upcomingSelects: BrowseSelect[] = section === "movies" ? [
    {
      id: "market", label: "Market", value: movieSectionFilter, options: MOVIE_SECTION_OPTIONS,
      onChange: (value) => updateFilterState({ movieSectionFilter: value as MovieSectionFilter }),
    },
    ...(movieSectionFilter === "bollywood" ? [{
      id: "language", label: "Language", value: bollywoodLanguage, options: BOLLYWOOD_LANGUAGE_OPTIONS,
      onChange: (value: string) => updateFilterState({ bollywoodLanguage: value }),
    }] : []),
    {
      id: "genre", label: "Genre", value: movieGenre || "all",
      options: [{ value: "all", label: "All genres" }, ...(movieGenres || []).map((genre: Genre) => ({ value: String(genre.id), label: genre.name }))],
      onChange: (value) => updateFilterState({ movieGenre: value === "all" ? "" : value }),
    },
  ] : section === "series" ? [
    {
      id: "region", label: "Watch region", value: watchRegion, options: UPCOMING_WATCH_REGION_OPTIONS,
      onChange: (value) => updateFilterState({ watchRegion: value as UpcomingFilterState["watchRegion"] }),
    },
    { id: "platform", label: "Platform", value: seriesOtt, options: providerOptions, onChange: (value) => updateFilterState({ seriesOtt: value }) },
    { id: "language", label: "Language", value: seriesLanguage, options: LANGUAGE_OPTIONS, onChange: (value) => updateFilterState({ seriesLanguage: value }) },
    {
      id: "genre", label: "Genre", value: seriesGenre || "all",
      options: [{ value: "all", label: "All genres" }, ...(tvGenres || []).map((genre: Genre) => ({ value: String(genre.id), label: genre.name }))],
      onChange: (value) => updateFilterState({ seriesGenre: value === "all" ? "" : value }),
    },
  ] : [];

  const labelFor = (options: ReadonlyArray<{ value: string; label: string }>, value: string) => options.find((option) => option.value === value)?.label;
  const upcomingActiveFilters: ActiveFilter[] = [
    ...(section === "movies" && movieSectionFilter !== "all" ? [{ key: "market", label: labelFor(MOVIE_SECTION_OPTIONS, movieSectionFilter) || movieSectionFilter, onClear: () => updateFilterState({ movieSectionFilter: "all" }) }] : []),
    ...(section === "movies" && movieSectionFilter === "bollywood" && bollywoodLanguage !== "all" ? [{ key: "blang", label: labelFor(BOLLYWOOD_LANGUAGE_OPTIONS, bollywoodLanguage) || bollywoodLanguage, onClear: () => updateFilterState({ bollywoodLanguage: "all" }) }] : []),
    ...(section === "movies" && movieGenre ? [{ key: "mgenre", label: movieGenres?.find((genre: Genre) => String(genre.id) === movieGenre)?.name || "Genre", onClear: () => updateFilterState({ movieGenre: "" }) }] : []),
    ...(section === "series" && seriesOtt !== "all" ? [{ key: "ott", label: labelFor(providerOptions, seriesOtt) || seriesOtt, onClear: () => updateFilterState({ seriesOtt: "all" }) }] : []),
    ...(section === "series" && seriesLanguage !== "all" ? [{ key: "slang", label: labelFor(LANGUAGE_OPTIONS, seriesLanguage) || seriesLanguage, onClear: () => updateFilterState({ seriesLanguage: "all" }) }] : []),
    ...(section === "series" && seriesGenre ? [{ key: "sgenre", label: tvGenres?.find((genre: Genre) => String(genre.id) === seriesGenre)?.name || "Genre", onClear: () => updateFilterState({ seriesGenre: "" }) }] : []),
    ...(selectedFilterDate !== "all" ? [{ key: "date", label: selectedReleaseDateLabel, onClear: () => updateFilterState({ selectedFilterDate: "all" }) }] : []),
  ];

  const handleItemClick = (item: Movie | TVShow) => {
    const isTV = isTVShow(item);
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/${isTV ? "tv" : "movie"}/${item.id}`, {
      state: { from: fromPath },
    });
  };

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pb-12">
        <BrowseHeader
          kicker="Release calendar"
          title="Upcoming"
          description="Every movie and series release in the next six months, day by day. Filter by section, language, platform and genre."
          icon={CalendarDays}
          backdropPath={filteredUpcoming.find((item) => item.backdrop_path)?.backdrop_path}
          resultLabel={!isLoading && filteredUpcoming.length ? `${filteredUpcoming.length} titles across ${activeReleaseDateGroups.length} dates` : null}
        />
        <div className="container mx-auto px-4">
          <BrowseFilters
            categories={UPCOMING_SECTIONS}
            activeCategory={section}
            onCategory={(value) => updateFilterState({ section: value })}
            genres={section === "movies" ? movieGenres : section === "series" ? tvGenres : undefined}
            selectedGenre={section === "movies" ? movieGenre : seriesGenre}
            onGenre={(value) => updateFilterState(section === "movies" ? { movieGenre: value } : { seriesGenre: value })}
            selects={upcomingSelects}
            activeFilters={upcomingActiveFilters}
            onReset={() => updateFilterState({ movieSectionFilter: "all", bollywoodLanguage: "all", movieGenre: "", seriesGenre: "", seriesOtt: "all", seriesLanguage: "all", selectedFilterDate: "all" })}
            note={section === "series" ? "Platform availability comes from TMDB for the selected watch region and varies by title." : section === "all" ? "Pick Movies or Series for genre, language and platform filters." : undefined}
          />

          {isLoading ? (
            <UpcomingTimelineSkeleton />
          ) : upcomingError ? (
            <div className="empty-state">
              <p className="text-base font-medium text-foreground mb-1">Failed to load upcoming releases</p>
              <p className="text-sm text-muted-foreground mb-4">Check your connection and try again.</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-sm text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="upcoming-date-strip surface-panel overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/40 px-4 py-2.5">
                  <p className="text-xs font-semibold text-foreground/90">
                    {selectedReleaseDateLabel}
                    <span className="ml-2 font-normal text-muted-foreground">{activeReleaseDateGroups.length} dates · {filteredUpcoming.length} titles</span>
                  </p>
                  <p className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Release dates
                  </p>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />

                  <div className="overflow-x-auto scrollbar-hide px-3 py-3">
                    <div className="flex w-max items-stretch gap-2">
                      <button
                        type="button"
                        onClick={() => updateFilterState({ selectedFilterDate: "all" })}
                        className={cn(
                          "min-w-[108px] rounded-lg border px-3 py-2 text-left transition-colors",
                          selectedFilterDate === "all"
                            ? "border-primary bg-gradient-to-b from-primary/20 to-primary/10 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
                            : "border-border/70 bg-gradient-to-b from-background/90 to-background/65 text-muted-foreground hover:border-primary/45 hover:text-foreground",
                        )}
                      >
                        <p className="text-[10px] uppercase tracking-wide">Filter</p>
                        <p className="mt-1 text-sm font-semibold">All Dates</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Reset</p>
                      </button>

                      {calendarTimelineDates.map((entry) => {
                        const isSelected = selectedFilterDate === entry.dateKey;
                        const hasRelease = releaseDateKeySet.has(entry.dateKey);
                        const isWeekend = entry.date.getDay() === 0 || entry.date.getDay() === 6;
                        const dayNumber = entry.date.getDate();
                        const monthShort = entry.date.toLocaleDateString("en-US", { month: "short" });
                        const weekdayShort = entry.date.toLocaleDateString("en-US", { weekday: "short" });

                        return (
                          <button
                            key={`timeline-${entry.dateKey}`}
                            type="button"
                            onClick={() => updateFilterState({ selectedFilterDate: entry.dateKey })}
                            className={cn(
                              "relative min-w-[98px] rounded-lg border px-3 py-2 text-left transition-colors",
                              isSelected
                                ? "border-primary bg-gradient-to-b from-primary/20 to-primary/10 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
                                : "border-border/70 bg-gradient-to-b from-background/90 to-background/65 text-muted-foreground hover:border-primary/45 hover:text-foreground",
                              isWeekend && !isSelected && "border-primary/20",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] uppercase tracking-wide">{weekdayShort}</p>
                              {entry.showMonthLabel && (
                                <span className="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/75">
                                  {monthShort}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-lg font-semibold leading-none">{dayNumber}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-wide">{monthShort}</p>
                            {hasRelease && (
                              <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {visibleReleaseDateGroups.length > 0 ? (
                visibleReleaseDateGroups.map((group) => {
                  const isSelected = selectedFilterDate !== "all" && group.dateKey === selectedFilterDate;
                  return (
                    <div
                      key={group.dateKey}
                    >
                      <section className={cn("upcoming-day", isSelected && "upcoming-day-selected")} aria-label={formatDateHeading(group.date)}>
                        <header className="upcoming-day-head">
                          <div className="upcoming-day-badge" aria-hidden="true">
                            <span className="text-[10px] font-bold uppercase tracking-wider">{group.date.toLocaleDateString("en-US", { month: "short" })}</span>
                            <span className="text-2xl font-black leading-none">{group.date.getDate()}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <h2 className="text-base font-bold">{formatDateHeading(group.date)}</h2>
                            <p className="text-xs text-muted-foreground">{getRelativeReleaseLabel(group.date)}</p>
                          </div>
                          <span className="pref-count">{group.items.length} {group.items.length === 1 ? "release" : "releases"}</span>
                        </header>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
                          {group.items.map((item) => (
                            <BrowsePosterCard
                              key={`${item.id}-${isTVShow(item) ? "tv" : "movie"}-${group.dateKey}`}
                              title={isTVShow(item) ? item.name : item.title}
                              posterPath={item.poster_path}
                              rating={item.vote_average}
                              language={item.original_language}
                              tag={isTVShow(item) ? "Series" : "Movie"}
                              onClick={() => handleItemClick(item)}
                            />
                          ))}
                        </div>
                      </section>
                    </div>
                  );
                })
              ) : isFetchingNextPage ? (
                <div className="empty-state">
                  <InlineLoadMoreSkeleton className="py-0 justify-center" />
                  <p className="text-sm text-muted-foreground mt-3">Loading release schedule...</p>
                </div>
              ) : (
                <div className="empty-state">
                  <p className="text-muted-foreground">No date-wise releases found yet.</p>
                </div>
              )}

              {hasMoreReleaseDateGroups && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setCalendarGroupLimit((current) => current + 8)}
                  >
                    Show more dates
                  </Button>
                </div>
              )}

              {hasNextPage && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more releases"}
                  </Button>
                </div>
              )}

              {isFetchingNextPage && (
                <InlineLoadMoreSkeleton />
              )}

              {!hasNextPage && filteredUpcoming.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  You are all caught up.
                </p>
              )}

              <div ref={calendarLoadMoreRef} className="h-10 w-full" />
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
