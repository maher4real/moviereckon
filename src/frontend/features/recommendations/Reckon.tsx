import React, {
  useState,
  useMemo,
  useEffect,
  memo,
  useRef,
  useCallback,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useRecommendations } from "@/frontend/hooks/useRecommendations";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { Movie, TVShow, getBackdropUrl } from "@/shared/lib/tmdb";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import { PosterGridSkeleton } from "@/frontend/components/AppSkeletons";
import { ContentCard } from "@/frontend/components/ContentCard";
import { Button } from "@/frontend/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import {
  Sparkles,
  ArrowUpDown,
  RefreshCw,
  Film,
  Tv,
  SlidersHorizontal,
  TrendingUp,
  Star,
  Crown,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useLoadMoreOnScroll } from "@/frontend/hooks/useBrowseFeed";
import { GENRE_NAMES, LANGUAGE_LABELS, PREFERENCE_GENRE_IDS } from "@/shared/lib/catalogue";
import { isReleased } from "@/shared/lib/recommendation/feedRanking";
import PickTonight from "./PickTonight";
import MediaImage from "@/frontend/components/MediaImage";

type ContentTypeFilter = "all" | "movie" | "tv";
type RecommendationTypeFilter =
  | "all"
  | "trending"
  | "highrated"
  | "popular"
  | "newreleases";
type SortField = "relevance" | "popularity" | "rating" | "release_date";
type SortOrder = "asc" | "desc";

const RECOMMENDATION_TYPES: {
  id: RecommendationTypeFilter;
  label: string;
  Icon: React.ElementType;
  description: string;
}[] = [
  {
    id: "all",
    label: "All",
    Icon: Sparkles,
    description: "All recommendations",
  },
  {
    id: "trending",
    label: "Trending",
    Icon: TrendingUp,
    description: "Hot picks this week",
  },
  {
    id: "highrated",
    label: "Highly Rated",
    Icon: Star,
    description: "8.0+ rated",
  },
  { id: "popular", label: "Popular", Icon: Crown, description: "Most watched" },
  {
    id: "newreleases",
    label: "New Releases",
    Icon: CalendarDays,
    description: "Recently released",
  },
];

const INITIAL_VISIBLE_ITEMS = 48;

const GENRE_MAP = GENRE_NAMES;
const LANGUAGE_MAP = LANGUAGE_LABELS;

const ReckonCard = memo(
  ({
    item,
    type,
    reasons,
    seedTitle,
  }: {
    item: Movie | TVShow;
    type: "movie" | "tv" | "mixed";
    reasons?: Array<{ label: string; evidence?: string }>;
    seedTitle?: string | null;
  }) => (
    <ContentCard
      item={item}
      type={type}
      showActions={true}
      recommendationReasons={reasons}
      recommendationSeedTitle={seedTitle}
    />
  ),
);

ReckonCard.displayName = "ReckonCard";

const getRecommendationItemType = (item: Movie | TVShow): "movie" | "tv" =>
  "title" in item ? "movie" : "tv";

function getRecommendationKey(item: Movie | TVShow): string {
  return `${getRecommendationItemType(item)}_${item.id}`;
}

