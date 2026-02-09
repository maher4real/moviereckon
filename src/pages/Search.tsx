import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  searchMulti,
  getTrendingMovies,
  getTrendingTVShows,
  Movie,
  TVShow,
  getPosterUrl,
  getLanguageBadgeClass,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import MediaImage from "@/components/MediaImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search as SearchIcon, X, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const RECENT_SEARCHES_KEY = "moviereckon_recent_searches";
const MAX_RECENT_SEARCHES = 10;

type FilterType = "all" | "movie" | "tv";

// Memoized result card
const ResultCard = memo(({ item, onClick }: { item: Movie | TVShow; onClick: () => void }) => {
  const isTV = "first_air_date" in item;
  const title = isTV ? (item as TVShow).name : (item as Movie).title;
  const date = isTV ? (item as TVShow).first_air_date : (item as Movie).release_date;
  const year = date?.split("-")[0] || "";

  return (
    <div onClick={onClick} className="cursor-pointer group">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
        <MediaImage
          src={getPosterUrl(item.poster_path, "medium")}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
          fallbackSrc="/fallbacks/poster.svg"
        />

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
            <span className="text-xl text-primary-foreground">▶</span>
          </div>
        </div>

        {/* Language Badge */}
        <div className={cn("absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold", getLanguageBadgeClass(item.original_language))}>
          {item.original_language.toUpperCase()}
        </div>

        {/* Rating Badge */}
        {item.vote_average > 0 && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
            ⭐ {item.vote_average.toFixed(1)}
          </div>
        )}
      </div>

      <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{year} • {isTV ? "TV" : "Movie"}</p>
    </div>
  );
});

ResultCard.displayName = "ResultCard";

export default function Search() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Load recent searches
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
      }
    }
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Search query
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchMulti(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  // Dynamic popular search suggestions from TMDB trending content
  const { data: popularSuggestions = [] } = useQuery({
    queryKey: ["search-popular-suggestions"],
    queryFn: async () => {
      const [moviesResult, tvResult] = await Promise.allSettled([
        getTrendingMovies("week"),
        getTrendingTVShows("week"),
      ]);

      const movies = moviesResult.status === "fulfilled" ? moviesResult.value : [];
      const tvShows = tvResult.status === "fulfilled" ? tvResult.value : [];

      const titleMap = new Map<string, string>();
      [...movies, ...tvShows].forEach((item) => {
        const title = "title" in item ? item.title : item.name;
        const normalized = title?.trim().toLowerCase();
        if (!title || !normalized || titleMap.has(normalized)) return;
        titleMap.set(normalized, title);
      });

      return Array.from(titleMap.values()).slice(0, 12);
    },
    staleTime: 1000 * 60 * 30,
  });

  // Filter results
  const filteredResults = useMemo(() => {
    if (!searchResults?.results) return [];

    return searchResults.results.filter((item) => {
      // Filter out people
      if (!("title" in item) && !("name" in item)) return false;
      if (!("poster_path" in item)) return false;

      if (filterType === "all") return true;
      if (filterType === "movie") return "title" in item;
      if (filterType === "tv") return "first_air_date" in item;
      return true;
    }) as (Movie | TVShow)[];
  }, [searchResults, filterType]);

  // Save to recent searches
  const saveRecentSearch = useCallback((searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;

    setRecentSearches((prev) => {
      const updated = [trimmed, ...prev.filter((s) => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  const handleItemClick = useCallback((item: Movie | TVShow) => {
    if (debouncedQuery) {
      saveRecentSearch(debouncedQuery);
    }
    const isTV = "first_air_date" in item;
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/${isTV ? "tv" : "movie"}/${item.id}`, {
      state: { from: fromPath },
    });
  }, [navigate, debouncedQuery, saveRecentSearch, location.pathname, location.search, location.hash]);

  const handleRecentSearchClick = useCallback((searchTerm: string) => {
    setQuery(searchTerm);
  }, []);

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
          {/* Search Input */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search movies, TV shows..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-14 pl-12 pr-12 text-lg bg-card border-border focus:border-primary"
                autoFocus
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            {debouncedQuery && (
              <Tabs
                value={filterType}
                onValueChange={(value) => setFilterType(value as FilterType)}
                className="mt-4"
              >
                <TabsList className="bg-muted">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="movie">Movies</TabsTrigger>
                  <TabsTrigger value="tv">TV Shows</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>

          {/* Content */}
          {!debouncedQuery ? (
            // Recent Searches
            <div className="max-w-2xl mx-auto">
              {recentSearches.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Recent Searches
                    </h2>
                    <Button variant="ghost" size="sm" onClick={clearRecentSearches}>
                      Clear
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((search, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => handleRecentSearchClick(search)}
                        className="rounded-full border-white/80 bg-white text-black hover:bg-white/90 hover:text-black"
                      >
                        {search}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Suggestions */}
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5" />
                  Popular Searches
                </h2>
                <div className="flex flex-wrap gap-2">
                  {popularSuggestions.length > 0 ? (
                    popularSuggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        onClick={() => setQuery(suggestion)}
                        className="rounded-full border-white/80 bg-white text-black hover:bg-white/90 hover:text-black"
                      >
                        {suggestion}
                      </Button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Popular suggestions are loading.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : isLoading ? (
            // Loading State
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                  <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="mt-1 h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            // No Results
            <div className="text-center py-12">
              <p className="text-xl text-muted-foreground mb-2">No results found for "{debouncedQuery}"</p>
              <p className="text-sm text-muted-foreground">
                Try searching for something else
              </p>
            </div>
          ) : (
            // Results Grid
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredResults.map((item) => (
                <ResultCard
                  key={`${item.id}-${"first_air_date" in item ? "tv" : "movie"}`}
                  item={item}
                  onClick={() => handleItemClick(item)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
