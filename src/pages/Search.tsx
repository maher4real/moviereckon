import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { searchMulti, Movie, TVShow, getPosterUrl } from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search as SearchIcon, X, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const RECENT_SEARCHES_KEY = "moviereckon_recent_searches";
const MAX_RECENT_SEARCHES = 10;

type FilterType = "all" | "movie" | "tv";

export default function Search() {
  const { user, isLoading: userLoading } = useUser();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Redirect if no user
  useEffect(() => {
    if (!userLoading && !user) {
      navigate("/");
    }
  }, [user, userLoading, navigate]);

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
  const saveRecentSearch = (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;

    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(
      0,
      MAX_RECENT_SEARCHES
    );
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const handleItemClick = (item: Movie | TVShow) => {
    // Save search to recent
    if (debouncedQuery) {
      saveRecentSearch(debouncedQuery);
    }

    const isTV = "first_air_date" in item;
    navigate(`/${isTV ? "tv" : "movie"}/${item.id}`);
  };

  const handleRecentSearchClick = (searchTerm: string) => {
    setQuery(searchTerm);
  };

  const getTitle = (item: Movie | TVShow): string => {
    return "title" in item ? item.title : item.name;
  };

  const getYear = (item: Movie | TVShow): string => {
    const date = "release_date" in item ? item.release_date : item.first_air_date;
    return date?.split("-")[0] || "";
  };

  if (userLoading) {
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
                        className="rounded-full"
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
                  {[
                    "Pathaan",
                    "Oppenheimer",
                    "Jawan",
                    "Barbie",
                    "Animal",
                    "Dune",
                    "The Bear",
                    "Wednesday",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="secondary"
                      size="sm"
                      onClick={() => setQuery(suggestion)}
                      className="rounded-full"
                    >
                      {suggestion}
                    </Button>
                  ))}
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
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="cursor-pointer group"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
                    <img
                      src={getPosterUrl(item.poster_path, "medium")}
                      alt={getTitle(item)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center glow-primary">
                        <span className="text-xl">▶</span>
                      </div>
                    </div>

                    {/* Type Badge */}
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
                      {"title" in item ? "Movie" : "TV"}
                    </div>

                    {/* Rating Badge */}
                    {item.vote_average > 0 && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
                        ⭐ {item.vote_average.toFixed(1)}
                      </div>
                    )}
                  </div>

                  <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                    {getTitle(item)}
                  </h3>
                  <p className="text-xs text-muted-foreground">{getYear(item)}</p>
                </div>
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
