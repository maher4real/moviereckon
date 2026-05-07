import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  searchMulti,
  getTrendingMovies,
  getTrendingTVShows,
  Movie,
  MultiSearchResult,
  PersonSearchResult,
  TVShow,
  getPosterUrl,
  getProfileUrl,
  getLanguageBadgeClass,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import MediaImage from "@/frontend/components/MediaImage";
import { AppPageSkeleton, PosterGridSkeleton } from "@/frontend/components/AppSkeletons";
import { Input } from "@/frontend/components/ui/input";
import { Button } from "@/frontend/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { Search as SearchIcon, X, Clock, TrendingUp, Play, Star } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const RECENT_SEARCHES_KEY = "moviereckon_recent_searches";
const MAX_RECENT_SEARCHES = 10;

type FilterType = "all" | "movie" | "tv" | "person";

function isPersonResult(item: MultiSearchResult): item is PersonSearchResult {
  return (item as PersonSearchResult).media_type === "person";
}

function isTVResult(item: MultiSearchResult): item is TVShow {
  return "first_air_date" in item;
}

function isMovieResult(item: MultiSearchResult): item is Movie {
  return "title" in item;
}

// Memoized result card
const ResultCard = memo(({ item, onClick }: { item: MultiSearchResult; onClick: () => void }) => {
  const personResult = isPersonResult(item) ? item : null;
  const mediaItem = personResult ? null : (item as Movie | TVShow);
  const title = (() => {
    if (personResult) return personResult.name;
    if (!mediaItem) return "Untitled";
    if (isTVResult(mediaItem)) return mediaItem.name;
    return mediaItem.title;
  })();
  const subtitle = (() => {
    if (personResult) {
      const department = personResult.known_for_department?.trim();
      const knownFor = (personResult.known_for || [])
        .map((credit) => credit.title || credit.name)
        .filter((value): value is string => Boolean(value))
        .slice(0, 2)
        .join(" • ");
      if (department && knownFor) return `${department} • ${knownFor}`;
      if (department) return department;
      if (knownFor) return knownFor;
      return "Cast";
    }
    if (!mediaItem) return "";
    const isTV = isTVResult(mediaItem);
    const date = isTV ? mediaItem.first_air_date : mediaItem.release_date;
    const year = date?.split("-")[0] || "";
    return `${year} • ${isTV ? "TV" : "Movie"}`;
  })();
  const imageSrc = personResult
    ? getProfileUrl(personResult.profile_path, "large")
    : getPosterUrl(mediaItem?.poster_path || null, "medium");
  const rating = mediaItem && mediaItem.vote_average > 0 ? mediaItem.vote_average.toFixed(1) : null;

  return (
    <div onClick={onClick} className="cursor-pointer group">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
        <MediaImage
          src={imageSrc}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
          fallbackSrc={personResult ? "/fallbacks/profile.svg" : "/fallbacks/poster.svg"}
        />

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="poster-play-button">
            <Play className="h-5 w-5 fill-current" />
          </div>
        </div>

        {/* Language Badge */}
        {personResult ? (
          <div className="absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold bg-primary/90 text-primary-foreground">
            Cast
          </div>
        ) : (
          <div className={cn("language-badge absolute top-2 left-2", getLanguageBadgeClass(mediaItem?.original_language || "en"))}>
            {(mediaItem?.original_language || "en").toUpperCase()}
          </div>
        )}

        {/* Rating Badge */}
        {rating && (
          <div className="rating-badge absolute top-2 right-2">
            <Star className="h-3 w-3 fill-current" />
            {rating}
          </div>
        )}
      </div>

      <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground line-clamp-2">{subtitle}</p>
    </div>
  );
});

ResultCard.displayName = "ResultCard";

export default function Search() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

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
      if (filterType === "all") return true;
      if (filterType === "movie") return isMovieResult(item);
      if (filterType === "tv") return isTVResult(item);
      if (filterType === "person") return isPersonResult(item);
      return true;
    });
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

  const handleItemClick = useCallback((item: MultiSearchResult) => {
    if (debouncedQuery) {
      saveRecentSearch(debouncedQuery);
    }
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    if (isPersonResult(item)) {
      navigate(`/person/${item.id}`, { state: { from: fromPath } });
      return;
    }
    navigate(`/${isTVResult(item) ? "tv" : "movie"}/${item.id}`, {
      state: { from: fromPath },
    });
  }, [navigate, debouncedQuery, saveRecentSearch, location.pathname, location.search, location.hash]);

  const handleRecentSearchClick = useCallback((searchTerm: string) => {
    setQuery(searchTerm);
  }, []);

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="container mx-auto px-4">
          {/* Search Input */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="surface-panel relative p-2">
              <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search movies, TV shows, cast..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-14 border-border/60 bg-background/60 pl-12 pr-12 text-base shadow-none transition-colors focus:border-primary md:text-lg"
                autoFocus
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full"
                  aria-label="Clear search"
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
                <TabsList className="border border-border/70 bg-card/70">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="movie">Movies</TabsTrigger>
                  <TabsTrigger value="tv">TV Shows</TabsTrigger>
                  <TabsTrigger value="person">Cast</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>

          {/* Content */}
          {!debouncedQuery ? (
            // Recent Searches
            <div className="mx-auto max-w-2xl space-y-8">
              {recentSearches.length > 0 && (
                <div className="surface-panel p-4">
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
                        className="filter-chip"
                      >
                        {search}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Suggestions */}
              <div className="surface-panel p-4">
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
                        className="filter-chip"
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
            <PosterGridSkeleton count={12} />
          ) : filteredResults.length === 0 ? (
            // No Results
            <div className="empty-state mx-auto max-w-2xl">
              <p className="text-xl text-muted-foreground mb-2">No results found for "{debouncedQuery}"</p>
              <p className="text-sm text-muted-foreground">
                Try searching for something else
              </p>
            </div>
          ) : (
            // Results Grid
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredResults.map((item) => (
                <ResultCard
                  key={`${item.id}-${isPersonResult(item) ? "person" : isTVResult(item) ? "tv" : "movie"}`}
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
