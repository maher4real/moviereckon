import { useEffect, useMemo, memo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  discoverTVShows,
  getTVGenres,
  getTVWatchProviderCatalog,
  getPopularTVShows,
  getTopRatedTVShows,
  TVShow,
  Genre,
  getPosterUrl,
  getLanguageBadgeClass,
  getLanguageLabel,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import {
  AppPageSkeleton,
  PosterGridSkeleton,
  InlineLoadMoreSkeleton,
} from "@/frontend/components/AppSkeletons";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select";
import { cn, formatLocalDate, isAnimeLike } from "@/shared/lib/utils";
import { CalendarDays, Clapperboard, Languages, Play, Star, TrendingUp, Tv } from "lucide-react";
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

const LANGUAGE_OPTIONS = [
  { value: "all", label: "All Languages" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ko", label: "Korean" },
  { value: "ja", label: "Japanese" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

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

const PosterCard = memo(
  ({
    item,
    onClick,
    ottLabel,
    priority = false,
  }: {
    item: TVShow;
    onClick: () => void;
    ottLabel?: string;
    priority?: boolean;
  }) => (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="cursor-pointer group"
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
        <MediaImage
          src={getPosterUrl(item.poster_path, "medium")}
          alt={item.name}
          className="w-full h-full object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          priority={priority}
          fallbackSrc="/fallbacks/poster.svg"
        />
        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <motion.div
            className="poster-play-button"
            initial={false}
            whileHover={{ scale: 1.08 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
          >
            <Play className="h-5 w-5 fill-current" />
          </motion.div>
        </div>
        {item.vote_average > 0 && (
          <div className="rating-badge absolute top-2 right-2">
            <Star className="h-3 w-3 fill-current" />
            {item.vote_average.toFixed(1)}
          </div>
        )}
        <div className={cn("language-badge absolute top-2 left-2", getLanguageBadgeClass(item.original_language))}>
          {item.original_language.toUpperCase()}
        </div>
        {ottLabel && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 text-[10px] font-semibold uppercase tracking-wide">
            {ottLabel}
          </div>
        )}
      </div>
      <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
        {item.name}
      </h3>
      <p className="text-xs text-muted-foreground">
        {item.first_air_date?.split("-")[0] || ""} • {getLanguageLabel(item.original_language)}
      </p>
    </motion.div>
  )
);

PosterCard.displayName = "PosterCard";

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

  useEffect(() => {
    if (canonicalSearchParamString === searchParamString) return;
    setSearchParams(new URLSearchParams(canonicalSearchParamString), { replace: true });
  }, [canonicalSearchParamString, searchParamString, setSearchParams]);

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
    getNextPageParam: (lastPage) => {
      if (!lastPage?.page || !lastPage?.total_pages) return undefined;
      return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!user,
  });

  const filteredSeries = useMemo(() => {
    if (!contentData?.pages) return [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatLocalDate(tomorrow);

    const dedupe = new Set<number>();
    const merged: TVShow[] = [];

    contentData.pages.forEach((page) => {
      (page.results || []).forEach((item) => {
        if (dedupe.has(item.id)) return;

        const animeLike = isAnimeLike(item);
        if (category === "anime" && !animeLike) return;
        if (category !== "anime" && animeLike) return;
        if (category === "upcoming" && item.first_air_date < tomorrowStr) return;
        if (selectedYear && !item.first_air_date?.startsWith(`${selectedYear}-`)) return;
        if (selectedLanguage !== "all" && category === "all" && item.original_language !== selectedLanguage) {
          return;
        }

        dedupe.add(item.id);
        merged.push(item);
      });
    });

    return merged;
  }, [contentData, category, selectedLanguage, selectedYear]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, filteredSeries.length]);

  const ottLabel = useMemo(
    () => providerOptions.find((opt) => opt.value === ottFilter)?.label,
    [ottFilter, providerOptions],
  );

  const cardOttLabel = useMemo(() => {
    return getSeriesCardTagLabel({ category, ottFilter, ottLabel });
  }, [ottFilter, ottLabel, category]);

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="container mx-auto px-4">
          <div className="page-heading">
            <div className="page-heading-icon">
              <Tv className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="page-kicker">Browse Library</p>
              <h1 className="page-title">TV Series</h1>
            </div>
          </div>

          <div className="filter-panel">
            <div className="filter-row">
              {SERIES_CATEGORY_OPTIONS.map((cat) => {
                const active = category === cat.value;
                return (
                <Button
                  key={cat.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => updateSeriesState({ category: cat.value })}
                  className={cn("filter-chip", active && "filter-chip-active")}
                >
                  <cat.Icon className="h-4 w-4" />
                  {cat.label}
                </Button>
                );
              })}
            </div>
          </div>

          <div className="filter-panel flex flex-wrap gap-3">
            <Select
              value={selectedGenre}
              onValueChange={(v) => updateSeriesState({ selectedGenre: v === "all" ? "" : v })}
              disabled={isSpecialCategory || category === "anime"}
            >
              <SelectTrigger className="select-surface w-[150px]">
                <SelectValue placeholder="All Genres" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="all">All Genres</SelectItem>
                {genres?.map((g: Genre) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(v) => updateSeriesState({ sortBy: v as SortOption })}
              disabled={isSpecialCategory}
            >
              <SelectTrigger className="select-surface w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={watchRegion}
              onValueChange={(value) => updateSeriesState({ watchRegion: value as WatchRegion })}
            >
              <SelectTrigger aria-label="Watch region" className="select-surface w-[170px]">
                <SelectValue placeholder="Watch Region" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {getWatchRegionOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ottFilter} onValueChange={(value) => updateSeriesState({ ottFilter: value })}>
              <SelectTrigger className="select-surface w-[160px]">
                <SelectValue placeholder="OTT Platform" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {providerOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedYear}
              onValueChange={(v) => updateSeriesState({ selectedYear: v === "all" ? "" : v })}
            >
              <SelectTrigger className="select-surface w-[150px]">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50 max-h-[300px]">
                <SelectItem value="all">All Years</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedLanguage}
              onValueChange={(value) => updateSeriesState({ selectedLanguage: value })}
              disabled={category === "korean" || category === "indian" || category === "anime"}
            >
              <SelectTrigger className="select-surface w-[170px]">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isSpecialCategory && (
            <p className="mt-3 text-xs text-muted-foreground">
              {category === "popular" ? "Popular" : "Top Rated"} uses its fixed category ordering; genre and sort are unavailable.
              Year, language, and platform filters still apply.
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Platform choices use TMDB&apos;s catalog for the selected watch region when available, with a curated
            supported fallback. Availability is title-specific; the selected language does not change the watch region.
            {category === "indian" && " Indian All OTT uses the supported provider subset for this region."}
          </p>

          {isLoading ? (
            <PosterGridSkeleton count={18} />
          ) : (
            <>
              <div
                className={cn(
                  "content-grid",
                  isFetching && !isFetchingNextPage && "opacity-75",
                )}
              >
                {filteredSeries.map((item, index) => (
                  <PosterCard
                    key={item.id}
                    item={item}
                    priority={index < 8}
                    onClick={() =>
                      navigate(`/tv/${item.id}`, {
                        state: {
                          from: `${location.pathname}${location.search}${location.hash}`,
                        },
                      })
                    }
                    ottLabel={cardOttLabel}
                  />
                ))}
              </div>

              {filteredSeries.length === 0 && (
                <div className="empty-state">
                  <p className="text-muted-foreground">No series found for the selected filters.</p>
                </div>
              )}

              <div ref={loadMoreRef} className="h-12 w-full" />

              {isFetchingNextPage && (
                <InlineLoadMoreSkeleton />
              )}

              {!hasNextPage && filteredSeries.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  You are all caught up.
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
