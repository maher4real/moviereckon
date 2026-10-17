import { useMemo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  discoverTVShows,
  getTVGenres,
  getTVWatchProviderCatalog,
  getPopularTVShows,
  getTopRatedTVShows,
  TVShow,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import { PosterGridSkeleton, InlineLoadMoreSkeleton } from "@/frontend/components/AppSkeletons";
import { BrowseFilters, BrowseHeader, BrowsePosterCard, type ActiveFilter, type BrowseSelect } from "@/frontend/components/browse/BrowseLayout";
import { cn, isAnimeLike, formatLocalDate } from "@/shared/lib/utils";
import { getNextTmdbPage, mergeUniquePages, useCanonicalSearchParams, useLoadMoreOnScroll } from "@/frontend/hooks/useBrowseFeed";
import { SERIES_LANGUAGE_OPTIONS } from "@/shared/lib/catalogue";
import { CalendarDays, Clapperboard, Languages, Star, TrendingUp, Tv } from "lucide-react";
import {
  buildSeriesDiscoverFilters,
  getSeriesBrowseQueryKey,
  getSeriesResolvedLanguage,
  getVerifiedSeriesProviderOptions,
  getWatchRegionOptions,
  isSeriesSpecialCategory,
  normalizeSeriesBrowseState,
  parseSeriesBrowseState,
  serializeSeriesBrowseState,
  type SeriesBrowseState,
  type SeriesCategory,
  type SeriesSortOption,
  type WatchRegion,
} from "./browseFilterState";

export type { SeriesCategory } from "./browseFilterState";

type SortOption = SeriesSortOption;

interface SeriesPage {
  results: TVShow[];
  total_pages: number;
  page: number;
  total_results: number;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "first_air_date.desc", label: "Newest" },
  { value: "first_air_date.asc", label: "Earliest Release" },
];
const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

const LANGUAGE_OPTIONS = SERIES_LANGUAGE_OPTIONS;

const SERIES_CATEGORY_OPTIONS = [
  { value: "all", label: "All Series", Icon: Tv },
  { value: "popular", label: "Popular", Icon: TrendingUp },
  { value: "top_rated", label: "Top Rated", Icon: Star },
  { value: "upcoming", label: "Upcoming", Icon: CalendarDays },
  { value: "korean", label: "K-Drama", Icon: Languages },
  { value: "indian", label: "Indian", Icon: Languages },
  { value: "anime", label: "Anime", Icon: Clapperboard },
] satisfies { value: SeriesCategory; label: string; Icon: typeof Tv }[];

export function getSeriesCardTagLabel({
  category,
  ottFilter,
  ottLabel,
}: {
  category: SeriesCategory;
  ottFilter: string;
  ottLabel?: string;
}): string | undefined {
  if (ottFilter !== "all") return ottLabel || undefined;
  if (category === "anime") return "Anime";
  if (category === "korean") return "K-Drama";
  if (category === "indian") return undefined;
  return "OTT Mix";
}

export { getSeriesWatchProviderFilter } from "./browseFilterState";

const CATEGORY_COPY: Record<SeriesCategory, string> = {
  all: "Every series on TMDB. Filter by platform, language, genre and year.",
  popular: "The shows drawing the biggest audiences right now.",
  top_rated: "The highest-rated series of all time.",
  upcoming: "Series premiering soon.",
  korean: "Korean dramas, from romance to thrillers.",
  indian: "Indian originals across the major streaming platforms.",
  anime: "Japanese animation, from long-running classics to new seasons.",
};

