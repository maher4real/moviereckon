import { useState, useEffect, useMemo, memo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
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
  DiscoverFilters,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import {
  AppPageSkeleton,
  PosterGridSkeleton,
  InlineLoadMoreSkeleton,
} from "@/components/AppSkeletons";
import MediaImage from "@/components/MediaImage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Film } from "lucide-react";

type MovieCategory = "all" | "now_playing" | "trending" | "bollywood" | "hollywood";
type SortOption = "popularity.desc" | "vote_average.desc" | "release_date.desc" | "revenue.desc";

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

const isAnimeLikeMovie = (movie: Movie) =>
  movie.original_language === "ja" && movie.genre_ids?.includes(16);

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const PosterCard = memo(({ item, onClick }: { item: Movie; onClick: () => void }) => (
  <div onClick={onClick} className="cursor-pointer group">
    <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
      <MediaImage
        src={getPosterUrl(item.poster_path, "medium")}
        alt={item.title}
        className="w-full h-full object-cover"
        loading="lazy"
        fallbackSrc="/fallbacks/poster.svg"
      />
      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
          <span className="text-xl text-primary-foreground">▶</span>
        </div>
      </div>
      {item.vote_average > 0 && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
          ⭐ {item.vote_average.toFixed(1)}
        </div>
      )}
      <div className={cn("absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold", getLanguageBadgeClass(item.original_language))}>
        {item.original_language.toUpperCase()}
      </div>
    </div>
    <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
      {item.title}
    </h3>
    <p className="text-xs text-muted-foreground">{item.release_date?.split("-")[0] || ""}</p>
  </div>
));

PosterCard.displayName = "PosterCard";

