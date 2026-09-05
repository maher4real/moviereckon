import { useEffect, useMemo, memo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  discoverMovies,
  getMovieGenres,
  getBollywoodMovies,
  getHollywoodMovies,
  getNowPlayingMovies,
  getTrendingMovies,
  Movie,
  Genre,
  getPosterUrl,
  getLanguageBadgeClass,
} from "@/shared/lib/tmdb";
import type { TMDBResponse } from "@/shared/lib/tmdb";
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
import { Clapperboard, Film, Globe, Languages, Play, Star, TrendingUp } from "lucide-react";
import {
  buildMovieDiscoverFilters,
  getMovieBrowseQueryKey,
  isMovieSpecialCategory,
  normalizeMovieBrowseState,
  parseMovieBrowseState,
  serializeMovieBrowseState,
  type MovieBrowseState,
  type MovieCategory,
  type MovieSortOption,
} from "./browseFilterState";

type SortOption = MovieSortOption;

interface MoviePage {
  results: Movie[];
  total_pages: number;
  page: number;
  total_results: number;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "release_date.desc", label: "Newest" },
  { value: "revenue.desc", label: "Highest Grossing" },
];
const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

const BOLLYWOOD_LANGUAGE_OPTIONS = [
  { value: "all", label: "All Languages" },
  { value: "hi", label: "Hindi" },
  { value: "gu", label: "Gujarati" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
];
const BOLLYWOOD_LANGUAGE_CODES = ["hi", "gu", "ta", "te", "kn"] as const;
const BOLLYWOOD_LANGUAGE_SET: ReadonlySet<string> = new Set(BOLLYWOOD_LANGUAGE_CODES);
const TMDB_PAGE_SIZE = 20;

const MOVIE_CATEGORY_OPTIONS = [
  { value: "all", label: "All Movies", Icon: Film },
  { value: "now_playing", label: "Now Playing", Icon: Clapperboard },
  { value: "trending", label: "Trending", Icon: TrendingUp },
  { value: "bollywood", label: "Bollywood", Icon: Languages },
  { value: "hollywood", label: "Hollywood", Icon: Globe },
] satisfies { value: MovieCategory; label: string; Icon: typeof Film }[];

const PosterCard = memo(({ item, onClick, priority = false }: { item: Movie; onClick: () => void; priority?: boolean }) => (
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
        alt={item.title}
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
    </div>
    <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
      {item.title}
    </h3>
    <p className="text-xs text-muted-foreground">{item.release_date?.split("-")[0] || ""}</p>
  </motion.div>
));

PosterCard.displayName = "PosterCard";

export default function Movies() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const searchParamString = searchParams.toString();
  const movieState = useMemo(
    () => parseMovieBrowseState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );
  const { category, selectedGenre, selectedYear, bollywoodLanguage, sortBy } = movieState;
  const isSpecialCategory = isMovieSpecialCategory(category);
  const canonicalSearchParamString = useMemo(
    () => serializeMovieBrowseState(new URLSearchParams(searchParamString), movieState).toString(),
    [movieState, searchParamString],
  );

  useEffect(() => {
    if (canonicalSearchParamString === searchParamString) return;
    setSearchParams(new URLSearchParams(canonicalSearchParamString), { replace: true });
  }, [canonicalSearchParamString, searchParamString, setSearchParams]);

  const updateMovieState = (changes: Partial<MovieBrowseState>) => {
    const nextState = normalizeMovieBrowseState({ ...movieState, ...changes });
    setSearchParams(serializeMovieBrowseState(searchParams, nextState));
  };

  const { data: genres } = useQuery({
    queryKey: ["movie-genres"],
    queryFn: getMovieGenres,
    staleTime: 1000 * 60 * 60,
  });

  const {
    data: contentData,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<MoviePage>({
    queryKey: getMovieBrowseQueryKey(movieState),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;

      if (category === "now_playing") return getNowPlayingMovies(page);
      if (category === "trending") {
        const results = await getTrendingMovies("week");
        return { results, total_pages: 1, page: 1, total_results: results.length };
      }

      if (category === "bollywood" && bollywoodLanguage === "all") {
        // A per-language page is not globally ordered after the five source
        // pages are merged. Fetch the cumulative source pages needed for this
        // page, sort the combined set, and then slice the requested global
        // page so Back/Next never reorders titles under one sort label.
        const sourcePages = await Promise.all(
          BOLLYWOOD_LANGUAGE_CODES.map(async (language) => {
            const responses = await Promise.allSettled(
              Array.from({ length: page }, (_, index) =>
                discoverMovies({
                  page: index + 1,
                  sort_by: sortBy,
                  with_genres: selectedGenre || undefined,
                  with_original_language: language,
                  region: "IN",
                  "primary_release_date.gte": selectedYear ? `${selectedYear}-01-01` : undefined,
                  "primary_release_date.lte": selectedYear ? `${selectedYear}-12-31` : undefined,
                }),
              ),
            );
            return { language, responses };
          }),
        );

        const successfulPages = sourcePages.flatMap(({ responses }) =>
          responses.flatMap((response) => (response.status === "fulfilled" ? [response.value] : [])),
        );

        if (successfulPages.length === 0) {
          throw new Error("Unable to load the Bollywood movie sources. Please try again.");
        }

        const deduped = new Map<number, Movie>();
        successfulPages.forEach((data) => {
          (data.results || []).forEach((movie) => {
            if (!deduped.has(movie.id)) {
              deduped.set(movie.id, movie);
            }
          });
        });

        const sortMovies = (a: Movie, b: Movie) => {
          if (sortBy === "vote_average.desc") return b.vote_average - a.vote_average;
          if (sortBy === "release_date.desc") {
            return (b.release_date || "").localeCompare(a.release_date || "");
          }
          // `revenue.desc` is not present on discover payloads, fallback to popularity.
          return b.popularity - a.popularity;
        };

        const totalResults = sourcePages.reduce((total, source) => {
          const firstSuccessfulPage = source.responses.find(
            (response): response is PromiseFulfilledResult<TMDBResponse<Movie>> => response.status === "fulfilled",
          );
          return total + (firstSuccessfulPage?.value.total_results || 0);
        }, 0);

        const sortedResults = Array.from(deduped.values()).sort(sortMovies);
        const pageStart = (page - 1) * TMDB_PAGE_SIZE;

        return {
          page,
          results: sortedResults.slice(pageStart, pageStart + TMDB_PAGE_SIZE),
          total_pages: Math.max(1, Math.ceil(Math.max(totalResults, sortedResults.length) / TMDB_PAGE_SIZE)),
          total_results: Math.max(totalResults, sortedResults.length),
        };
      }

      // Fast path for common Bollywood/Hollywood tabs to reduce perceived lag.
      if (category === "hollywood" && !selectedGenre && !selectedYear && sortBy === "popularity.desc") {
        return getHollywoodMovies(page);
      }
      if (
        category === "bollywood" &&
        bollywoodLanguage === "hi" &&
        !selectedGenre &&
        !selectedYear &&
        sortBy === "popularity.desc"
      ) {
        return getBollywoodMovies(page);
      }

      const filters = buildMovieDiscoverFilters(movieState, page);
      if (!filters) {
        throw new Error(`Unsupported movie category: ${category}`);
      }
      return discoverMovies(filters);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.page || !lastPage?.total_pages) return undefined;
      return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;

    void queryClient.prefetchInfiniteQuery({
      queryKey: getMovieBrowseQueryKey(
        normalizeMovieBrowseState({ category: "hollywood" }),
      ),
      initialPageParam: 1,
      queryFn: async ({ pageParam }) => getHollywoodMovies(Number(pageParam) || 1),
      getNextPageParam: (lastPage: TMDBResponse<Movie>) => {
        if (!lastPage?.page || !lastPage?.total_pages) return undefined;
        return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
      },
      staleTime: 1000 * 60 * 10,
    });

    void queryClient.prefetchInfiniteQuery({
      queryKey: getMovieBrowseQueryKey(
        normalizeMovieBrowseState({ category: "bollywood", bollywoodLanguage: "hi" }),
      ),
      initialPageParam: 1,
      queryFn: async ({ pageParam }) => getBollywoodMovies(Number(pageParam) || 1),
      getNextPageParam: (lastPage: TMDBResponse<Movie>) => {
        if (!lastPage?.page || !lastPage?.total_pages) return undefined;
        return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
      },
      staleTime: 1000 * 60 * 10,
    });
  }, [user, queryClient]);

  const allMovies = useMemo(() => {
    if (!contentData?.pages) return [];

    const today = formatLocalDate(new Date());

    const dedupe = new Set<number>();
    const merged: Movie[] = [];

    contentData.pages.forEach((page) => {
      (page.results || []).forEach((movie) => {
        if (dedupe.has(movie.id)) return;

        if (category === "now_playing" && movie.release_date > today) return;
        if (selectedYear && !movie.release_date?.startsWith(`${selectedYear}-`)) return;
        if (
          category === "bollywood" &&
          bollywoodLanguage === "all" &&
          !BOLLYWOOD_LANGUAGE_SET.has(movie.original_language)
        ) {
          return;
        }
        if (
          category === "bollywood" &&
          bollywoodLanguage !== "all" &&
          movie.original_language !== bollywoodLanguage
        ) {
          return;
        }
        if (isAnimeLike(movie)) return;

        dedupe.add(movie.id);
        merged.push(movie);
      });
    });

    return merged;
  }, [contentData, category, selectedYear, bollywoodLanguage]);

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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, allMovies.length]);

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="container mx-auto px-4">
          <div className="page-heading">
            <div className="page-heading-icon">
              <Film className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="page-kicker">Browse Library</p>
              <h1 className="page-title">Movies</h1>
            </div>
          </div>

          <div className="filter-panel">
            <div className="filter-row">
              {MOVIE_CATEGORY_OPTIONS.map((cat) => {
                const active = category === cat.value;
                return (
                <Button
                  key={cat.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => updateMovieState({ category: cat.value })}
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
              onValueChange={(v) => updateMovieState({ selectedGenre: v === "all" ? "" : v })}
              disabled={isSpecialCategory}
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
              onValueChange={(v) => updateMovieState({ sortBy: v as SortOption })}
              disabled={isSpecialCategory}
            >
              <SelectTrigger className="select-surface w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {sortOptions
                  .filter((opt) => !(category === "bollywood" && bollywoodLanguage === "all" && opt.value === "revenue.desc"))
                  .map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedYear}
              onValueChange={(v) => updateMovieState({ selectedYear: v === "all" ? "" : v })}
              disabled={isSpecialCategory}
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

            {category === "bollywood" && (
              <Select
                value={bollywoodLanguage}
                onValueChange={(value) => updateMovieState({ bollywoodLanguage: value })}
              >
                <SelectTrigger className="select-surface w-[170px]">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  {BOLLYWOOD_LANGUAGE_OPTIONS.map((language) => (
                    <SelectItem key={language.value} value={language.value}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {isSpecialCategory && (
              <p className="basis-full text-xs text-muted-foreground">
                {category === "now_playing" ? "Now Playing" : "Trending"} uses its fixed source ordering and release window;
                genre, year, and sort are unavailable for this category.
              </p>
            )}
          </div>

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
                {allMovies.map((item, index) => (
                  <PosterCard
                    key={item.id}
                    item={item}
                    priority={index < 8}
                    onClick={() =>
                      navigate(`/movie/${item.id}`, {
                        state: {
                          from: `${location.pathname}${location.search}${location.hash}`,
                        },
                      })
                    }
                  />
                ))}
              </div>

              {allMovies.length === 0 && (
                <div className="empty-state">
                  <p className="text-muted-foreground">No movies found for the selected filters.</p>
                </div>
              )}

              <div ref={loadMoreRef} className="h-12 w-full" />

              {isFetchingNextPage && (
                <InlineLoadMoreSkeleton />
              )}

              {!hasNextPage && allMovies.length > 0 && (
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
