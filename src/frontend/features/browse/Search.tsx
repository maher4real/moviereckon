import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
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
import {
  POPULAR_SUGGESTIONS_QUERY_KEY,
  buildPopularSuggestions,
} from "@/shared/lib/popularSuggestions";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import GenreRail from "@/frontend/components/GenreRail";
import MediaImage from "@/frontend/components/MediaImage";
import { PosterGridSkeleton } from "@/frontend/components/AppSkeletons";
import { Input } from "@/frontend/components/ui/input";
import { Button } from "@/frontend/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { Search as SearchIcon, X, Clock, TrendingUp, Play, Star, Tv, CalendarDays, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  fetchSearchPage,
  flattenSearchPages,
  getNextSearchPageParam,
  getSearchQueryKey,
  parseSearchUrlState,
  serializeSearchUrlState,
  SearchFilterType,
} from "./searchQuery";

const RECENT_SEARCHES_KEY = "moviereckon_recent_searches";
const MAX_RECENT_SEARCHES = 10;

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
    <motion.div
      onClick={onClick}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="cursor-pointer group"
    >
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
          <motion.div
            className="poster-play-button"
            initial={false}
            whileHover={{ scale: 1.08 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
          >
            <Play className="h-5 w-5 fill-current" />
          </motion.div>
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
    </motion.div>
  );
});

ResultCard.displayName = "ResultCard";