export default function Movies() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [category, setCategory] = useState<MovieCategory>(
    (searchParams.get("category") as MovieCategory) || "all"
  );
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get("genre") || "");
  const [selectedYear, setSelectedYear] = useState<string>(searchParams.get("year") || "");
  const [bollywoodLanguage, setBollywoodLanguage] = useState<string>(searchParams.get("lang") || "hi");
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || "popularity.desc"
  );

  const effectiveBollywoodLanguage = category === "bollywood" ? bollywoodLanguage : "all";

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const { data: genres } = useQuery({
    queryKey: ["movie-genres"],
    queryFn: getMovieGenres,
    staleTime: 1000 * 60 * 60,
  });

  const {
    data: contentData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<MoviePage>({
    queryKey: ["movies-infinite", category, selectedGenre, selectedYear, effectiveBollywoodLanguage, sortBy],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;

      if (category === "now_playing") return getNowPlayingMovies(page);
      if (category === "trending") {
        const results = await getTrendingMovies("week");
        return { results, total_pages: 1, page: 1, total_results: results.length };
      }

      if (category === "bollywood" && bollywoodLanguage === "all") {
        const languageResponses = await Promise.allSettled(
          BOLLYWOOD_LANGUAGE_CODES.map((language) =>
            discoverMovies({
              page,
              sort_by: sortBy,
              with_genres: selectedGenre || undefined,
              with_original_language: language,
              region: "IN",
              "primary_release_date.gte": selectedYear ? `${selectedYear}-01-01` : undefined,
              "primary_release_date.lte": selectedYear ? `${selectedYear}-12-31` : undefined,
            }),
          ),
        );

        const successfulPages = languageResponses.flatMap((response) =>
          response.status === "fulfilled" ? [response.value] : [],
        );

        if (successfulPages.length === 0) {
          return { page, results: [], total_pages: 1, total_results: 0 };
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

        return {
          page,
          results: Array.from(deduped.values()).sort(sortMovies),
          total_pages: Math.max(...successfulPages.map((data) => data.total_pages || 1)),
          total_results: successfulPages.reduce(
            (total, data) => total + (data.total_results || 0),
            0,
          ),
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

      const filters: DiscoverFilters = {
        page,
        sort_by: sortBy,
        with_genres: selectedGenre || undefined,
        "primary_release_date.gte": selectedYear ? `${selectedYear}-01-01` : undefined,
        "primary_release_date.lte": selectedYear ? `${selectedYear}-12-31` : undefined,
      };

      if (category === "hollywood") {
        filters.with_original_language = "en";
        filters.region = "US";
      }

      if (category === "bollywood") {
        filters.region = "IN";
        if (bollywoodLanguage !== "all") {
          filters.with_original_language = bollywoodLanguage;
        }
      }

      return discoverMovies(filters);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.page || !lastPage?.total_pages) return undefined;
      return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
    enabled: !authLoading && !!user,
  });

  useEffect(() => {
    if (authLoading || !user) return;

    void queryClient.prefetchInfiniteQuery({
      queryKey: ["movies-infinite", "hollywood", "", "all", "popularity.desc"],
      initialPageParam: 1,
      queryFn: async ({ pageParam }) => getHollywoodMovies(Number(pageParam) || 1),
      getNextPageParam: (lastPage) => {
        if (!lastPage?.page || !lastPage?.total_pages) return undefined;
        return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
      },
      staleTime: 1000 * 60 * 10,
    });

    void queryClient.prefetchInfiniteQuery({
      queryKey: ["movies-infinite", "bollywood", "", "hi", "popularity.desc"],
      initialPageParam: 1,
      queryFn: async ({ pageParam }) => getBollywoodMovies(Number(pageParam) || 1),
      getNextPageParam: (lastPage) => {
        if (!lastPage?.page || !lastPage?.total_pages) return undefined;
        return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
      },
      staleTime: 1000 * 60 * 10,
    });
  }, [authLoading, user, queryClient]);

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
        if (isAnimeLikeMovie(movie)) return;

        dedupe.add(movie.id);
        merged.push(movie);
      });
    });

    return merged;
  }, [contentData, category, selectedYear, bollywoodLanguage]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (selectedGenre) params.set("genre", selectedGenre);
    if (selectedYear) params.set("year", selectedYear);
    if (category === "bollywood" && bollywoodLanguage !== "hi") params.set("lang", bollywoodLanguage);
    if (sortBy !== "popularity.desc") params.set("sort", sortBy);
    setSearchParams(params, { replace: true });
  }, [category, selectedGenre, selectedYear, bollywoodLanguage, sortBy, setSearchParams]);

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

  const isSpecialCategory = ["now_playing", "trending"].includes(category);

  if (authLoading) {
    return <AppPageSkeleton cardCount={18} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-6">
            <Film className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">Movies</h1>
          </div>

          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-6">
            <div className="flex gap-2">
              {[
                { value: "all", label: "All Movies" },
                { value: "now_playing", label: "🎬 Now Playing" },
                { value: "trending", label: "🔥 Trending" },
                { value: "bollywood", label: "🇮🇳 Bollywood" },
                { value: "hollywood", label: "🎬 Hollywood" },
              ].map((cat) => (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory(cat.value as MovieCategory)}
                  className="whitespace-nowrap"
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap mb-6">
            <Select
              value={selectedGenre}
              onValueChange={(v) => setSelectedGenre(v === "all" ? "" : v)}
              disabled={isSpecialCategory}
            >
              <SelectTrigger className="w-[150px] bg-card">
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
              onValueChange={(v) => setSortBy(v as SortOption)}
              disabled={isSpecialCategory}
            >
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedYear}
              onValueChange={(v) => setSelectedYear(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[150px] bg-card">
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
              <Select value={bollywoodLanguage} onValueChange={setBollywoodLanguage}>
                <SelectTrigger className="w-[170px] bg-card">
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
          </div>

          {isLoading ? (
            <PosterGridSkeleton count={18} />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {allMovies.map((item) => (
                  <PosterCard
                    key={item.id}
                    item={item}
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
                <div className="text-center py-12">
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
      <BottomNav />
    </div>
  );
}