export default function Series() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const searchParamString = searchParams.toString();
  const seriesState = useMemo(
    () => parseSeriesBrowseState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );
  const { category, selectedGenre, selectedYear, sortBy, ottFilter, selectedLanguage, watchRegion } = seriesState;
  const isSpecialCategory = isSeriesSpecialCategory(category);
  const canonicalSearchParamString = useMemo(
    () => serializeSeriesBrowseState(new URLSearchParams(searchParamString), seriesState).toString(),
    [searchParamString, seriesState],
  );

  useCanonicalSearchParams(canonicalSearchParamString, searchParamString, setSearchParams);

  const updateSeriesState = (changes: Partial<SeriesBrowseState>) => {
    const nextState = normalizeSeriesBrowseState({ ...seriesState, ...changes });
    setSearchParams(serializeSeriesBrowseState(searchParams, nextState));
  };

  const { data: genres } = useQuery({
    queryKey: ["tv-genres"],
    queryFn: getTVGenres,
    staleTime: 1000 * 60 * 60,
  });

  const { data: providerCatalog } = useQuery({
    queryKey: ["tv-watch-provider-catalog", watchRegion],
    queryFn: ({ signal }) => getTVWatchProviderCatalog(watchRegion, signal),
    staleTime: 1000 * 60 * 60 * 6,
  });

  const providerOptions = useMemo(
    () => getVerifiedSeriesProviderOptions(watchRegion, providerCatalog),
    [providerCatalog, watchRegion],
  );

  const resolvedLanguage = getSeriesResolvedLanguage(category, selectedLanguage);

  const normalizedGenre = category === "anime" ? "16" : selectedGenre || undefined;

  const {
    data: contentData,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<SeriesPage>({
    queryKey: getSeriesBrowseQueryKey(seriesState),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;
      const needsFilteredDiscover = !!normalizedGenre || !!resolvedLanguage || !!selectedYear || ottFilter !== "all";
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);
      if (category === "popular" && !needsFilteredDiscover) {
        return getPopularTVShows(page);
      }

      if (category === "top_rated" && !needsFilteredDiscover) {
        return getTopRatedTVShows(page);
      }

      if (category === "upcoming") {
        return discoverTVShows(buildSeriesDiscoverFilters(seriesState, page, tomorrowStr));
      }

      return discoverTVShows(buildSeriesDiscoverFilters(seriesState, page, tomorrowStr));
    },
    getNextPageParam: getNextTmdbPage,
    staleTime: 1000 * 60 * 5,
    enabled: !!user,
  });

  const filteredSeries = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatLocalDate(tomorrow);
    return mergeUniquePages<TVShow, SeriesPage>(contentData?.pages, (item) => {
      const animeLike = isAnimeLike(item);
      if (category === "anime" && !animeLike) return false;
      if (category !== "anime" && animeLike) return false;
      if (category === "upcoming" && item.first_air_date < tomorrowStr) return false;
      if (selectedYear && !item.first_air_date?.startsWith(`${selectedYear}-`)) return false;
      return !(selectedLanguage !== "all" && category === "all" && item.original_language !== selectedLanguage);
    });
  }, [contentData, category, selectedLanguage, selectedYear]);

  useLoadMoreOnScroll({
    sentinel: loadMoreRef,
    enabled: Boolean(hasNextPage) && !isFetchingNextPage,
    onLoadMore: fetchNextPage,
    revision: filteredSeries.length,
  });

  const ottLabel = useMemo(
    () => providerOptions.find((opt) => opt.value === ottFilter)?.label,
    [ottFilter, providerOptions],
  );

  const cardOttLabel = useMemo(() => {
    return getSeriesCardTagLabel({ category, ottFilter, ottLabel });
  }, [ottFilter, ottLabel, category]);

  const genreLabel = genres?.find((genre) => String(genre.id) === selectedGenre)?.name;
  const sortLabel = sortOptions.find((option) => option.value === sortBy)?.label;
  const languageLabel = LANGUAGE_OPTIONS.find((option) => option.value === selectedLanguage)?.label;
  const activeCategory = SERIES_CATEGORY_OPTIONS.find((option) => option.value === category) ?? SERIES_CATEGORY_OPTIONS[0];
  const languageLocked = category === "korean" || category === "indian" || category === "anime";
  const genreDisabled = isSpecialCategory || category === "anime";
  const totalResults = contentData?.pages[0]?.total_results;

  const selects: BrowseSelect[] = [
    {
      id: "sort", label: "Sort by", value: sortBy, options: sortOptions, disabled: isSpecialCategory,
      onChange: (value) => updateSeriesState({ sortBy: value as SortOption }),
    },
    {
      id: "genre", label: "Genre", value: selectedGenre || "all", disabled: genreDisabled,
      options: [{ value: "all", label: "All genres" }, ...(genres || []).map((genre) => ({ value: String(genre.id), label: genre.name }))],
      onChange: (value) => updateSeriesState({ selectedGenre: value === "all" ? "" : value }),
    },
    {
      id: "platform", label: "Platform", value: ottFilter, options: providerOptions,
      onChange: (value) => updateSeriesState({ ottFilter: value }),
    },
    {
      id: "region", label: "Watch region", value: watchRegion, options: getWatchRegionOptions(),
      onChange: (value) => updateSeriesState({ watchRegion: value as WatchRegion }),
    },
    {
      id: "language", label: "Language", value: selectedLanguage, options: LANGUAGE_OPTIONS, disabled: languageLocked,
      onChange: (value) => updateSeriesState({ selectedLanguage: value }),
    },
    {
      id: "year", label: "First aired", value: selectedYear || "all",
      options: [{ value: "all", label: "Any year" }, ...yearOptions.map((year) => ({ value: String(year), label: String(year) }))],
      onChange: (value) => updateSeriesState({ selectedYear: value === "all" ? "" : value }),
    },
  ];

  const activeFilters: ActiveFilter[] = [
    ...(selectedGenre && genreLabel ? [{ key: "genre", label: genreLabel, onClear: () => updateSeriesState({ selectedGenre: "" }) }] : []),
    ...(ottFilter !== "all" && ottLabel ? [{ key: "platform", label: ottLabel, onClear: () => updateSeriesState({ ottFilter: "all" }) }] : []),
    ...(!languageLocked && selectedLanguage !== "all" && languageLabel ? [{ key: "language", label: languageLabel, onClear: () => updateSeriesState({ selectedLanguage: "all" }) }] : []),
    ...(selectedYear ? [{ key: "year", label: selectedYear, onClear: () => updateSeriesState({ selectedYear: "" }) }] : []),
    ...(!isSpecialCategory && sortBy !== "popularity.desc" && sortLabel ? [{ key: "sort", label: sortLabel, onClear: () => updateSeriesState({ sortBy: "popularity.desc" }) }] : []),
  ];

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pb-12">
        <BrowseHeader
          kicker="Browse library"
          title={category === "all" ? "TV Series" : activeCategory.label}
          description={CATEGORY_COPY[category]}
          icon={Tv}
          backdropPath={filteredSeries.find((show) => show.backdrop_path)?.backdrop_path}
          resultLabel={!isLoading && totalResults ? `${totalResults.toLocaleString()} titles` : null}
        />
        <div className="container mx-auto px-4">
          <BrowseFilters
            categories={SERIES_CATEGORY_OPTIONS}
            activeCategory={category}
            onCategory={(value) => updateSeriesState({ category: value })}
            genres={genres}
            selectedGenre={selectedGenre}
            onGenre={(value) => updateSeriesState({ selectedGenre: value })}
            genreDisabled={genreDisabled}
            selects={selects}
            activeFilters={activeFilters}
            onReset={() => updateSeriesState({ selectedGenre: "", selectedYear: "", sortBy: "popularity.desc", ottFilter: "all", selectedLanguage: "all" })}
            note={<>
              {isSpecialCategory && `${activeCategory.label} uses its fixed ordering, so genre and sort are unavailable. `}
              Platform availability comes from TMDB for the selected watch region and varies by title.
              {category === "indian" && " Indian uses the supported provider subset for this region."}
            </>}
          />

          {isLoading ? (
            <PosterGridSkeleton count={18} />
          ) : (
            <>
              <div className={cn("content-grid", isFetching && !isFetchingNextPage && "opacity-75")}>
                {filteredSeries.map((item, index) => (
                  <BrowsePosterCard
                    key={item.id}
                    title={item.name}
                    posterPath={item.poster_path}
                    rating={item.vote_average}
                    language={item.original_language}
                    year={item.first_air_date?.split("-")[0]}
                    tag={cardOttLabel}
                    priority={index < 8}
                    onClick={() =>
                      navigate(`/tv/${item.id}`, {
                        state: { from: `${location.pathname}${location.search}${location.hash}` },
                      })
                    }
                  />
                ))}
              </div>

              {filteredSeries.length === 0 && (
                <div className="empty-state">
                  <p className="font-semibold">No series match these filters.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try another platform or language, or clear the filters.</p>
                </div>
              )}

              <div ref={loadMoreRef} className="h-12 w-full" />

              {isFetchingNextPage && <InlineLoadMoreSkeleton />}

              {!hasNextPage && filteredSeries.length > 0 && (
                <p className="py-2 text-center text-sm text-muted-foreground">You are all caught up.</p>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
