import { useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  discoverMovies,
  getMovieGenres,
  getBollywoodMovies,
  getHollywoodMovies,
  getNowPlayingMovies,
  getTrendingMovies,
  Movie,
} from "@/shared/lib/tmdb";
import type { TMDBResponse } from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import { PosterGridSkeleton, InlineLoadMoreSkeleton } from "@/frontend/components/AppSkeletons";
import { BrowseFilters, BrowseHeader, BrowsePosterCard, type ActiveFilter, type BrowseSelect } from "@/frontend/components/browse/BrowseLayout";
import { cn, formatLocalDate, isAnimeLike } from "@/shared/lib/utils";
import { getNextTmdbPage, mergeUniquePages, useCanonicalSearchParams, useLoadMoreOnScroll } from "@/frontend/hooks/useBrowseFeed";
import { BOLLYWOOD_LANGUAGE_CODES, BOLLYWOOD_LANGUAGE_OPTIONS } from "@/shared/lib/catalogue";
import { Clapperboard, Film, Globe, Languages, TrendingUp } from "lucide-react";
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

const BOLLYWOOD_LANGUAGE_SET: ReadonlySet<string> = new Set(BOLLYWOOD_LANGUAGE_CODES);
const TMDB_PAGE_SIZE = 20;

const MOVIE_CATEGORY_OPTIONS = [
  { value: "all", label: "All Movies", Icon: Film },
  { value: "now_playing", label: "Now Playing", Icon: Clapperboard },
  { value: "trending", label: "Trending", Icon: TrendingUp },
  { value: "bollywood", label: "Bollywood", Icon: Languages },
  { value: "hollywood", label: "Hollywood", Icon: Globe },
] satisfies { value: MovieCategory; label: string; Icon: typeof Film }[];