export default function Search() {
  useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamString = searchParams.toString();
  const urlState = useMemo(
    () => parseSearchUrlState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );
  const [query, setQuery] = useState(urlState.query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const filterType = urlState.filterType;
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const normalizedQuery = query.trim();
  const hasSearchQuery = normalizedQuery.length >= 2;
  const isDebouncing = normalizedQuery !== debouncedQuery;

  // Last query value this component wrote to the URL, so the URL -> state sync
  // below ignores our own (debounced, lagging) writes and never clobbers typing.
  const lastWrittenQueryRef = useRef(urlState.query);

  useEffect(() => {
    if (urlState.query === lastWrittenQueryRef.current) return;
    lastWrittenQueryRef.current = urlState.query;
    setQuery(urlState.query);
  }, [urlState.query]);

  const updateQuery = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const updateFilterType = useCallback(
    (value: string) => {
      setSearchParams(
        serializeSearchUrlState(new URLSearchParams(searchParamString), {
          query,
          filterType: value as SearchFilterType,
        }),
      );
    },
    [query, searchParamString, setSearchParams],
  );

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

  // Mirror the settled query into the URL (once per pause, not per keystroke).
  useEffect(() => {
    if (debouncedQuery !== query.trim()) return; // still typing / initial mount
    if (debouncedQuery === urlState.query.trim()) return;
    lastWrittenQueryRef.current = debouncedQuery;
    setSearchParams(
      serializeSearchUrlState(new URLSearchParams(searchParamString), {
        query: debouncedQuery,
        filterType,
      }),
      { replace: true },
    );
    // Idempotent: once the URL matches the settled query the guards above
    // short-circuit, so the full dependency list cannot loop.
  }, [debouncedQuery, query, urlState.query, searchParamString, filterType, setSearchParams]);

  // Search query. The selected type is part of the cache key and the upstream
  // endpoint so a tab never filters a mixed first page locally.
  const {
    data: searchData,
    error: searchError,
    isError: isSearchError,
    isLoading: isSearchLoading,
    isPending: isSearchPending,
    isPlaceholderData,
    isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: getSearchQueryKey(debouncedQuery, filterType),
    queryFn: ({ pageParam, signal }) =>
      fetchSearchPage(filterType, debouncedQuery, pageParam, signal),
    enabled: debouncedQuery.length >= 2,
    initialPageParam: 1,
    getNextPageParam: getNextSearchPageParam,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });

  // Dynamic popular search suggestions from TMDB trending content
  const { data: popularSuggestions = [] } = useQuery({
    queryKey: POPULAR_SUGGESTIONS_QUERY_KEY,
    queryFn: async () => {
      const [moviesResult, tvResult] = await Promise.allSettled([
        getTrendingMovies("week"),
        getTrendingTVShows("week"),
      ]);
      return buildPopularSuggestions(moviesResult, tvResult);
    },
    staleTime: 1000 * 60 * 30,
  });

  const searchResults = useMemo(
    () => flattenSearchPages(searchData?.pages || []),
    [searchData],
  );

  // Keep a defensive type check for mixed results from the all tab. The
  // filtered tabs already receive type-specific results from TMDB.
  const filteredResults = useMemo(() => {
    return searchResults.filter((item) => {
      if (filterType === "all") return true;
      if (filterType === "movie") return isMovieResult(item);
      if (filterType === "tv") return isTVResult(item);
      if (filterType === "person") return isPersonResult(item);
      return true;
    });
  }, [searchResults, filterType]);

  // Keep the previous results on screen (dimmed) while the next query loads so
  // typing never swaps the whole grid for a skeleton.
  const isRefreshingResults =
    filteredResults.length > 0 && (isDebouncing || isPlaceholderData === true);

  const searchErrorMessage =
    searchError instanceof Error && searchError.message
      ? searchError.message
      : "Search is temporarily unavailable. Please try again.";

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
    updateQuery(searchTerm);
  }, [updateQuery]);

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pb-12">
        <section className="search-hero">
          <div className="container mx-auto max-w-3xl px-4">
            <p className="page-kicker text-center">Search MovieReckon</p>
            <h1 className="mt-2 text-center text-3xl font-black tracking-[-0.03em] sm:text-4xl">Find any movie, show or person</h1>
            <div className="search-field mt-6">
              <SearchIcon className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="text"
                placeholder="Search movies, TV shows, cast..."
                aria-label="Search movies, TV shows and cast"
                value={query}
                onChange={(e) => updateQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const submitted = e.currentTarget.value.trim();
                  if (submitted.length < 2) return;
                  setDebouncedQuery(submitted);
                  saveRecentSearch(submitted);
                }}
                className="h-14 rounded-full border-white/12 bg-card/80 pl-13 pr-14 text-base shadow-[0_18px_50px_hsl(0_0%_0%/0.35)] transition-colors focus-visible:border-primary/60 md:text-lg"
                autoFocus
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full"
                  aria-label="Clear search"
                >
                  <X className="size-5" />
                </Button>
              )}
            </div>

            {hasSearchQuery && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Tabs value={filterType} onValueChange={updateFilterType}>
                  <TabsList className="h-auto gap-1 rounded-full border border-white/10 bg-card/70 p-1">
                    {([["all", "All"], ["movie", "Movies"], ["tv", "TV Shows"], ["person", "Cast"]] as const).map(([value, label]) => (
                      <TabsTrigger key={value} value={value} className="min-h-9 rounded-full px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {filteredResults.length > 0 && (
                  <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {searchData?.pages[0]?.total_results?.toLocaleString() ?? filteredResults.length} results
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="container mx-auto px-4">
          {/* Content */}
          {!normalizedQuery ? (
            <div className="grid gap-10">
              <div className="mx-auto grid w-full max-w-3xl gap-6 md:grid-cols-2">
                {recentSearches.length > 0 && (
                  <section className="surface-panel p-5" aria-labelledby="recent-searches">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 id="recent-searches" className="flex items-center gap-2 text-base font-semibold">
                        <Clock className="size-4 text-primary" aria-hidden="true" />Recent searches
                      </h2>
                      <Button variant="ghost" size="sm" onClick={clearRecentSearches} className="text-muted-foreground">Clear</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((search) => (
                        <button key={search} type="button" onClick={() => handleRecentSearchClick(search)} className="browse-genre-chip">{search}</button>
                      ))}
                    </div>
                  </section>
                )}

                <section className={cn("surface-panel p-5", recentSearches.length === 0 && "md:col-span-2")} aria-labelledby="popular-searches">
                  <h2 id="popular-searches" className="mb-4 flex items-center gap-2 text-base font-semibold">
                    <TrendingUp className="size-4 text-primary" aria-hidden="true" />Popular this week
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {popularSuggestions.length > 0 ? (
                      popularSuggestions.map((suggestion) => (
                        <button key={suggestion} type="button" onClick={() => updateQuery(suggestion)} className="browse-genre-chip">{suggestion}</button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Popular suggestions are loading.</p>
                    )}
                  </div>
                </section>
              </div>

              <nav className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Quick browse">
                {[
                  { href: "/movies?category=trending", label: "Trending films", icon: TrendingUp },
                  { href: "/series?category=popular", label: "Popular series", icon: Tv },
                  { href: "/upcoming", label: "Coming soon", icon: CalendarDays },
                  { href: "/reckon", label: "Your Reckon", icon: Sparkles },
                ].map((item) => (
                  <button key={item.href} type="button" onClick={() => navigate(item.href)} className="search-shortcut">
                    <item.icon className="size-5 text-primary" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>

              <div className="-mx-4 sm:mx-0">
                <GenreRail enabled />
              </div>
            </div>
          ) : !hasSearchQuery ? (
            <div className="empty-state mx-auto max-w-2xl">
              <p className="text-xl text-muted-foreground mb-2">
                Keep typing to search
              </p>
              <p className="text-sm text-muted-foreground">
                Enter at least 2 characters.
              </p>
            </div>
          ) : filteredResults.length === 0 &&
            (isDebouncing || isSearchLoading || (isSearchPending && !searchData)) ? (
            // Loading State
            <div aria-busy="true" aria-label="Loading search results">
              <PosterGridSkeleton count={12} />
            </div>
          ) : isSearchError && filteredResults.length === 0 ? (
            <div className="empty-state mx-auto max-w-2xl" role="alert">
              <p className="text-xl text-muted-foreground mb-2">
                We couldn&apos;t complete that search.
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {searchErrorMessage}
              </p>
              <Button onClick={() => void refetch()}>Try again</Button>
            </div>
          ) : filteredResults.length === 0 ? (
            // No Results
            <div className="empty-state mx-auto max-w-2xl">
              <p className="text-xl text-muted-foreground mb-2">No results found for &quot;{normalizedQuery}&quot;</p>
              <p className="text-sm text-muted-foreground">
                Try searching for something else
              </p>
            </div>
          ) : (
            // Results Grid
            <>
              <div
                aria-busy={isRefreshingResults}
                className={cn(
                  "grid grid-cols-2 gap-4 transition-opacity duration-200 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
                  isRefreshingResults && "pointer-events-none opacity-60",
                )}
              >
                {filteredResults.map((item) => (
                  <ResultCard
                    key={`${item.id}-${isPersonResult(item) ? "person" : isTVResult(item) ? "tv" : "movie"}`}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>

              {isSearchError && !isFetchNextPageError && (
                <div className="mt-8 flex flex-col items-center gap-3" role="alert">
                  <p className="text-sm text-muted-foreground">{searchErrorMessage}</p>
                  <Button onClick={() => void refetch()}>Try again</Button>
                </div>
              )}

              {isFetchNextPageError && (
                <div className="mt-8 flex flex-col items-center gap-3" role="alert">
                  <p className="text-sm text-muted-foreground">{searchErrorMessage}</p>
                  <Button onClick={() => void fetchNextPage()}>Try again</Button>
                </div>
              )}

              {hasNextPage && !isSearchError && (
                <div className="mt-8 flex justify-center">
                  <Button
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading more..." : "Load more results"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
