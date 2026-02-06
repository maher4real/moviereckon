import { useState, useEffect, useMemo, memo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  discoverMovies,
  discoverTVShows,
  getMovieGenres,
  getTVGenres,
  getNowPlayingMovies,
  getUpcomingMovies,
  Movie,
  TVShow,
  Genre,
  getPosterUrl,
  getLanguageBadgeClass,
  DiscoverFilters,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import MediaImage from "@/components/MediaImage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ContentType = "all" | "bollywood" | "hollywood" | "gujarati" | "tamil" | "telugu" | "tv" | "now_playing" | "upcoming";
type SortOption = "popularity.desc" | "popularity.asc" | "vote_average.desc" | "vote_average.asc" | "release_date.desc" | "release_date.asc" | "revenue.desc";

interface ContentPage {
  results: (Movie | TVShow)[];
  total_pages: number;
  page: number;
  total_results: number;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "popularity.asc", label: "Least Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "vote_average.asc", label: "Lowest Rated" },
  { value: "release_date.desc", label: "Newest First" },
  { value: "release_date.asc", label: "Oldest First" },
  { value: "revenue.desc", label: "Highest Grossing" },
];

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

const languageMap: Record<string, string> = {
  bollywood: "hi",
  hollywood: "en",
  gujarati: "gu",
  tamil: "ta",
  telugu: "te",
};

const isAnimeLike = (item: Movie | TVShow) =>
  item.original_language === "ja" && item.genre_ids?.includes(16);

const PosterCard = memo(({ item, onClick }: { item: Movie | TVShow; onClick: () => void }) => {
  const getTitle = (entry: Movie | TVShow): string => {
    return "title" in entry ? entry.title : entry.name;
  };

  const getYear = (entry: Movie | TVShow): string => {
    const date = "release_date" in entry ? entry.release_date : entry.first_air_date;
    return date?.split("-")[0] || "";
  };

  return (
    <div onClick={onClick} className="cursor-pointer group">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
        <MediaImage
          src={getPosterUrl(item.poster_path, "medium")}
          alt={getTitle(item)}
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
        {getTitle(item)}
      </h3>
      <p className="text-xs text-muted-foreground">{getYear(item)}</p>
    </div>
  );
});

PosterCard.displayName = "PosterCard";

export default function Browse() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [contentType, setContentType] = useState<ContentType>(
    (searchParams.get("type") as ContentType) || "all"
  );
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get("genre") || "");
  const [selectedYear, setSelectedYear] = useState<string>(searchParams.get("year") || "");
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || "popularity.desc"
  );

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

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

  const genres: Genre[] = contentType === "tv" ? tvGenres || [] : movieGenres || [];

  const {
    data: contentData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<ContentPage>({
    queryKey: ["browse-infinite", contentType, selectedGenre, selectedYear, sortBy],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;

      if (contentType === "now_playing") {
        return getNowPlayingMovies(page);
      }

      if (contentType === "upcoming") {
        return getUpcomingMovies(page);
      }

      const filters: DiscoverFilters = {
        page,
        sort_by: sortBy,
        with_genres: selectedGenre || undefined,
      };

      if (selectedYear && contentType !== "tv") {
        filters["primary_release_date.gte"] = `${selectedYear}-01-01`;
        filters["primary_release_date.lte"] = `${selectedYear}-12-31`;
      }

      if (languageMap[contentType]) {
        return discoverMovies({
          ...filters,
          with_original_language: languageMap[contentType],
        });
      }

      if (contentType === "tv") {
        return discoverTVShows(filters);
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

  const filteredContent = useMemo(() => {
    if (!contentData?.pages) return [];

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const dedupe = new Set<string>();
    const merged: (Movie | TVShow)[] = [];

    contentData.pages.forEach((page) => {
      (page.results || []).forEach((item) => {
        const isTV = "first_air_date" in item;
        const key = `${isTV ? "tv" : "movie"}:${item.id}`;
        if (dedupe.has(key)) return;

        if (contentType === "now_playing" && "release_date" in item && item.release_date > today) return;
        if (contentType === "upcoming" && "release_date" in item && item.release_date < tomorrowStr) return;
        if (isAnimeLike(item)) return;

        dedupe.add(key);
        merged.push(item);
      });
    });

    return merged;
  }, [contentData, contentType]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (contentType !== "all") params.set("type", contentType);
    if (selectedGenre) params.set("genre", selectedGenre);
    if (selectedYear) params.set("year", selectedYear);
    if (sortBy !== "popularity.desc") params.set("sort", sortBy);
    setSearchParams(params, { replace: true });
  }, [contentType, selectedGenre, selectedYear, sortBy, setSearchParams]);

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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, filteredContent.length]);

  const handleItemClick = (item: Movie | TVShow) => {
    const isTV = "first_air_date" in item;
    navigate(`/${isTV ? "tv" : "movie"}/${item.id}`);
  };

  const isSpecialCategory = contentType === "now_playing" || contentType === "upcoming";

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-6">Browse</h1>

          <div className="flex flex-col gap-4 mb-8">
            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
              <Tabs
                value={contentType}
                onValueChange={(value) => {
                  setContentType(value as ContentType);
                  setSelectedGenre("");
                  setSelectedYear("");
                }}
              >
                <TabsList className="bg-muted inline-flex w-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="now_playing">🎬 Now Playing</TabsTrigger>
                  <TabsTrigger value="upcoming">🗓️ Upcoming</TabsTrigger>
                  <TabsTrigger value="bollywood">🇮🇳 Bollywood</TabsTrigger>
                  <TabsTrigger value="hollywood">🎬 Hollywood</TabsTrigger>
                  <TabsTrigger value="tamil">🎭 Tamil</TabsTrigger>
                  <TabsTrigger value="telugu">🌟 Telugu</TabsTrigger>
                  <TabsTrigger value="gujarati">🎪 Gujarati</TabsTrigger>
                  <TabsTrigger value="tv">📺 TV Series</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Select
                value={selectedGenre}
                onValueChange={(value) => setSelectedGenre(value === "all" ? "" : value)}
                disabled={isSpecialCategory}
              >
                <SelectTrigger className="w-[140px] sm:w-[180px] bg-card">
                  <SelectValue placeholder="All Genres" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="all">All Genres</SelectItem>
                  {genres.map((genre) => (
                    <SelectItem key={genre.id} value={String(genre.id)}>
                      {genre.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedYear}
                onValueChange={(value) => setSelectedYear(value === "all" ? "" : value)}
                disabled={isSpecialCategory || contentType === "tv"}
              >
                <SelectTrigger className="w-[120px] sm:w-[140px] bg-card">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50 max-h-[300px]">
                  <SelectItem value="all">All Years</SelectItem>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortOption)}
                disabled={isSpecialCategory}
              >
                <SelectTrigger className="w-[140px] sm:w-[180px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                  <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="mt-1 h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredContent.map((item) => (
                  <PosterCard
                    key={`${item.id}-${"first_air_date" in item ? "tv" : "movie"}`}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>

              {filteredContent.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No content found for the selected filters.</p>
                </div>
              )}

              <div ref={loadMoreRef} className="h-12 w-full" />

              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!hasNextPage && filteredContent.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">You are all caught up.</p>
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