export default function Reckon() {
  const { user } = useAuth();
  const { preferences } = useUserData();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const tastePreferencesKey = [
    ...(preferences?.preferred_genres || []),
    "|",
    ...(preferences?.preferred_languages || []),
  ].join(",");
  const tasteQueryKey = useMemo(
    () => ["recommendation-taste", user?.id || "anonymous", tastePreferencesKey] as const,
    [tastePreferencesKey, user?.id],
  );
  const { data: tasteSnapshot, refetch: refetchTaste } = useQuery({
    queryKey: tasteQueryKey,
    queryFn: () => mongoClient.fetchRecommendationTasteSnapshot(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const tasteProfile = tasteSnapshot?.profile || null;

  const [contentTypeFilter, setContentTypeFilter] =
    useState<ContentTypeFilter>("all");
  const [recTypeFilter, setRecTypeFilter] =
    useState<RecommendationTypeFilter>("all");
  const [sortField, setSortField] = useState<SortField>("relevance");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const navigate = useNavigate();
  const location = useLocation();
  const [explorationMode, setExplorationMode] = useState<mongoClient.TasteExplorationMode>("familiar");

  useEffect(() => {
    if (tasteSnapshot?.controls.explorationMode) {
      setExplorationMode(tasteSnapshot.controls.explorationMode);
    }
  }, [tasteSnapshot?.controls.explorationMode]);

  const {
    items: rawRecommendations,
    isLoading: reckonLoading,
    isRefreshing,
    isFetchingNextPage,
    hasMore: hasMoreFromServer,
    state: recommendationsState,
    hasError: recommendationsHasError,
    errorCode: recommendationsErrorCode,
    isPersonalized,
    explanationById,
    fetchNextPage,
    refreshRecommendations,
    retryRecommendations,
    feedMode,
  } = useRecommendations({
    contentType: contentTypeFilter,
    recommendationType: recTypeFilter,
    genre: selectedGenre,
    language: selectedLanguage,
    sort: sortField,
    sortOrder,
    exploration: explorationMode,
  });
  // Persisted feed pages can outlive a release-date change; never show a
  // title that is not out yet.
  const recommendations = useMemo(
    () => rawRecommendations.filter((item) =>
      isReleased("title" in item ? item.release_date : item.first_air_date)),
    [rawRecommendations],
  );

  const [extraItems, setExtraItems] = useState<(Movie | TVShow)[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [moreExhausted, setMoreExhausted] = useState(false);

  // Reset extra items whenever precision filters change
  useEffect(() => {
    setExtraItems([]);
    setMoreExhausted(false);
  }, [
    recommendations,
    selectedLanguage,
    selectedGenre,
    contentTypeFilter,
    recTypeFilter,
    sortField,
    sortOrder,
  ]);

  const canFetchMore = !moreExhausted;

  const hasPreferences =
    (preferences?.preferred_languages?.length ?? 0) > 0 ||
    (preferences?.preferred_genres?.length ?? 0) > 0;

  const openPreferences = useCallback(() => {
    navigate("/reckon/preferences", { state: { from: "/reckon" } });
  }, [navigate]);

  // Coming back from the preferences page with saved changes rebuilds the feed.
  const preferencesUpdated = Boolean((location.state as { preferencesUpdated?: boolean } | null)?.preferencesUpdated);
  useEffect(() => {
    if (!preferencesUpdated) return;
    navigate(location.pathname, { replace: true, state: null });
    void refetchTaste();
    void refreshRecommendations();
  }, [location.pathname, navigate, preferencesUpdated, refetchTaste, refreshRecommendations]);

  const preferenceCount = (preferences?.preferred_languages?.length ?? 0) + (preferences?.preferred_genres?.length ?? 0);
  const heroBackdrop = recommendations.find((item) => item.backdrop_path)?.backdrop_path ?? null;

  const availableGenres = useMemo(() => {
    const genres = new Set<number>([...PREFERENCE_GENRE_IDS, 10770]);
    preferences?.preferred_genres?.forEach((g) => genres.add(g));
    return Array.from(genres)
      .filter((g) => GENRE_MAP[g])
      .sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]));
  }, [preferences]);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>(Object.keys(LANGUAGE_MAP));
    preferences?.preferred_languages?.forEach((l) => langs.add(l));
    return Array.from(langs)
      .filter((l) => LANGUAGE_MAP[l])
      .sort((a, b) => LANGUAGE_MAP[a].localeCompare(LANGUAGE_MAP[b]));
  }, [preferences]);

  const processedItems = useMemo(() => {
    // Merge extra discovered items, dedup by id+type
    const seen = new Set<string>();
    const merged: (Movie | TVShow)[] = [];
    for (const item of [...recommendations, ...extraItems]) {
      const key = `${"title" in item ? "movie" : "tv"}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    let filtered = merged;

    if (contentTypeFilter === "movie") {
      filtered = filtered.filter((item) => "title" in item);
    } else if (contentTypeFilter === "tv") {
      filtered = filtered.filter(
        (item) => "first_air_date" in item && !("title" in item),
      );
    }

    if (selectedGenre !== "all") {
      const genreId = Number(selectedGenre);
      filtered = filtered.filter((item) => item.genre_ids?.includes(genreId));
    }

    if (selectedLanguage !== "all") {
      filtered = filtered.filter(
        (item) => item.original_language === selectedLanguage,
      );
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "popularity":
          comparison = (a.popularity || 0) - (b.popularity || 0);
          break;
        case "rating":
          comparison = (a.vote_average || 0) - (b.vote_average || 0);
          break;
        case "release_date": {
          const dateA =
            "release_date" in a ? a.release_date : a.first_air_date || "";
          const dateB =
            "release_date" in b ? b.release_date : b.first_air_date || "";
          comparison = dateA.localeCompare(dateB);
          break;
        }
        case "relevance":
        default:
          return 0;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [
    recommendations,
    extraItems,
    contentTypeFilter,
    selectedGenre,
    selectedLanguage,
    sortField,
    sortOrder,
  ]);

  const visibleItems = processedItems;

  const fetchMoreLikeThis = useCallback(async () => {
    if (isFetchingMore) return;
    setIsFetchingMore(true);

    const currentItems = [...recommendations, ...extraItems];
    const excludedKeys = Array.from(
      new Set(currentItems.map(getRecommendationKey)),
    );
    const seedKeys = (tasteProfile?.clusters || [])
      .flatMap((cluster) => cluster.evidence)
      .filter((evidence) => ["liked", "must_watch", "give_it_a_go"].includes(evidence.signal))
      .map((evidence) => evidence.key)
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .slice(0, 10);
    if (seedKeys.length === 0) {
      setMoreExhausted(true);
      setIsFetchingMore(false);
      return;
    }

    try {
      const payload = await mongoClient.fetchMoreLikeThisRecommendations({
        seedKeys,
        excludedKeys,
        genre: selectedGenre,
        language: selectedLanguage,
        contentType: contentTypeFilter,
      });
      const existing = new Set(excludedKeys);
      const fresh = payload.items.filter((item) => {
        const key = getRecommendationKey(item);
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });

      setMoreExhausted(fresh.length === 0);
      setExtraItems((prev) => [...prev, ...fresh]);
    } catch {
      return;
    } finally {
      setIsFetchingMore(false);
    }
  }, [
    isFetchingMore,
    recommendations,
    extraItems,
    selectedGenre,
    selectedLanguage,
    contentTypeFilter,
    tasteProfile,
  ]);

  const hasMore = hasMoreFromServer;

  useLoadMoreOnScroll({
    sentinel: loadMoreRef,
    enabled: hasMore && !recommendationsHasError && recommendationsState !== "retryable" && !isFetchingNextPage,
    onLoadMore: () => void fetchNextPage(),
    rootMargin: "500px 0px",
    revision: processedItems.length,
  });

  const toggleSortOrder = () =>
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

  const clearFilters = () => {
    setContentTypeFilter("all");
    setRecTypeFilter("all");
    setSelectedGenre("all");
    setSelectedLanguage("all");
    setSortField("relevance");
    setSortOrder("desc");
  };

  const hasActiveFilters =
    contentTypeFilter !== "all" ||
    recTypeFilter !== "all" ||
    selectedGenre !== "all" ||
    selectedLanguage !== "all" ||
    sortField !== "relevance" || sortOrder !== "desc";

  const hasResolvedItems = processedItems.length > 0;

  return (
    <div className="app-page reckon-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="reckon-container">
          <section className="reckon-hero">
            {heroBackdrop && (
              <MediaImage key={heroBackdrop} src={getBackdropUrl(heroBackdrop, "large")} alt="" aria-hidden="true" className="reckon-hero-art" width={1280} height={720} sizes="100vw" fadeIn priority />
            )}
            <div className="reckon-hero-scrim" aria-hidden="true" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <p className="page-kicker flex items-center gap-2"><Sparkles className="size-3.5" aria-hidden="true" />{isPersonalized ? "Personalized for you" : "Trending worldwide"}</p>
                <h1 className="mt-2 text-5xl font-black tracking-[-0.045em] sm:text-6xl">Reckon</h1>
                <p className="mt-3 text-base leading-7 text-white/70">
                  {isPersonalized ? "Picks that evolve with every title you like, save or skip." : "Set your taste to turn these trending picks into a feed made for you."}
                </p>
                {hasPreferences && (
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Your saved preferences">
                    {(preferences?.preferred_languages || []).slice(0, 4).map((code) => (
                      <li key={code} className="reckon-taste-chip">{LANGUAGE_MAP[code] || code.toUpperCase()}</li>
                    ))}
                    {(preferences?.preferred_genres || []).slice(0, 5).map((id) => (
                      <li key={id} className="reckon-taste-chip reckon-taste-chip-genre">{GENRE_MAP[id] || id}</li>
                    ))}
                    {preferenceCount > 9 && <li className="reckon-taste-chip">+{preferenceCount - 9}</li>}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={openPreferences} className="min-h-11 gap-2 rounded-full border-white/20 bg-white/5 px-4 backdrop-blur-sm hover:bg-white/10">
                  <SlidersHorizontal className="size-4" />Preferences
                </Button>
                <Button variant="ghost" onClick={() => void refreshRecommendations()} disabled={isRefreshing} className="min-h-11 gap-2 rounded-full px-4 text-white/75">
                  <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />Refresh
                </Button>
              </div>
            </div>
          </section>

          {!hasPreferences && !reckonLoading && preferences !== null && (
            <button type="button" onClick={openPreferences} className="reckon-setup-card group">
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-lg font-bold">Make these picks yours</span>
                <span className="mt-1 block text-sm text-muted-foreground">Choose your languages and favourite genres. It takes under a minute.</span>
              </span>
              <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform group-hover:translate-x-0.5">
                Set up taste<ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </button>
          )}

          <PickTonight items={recommendations} explanationById={explanationById} />

          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">More for you</h2>
            <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">{processedItems.length} picks</p>
          </div>
          <div className="reckon-filters reckon-filters-sticky mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="reckon-type-tabs" role="group" aria-label="Content type">
                {([
                  { value: "all", label: "All", Icon: Sparkles },
                  { value: "movie", label: "Movies", Icon: Film },
                  { value: "tv", label: "TV Series", Icon: Tv },
                ] as const).map(({value, label, Icon}) => (
                  <button key={value} type="button" aria-pressed={contentTypeFilter === value} onClick={() => setContentTypeFilter(value)} className={cn("reckon-type-tab", contentTypeFilter === value && "reckon-type-tab-active")}><Icon className="size-4" />{label}</button>
                ))}
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                  <SelectTrigger aria-label="Filter by genre" className="select-surface w-full sm:w-40"><SelectValue placeholder="All Genres" /></SelectTrigger>
                  <SelectContent className="z-50 border-border bg-popover">
                    <SelectItem value="all">All Genres</SelectItem>
                    {availableGenres.map(id => <SelectItem key={id} value={String(id)}>{GENRE_MAP[id]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger aria-label="Filter by language" className="select-surface w-full sm:w-40"><SelectValue placeholder="All Languages" /></SelectTrigger>
                  <SelectContent className="z-50 border-border bg-popover">
                    <SelectItem value="all">All Languages</SelectItem>
                    {availableLanguages.map(lang => <SelectItem key={lang} value={lang}>{LANGUAGE_MAP[lang] || lang.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="col-span-2 flex min-w-0 gap-2">
                  <Select value={sortField} onValueChange={value => setSortField(value as SortField)}>
                    <SelectTrigger aria-label="Sort recommendations" className="select-surface min-w-0 flex-1 sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 border-border bg-popover">
                      <SelectItem value="relevance">Relevance</SelectItem><SelectItem value="popularity">Popularity</SelectItem><SelectItem value="rating">Rating</SelectItem><SelectItem value="release_date">Release Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={toggleSortOrder} className="size-11 shrink-0" title={sortOrder === "desc" ? "Descending" : "Ascending"} aria-label={sortOrder === "desc" ? "Sort ascending" : "Sort descending"}><ArrowUpDown className={cn("size-4", sortOrder === "asc" && "rotate-180")} /></Button>
                </div>
                {hasActiveFilters && <Button variant="ghost" onClick={clearFilters} className="col-span-2 min-h-11 text-muted-foreground">Clear filters</Button>}
              </div>
            </div>
            {feedMode === "v2" && <div className="reckon-chip-row" role="group" aria-label="Recommendation category">
              {RECOMMENDATION_TYPES.map(({id,label,description,Icon}) => <button key={id} type="button" title={description} aria-pressed={recTypeFilter === id} onClick={() => setRecTypeFilter(id)} className={cn("reckon-chip", recTypeFilter === id && "reckon-chip-active")}><Icon className="size-3.5" aria-hidden="true" />{label}</button>)}
            </div>}
          </div>

          {/* Grid */}
          {reckonLoading && !hasResolvedItems ? (
            <PosterGridSkeleton count={INITIAL_VISIBLE_ITEMS} />
          ) : visibleItems.length > 0 ? (
            <>
              <div className="content-grid">
                {visibleItems.map((item) => {
                  const itemType = getRecommendationItemType(item);
                  const explanation = explanationById[`${itemType}_${item.id}`];
                  return (
                    <ReckonCard
                      key={`${item.id}-${itemType}`}
                      item={item}
                      type="mixed"
                      reasons={explanation?.reasons}
                      seedTitle={explanation?.seedTitle}
                    />
                  );
                })}
              </div>

              <div ref={loadMoreRef} className="h-12 w-full" />

              {recommendationsHasError ? (
                <div className="flex flex-col items-center gap-2 py-6" role="alert">
                  <p className="text-xs text-muted-foreground">
                    {recommendationsState === "retryable" && recommendationsErrorCode !== "SESSION_EXPIRED"
                      ? "More recommendations could not load. Your current picks are still available."
                      : "Your recommendation session expired. Restart to continue."}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => void retryRecommendations()}
                    disabled={isRefreshing}
                    className="gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                    {isRefreshing ? "Retrying…" : recommendationsErrorCode === "SESSION_EXPIRED" ? "Restart feed" : "Retry"}
                  </Button>
                </div>
              ) : hasMore && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="outline"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load More"}
                  </Button>
                </div>
              )}

              {!hasMore && canFetchMore && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-xs text-muted-foreground">
                    {recommendationsState === "retryable"
                      ? "Recommendations are temporarily unavailable"
                      : selectedLanguage !== "all" && selectedGenre !== "all"
                      ? `More ${GENRE_MAP[Number(selectedGenre)] || "content"} in ${LANGUAGE_MAP[selectedLanguage] || selectedLanguage}`
                      : selectedLanguage !== "all"
                        ? `More content in ${LANGUAGE_MAP[selectedLanguage] || selectedLanguage}`
                        : selectedGenre !== "all"
                          ? `More ${GENRE_MAP[Number(selectedGenre)] || "content"}`
                          : hasPreferences
                            ? "More picks guided by your preferences"
                            : "More recommendations"}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      recommendationsState === "retryable"
                        ? void refreshRecommendations()
                        : void fetchMoreLikeThis()
                    }
                    disabled={isFetchingMore}
                    className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <RefreshCw
                      className={cn(
                        "w-4 h-4",
                        isFetchingMore && "animate-spin",
                      )}
                    />
                    {isFetchingMore
                      ? "Fetching…"
                      : recommendationsState === "retryable"
                        ? "Retry"
                        : "Show More Like This"}
                  </Button>
                </div>
              )}
            </>
          ) : recommendationsHasError ? (
            <div className="empty-state">
              <RefreshCw className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Recommendations could not load</h3>
              <p className="text-muted-foreground mb-4">Your feed is still available to retry.</p>
              <Button onClick={() => void retryRecommendations()} disabled={isRefreshing}>
                {isRefreshing ? "Retrying…" : "Retry"}
              </Button>
            </div>
          ) : hasMore ? (
            <div className="empty-state">
              <div ref={loadMoreRef} className="h-12 w-full" />
              <RefreshCw className={cn("w-12 h-12 text-muted-foreground mx-auto mb-4", isFetchingNextPage && "animate-spin")} />
              <h3 className="text-xl font-semibold mb-2">Loading more recommendations</h3>
              <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading…" : "Load More"}
              </Button>
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                No recommendations found
              </h3>
              <p className="text-muted-foreground mb-4">
                {hasActiveFilters
                  ? "Try adjusting your filters or clearing them"
                  : "Start watching and liking content to unlock stronger recommendations."}
              </p>
              {hasActiveFilters && (
                <Button onClick={clearFilters}>Clear Filters</Button>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