const CATEGORY_COPY: Record<MovieCategory, string> = {
  all: "Every film in the TMDB catalogue. Narrow it down by genre, year and sort order.",
  now_playing: "Films in cinemas right now, in their current release window.",
  trending: "What everyone is watching this week.",
  bollywood: "Hindi and South Indian cinema, from new releases to classics.",
  hollywood: "English-language films from the major studios and beyond.",
};

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

  useCanonicalSearchParams(canonicalSearchParamString, searchParamString, setSearchParams);

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
            // Earlier source pages come from the query cache, so loading page N
            // only requests the five new language pages instead of N * 5.
            const responses = await Promise.allSettled(
              Array.from({ length: page }, (_, index) =>
                queryClient.fetchQuery({
                  queryKey: ["bollywood-source-page", language, sortBy, selectedGenre, selectedYear, index + 1],
                  queryFn: () => discoverMovies({
                    page: index + 1,
                    sort_by: sortBy,
                    with_genres: selectedGenre || undefined,
                    with_original_language: language,
                    region: "IN",
                    "primary_release_date.gte": selectedYear ? `${selectedYear}-01-01` : undefined,
                    "primary_release_date.lte": selectedYear ? `${selectedYear}-12-31` : undefined,
                  }),
                  staleTime: 1000 * 60 * 10,
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
    getNextPageParam: getNextTmdbPage,
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
      getNextPageParam: getNextTmdbPage,
      staleTime: 1000 * 60 * 10,
    });

    void queryClient.prefetchInfiniteQuery({
      queryKey: getMovieBrowseQueryKey(
        normalizeMovieBrowseState({ category: "bollywood", bollywoodLanguage: "hi" }),
      ),
      initialPageParam: 1,
      queryFn: async ({ pageParam }) => getBollywoodMovies(Number(pageParam) || 1),
      getNextPageParam: getNextTmdbPage,
      staleTime: 1000 * 60 * 10,
    });
  }, [user, queryClient]);

  const allMovies = useMemo(() => {
    const today = formatLocalDate(new Date());
    return mergeUniquePages<Movie, MoviePage>(contentData?.pages, (movie) => {
      if (category === "now_playing" && movie.release_date > today) return false;
      if (selectedYear && !movie.release_date?.startsWith(`${selectedYear}-`)) return false;
      if (category === "bollywood") {
        if (bollywoodLanguage === "all" && !BOLLYWOOD_LANGUAGE_SET.has(movie.original_language)) return false;
        if (bollywoodLanguage !== "all" && movie.original_language !== bollywoodLanguage) return false;
      }
      return !isAnimeLike(movie);
    });
  }, [contentData, category, selectedYear, bollywoodLanguage]);

  useLoadMoreOnScroll({
    sentinel: loadMoreRef,
    enabled: Boolean(hasNextPage) && !isFetchingNextPage,
    onLoadMore: fetchNextPage,
    revision: allMovies.length,
  });

  const genreLabel = genres?.find((genre) => String(genre.id) === selectedGenre)?.name;
  const sortLabel = sortOptions.find((option) => option.value === sortBy)?.label;
  const languageLabel = BOLLYWOOD_LANGUAGE_OPTIONS.find((option) => option.value === bollywoodLanguage)?.label;
  const activeCategory = MOVIE_CATEGORY_OPTIONS.find((option) => option.value === category) ?? MOVIE_CATEGORY_OPTIONS[0];
  const totalResults = contentData?.pages[0]?.total_results;

  const selects: BrowseSelect[] = [
    {
      id: "sort", label: "Sort by", value: sortBy, disabled: isSpecialCategory,
      options: sortOptions.filter((opt) => !(category === "bollywood" && bollywoodLanguage === "all" && opt.value === "revenue.desc")),
      onChange: (value) => updateMovieState({ sortBy: value as SortOption }),
    },
    {
      id: "genre", label: "Genre", value: selectedGenre || "all", disabled: isSpecialCategory,
      options: [{ value: "all", label: "All genres" }, ...(genres || []).map((genre) => ({ value: String(genre.id), label: genre.name }))],
      onChange: (value) => updateMovieState({ selectedGenre: value === "all" ? "" : value }),
    },
    {
      id: "year", label: "Release year", value: selectedYear || "all", disabled: isSpecialCategory,
      options: [{ value: "all", label: "Any year" }, ...yearOptions.map((year) => ({ value: String(year), label: String(year) }))],
      onChange: (value) => updateMovieState({ selectedYear: value === "all" ? "" : value }),
    },
    ...(category === "bollywood" ? [{
      id: "language", label: "Language", value: bollywoodLanguage, options: BOLLYWOOD_LANGUAGE_OPTIONS,
      onChange: (value: string) => updateMovieState({ bollywoodLanguage: value }),
    }] : []),
  ];

  const activeFilters: ActiveFilter[] = [
    ...(selectedGenre && genreLabel ? [{ key: "genre", label: genreLabel, onClear: () => updateMovieState({ selectedGenre: "" }) }] : []),
    ...(selectedYear ? [{ key: "year", label: selectedYear, onClear: () => updateMovieState({ selectedYear: "" }) }] : []),
    ...(!isSpecialCategory && sortBy !== "popularity.desc" && sortLabel ? [{ key: "sort", label: sortLabel, onClear: () => updateMovieState({ sortBy: "popularity.desc" }) }] : []),
    ...(category === "bollywood" && bollywoodLanguage !== "all" && languageLabel ? [{ key: "language", label: languageLabel, onClear: () => updateMovieState({ bollywoodLanguage: "all" }) }] : []),
  ];

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pb-12">
        <BrowseHeader
          kicker="Browse library"
          title={category === "all" ? "Movies" : activeCategory.label}
          description={CATEGORY_COPY[category]}
          icon={Film}
          backdropPath={allMovies.find((movie) => movie.backdrop_path)?.backdrop_path}
          resultLabel={!isLoading && totalResults ? `${totalResults.toLocaleString()} titles` : null}
        />
        <div className="container mx-auto px-4">
          <BrowseFilters
            categories={MOVIE_CATEGORY_OPTIONS}
            activeCategory={category}
            onCategory={(value) => updateMovieState({ category: value })}
            genres={genres}
            selectedGenre={selectedGenre}
            onGenre={(value) => updateMovieState({ selectedGenre: value })}
            genreDisabled={isSpecialCategory}
            selects={selects}
            activeFilters={activeFilters}
            onReset={() => updateMovieState({ selectedGenre: "", selectedYear: "", sortBy: "popularity.desc", bollywoodLanguage: "all" })}
            note={isSpecialCategory ? `${activeCategory.label} uses its fixed source ordering and release window, so genre, year and sort are unavailable.` : undefined}
          />

          {isLoading ? (
            <PosterGridSkeleton count={18} />
          ) : (
            <>
              <div className={cn("content-grid", isFetching && !isFetchingNextPage && "opacity-75")}>
                {allMovies.map((item, index) => (
                  <BrowsePosterCard
                    key={item.id}
                    title={item.title}
                    posterPath={item.poster_path}
                    rating={item.vote_average}
                    language={item.original_language}
                    year={item.release_date?.split("-")[0]}
                    priority={index < 8}
                    onClick={() =>
                      navigate(`/movie/${item.id}`, {
                        state: { from: `${location.pathname}${location.search}${location.hash}` },
                      })
                    }
                  />
                ))}
              </div>

              {allMovies.length === 0 && (
                <div className="empty-state">
                  <p className="font-semibold">No movies match these filters.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try another genre or year, or clear the filters.</p>
                </div>
              )}

              <div ref={loadMoreRef} className="h-12 w-full" />

              {isFetchingNextPage && <InlineLoadMoreSkeleton />}

              {!hasNextPage && allMovies.length > 0 && (
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
