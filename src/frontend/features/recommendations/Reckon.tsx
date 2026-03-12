import { useState, useMemo, useEffect, memo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useRecommendations } from "@/frontend/hooks/useRecommendations";
import { Movie, TVShow } from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import { AppPageSkeleton, PosterGridSkeleton } from "@/frontend/components/AppSkeletons";
import { ContentCard } from "@/frontend/components/ContentCard";
import { Button } from "@/frontend/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select";
import { Badge } from "@/frontend/components/ui/badge";
import { Sparkles, ArrowUpDown, RefreshCw, Film, Tv } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type ContentTypeFilter = "all" | "movie" | "tv";
type SortField = "relevance" | "popularity" | "rating" | "release_date";
type SortOrder = "asc" | "desc";

const INITIAL_VISIBLE_ITEMS = 48;
const LOAD_MORE_BATCH = 32;

const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

const LANGUAGE_MAP: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  gu: "Gujarati",
  ko: "Korean",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
  tr: "Turkish",
  pt: "Portuguese",
};

const getRecommendationItemType = (item: Movie | TVShow): "movie" | "tv" =>
  "title" in item ? "movie" : "tv";

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
  }) => {
    return (
      <ContentCard
        item={item}
        type={type}
        showActions={true}
        recommendationReasons={reasons}
        recommendationSeedTitle={seedTitle}
      />
    );
  },
);

ReckonCard.displayName = "ReckonCard";

export default function Reckon() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const {
    items: recommendations,
    isLoading: reckonLoading,
    isRefreshing,
    isPersonalized,
    explanationById,
    refreshRecommendations,
  } = useRecommendations();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>("all");
  const [sortField, setSortField] = useState<SortField>("relevance");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ITEMS);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const availableGenres = useMemo(() => {
    const genres = new Set<number>();
    recommendations.forEach((item) => {
      item.genre_ids?.forEach((g) => genres.add(g));
    });

    return Array.from(genres)
      .filter((g) => GENRE_MAP[g])
      .sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]));
  }, [recommendations]);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    recommendations.forEach((item) => {
      if (item.original_language) {
        langs.add(item.original_language);
      }
    });

    return Array.from(langs)
      .filter((l) => LANGUAGE_MAP[l])
      .sort((a, b) => LANGUAGE_MAP[a].localeCompare(LANGUAGE_MAP[b]));
  }, [recommendations]);

  const processedItems = useMemo(() => {
    let filtered = [...recommendations];

    if (contentTypeFilter === "movie") {
      filtered = filtered.filter((item) => "title" in item);
    } else if (contentTypeFilter === "tv") {
      filtered = filtered.filter((item) => "first_air_date" in item && !("title" in item));
    }

    if (selectedGenre !== "all") {
      const genreId = Number(selectedGenre);
      filtered = filtered.filter((item) => item.genre_ids?.includes(genreId));
    }

    if (selectedLanguage !== "all") {
      filtered = filtered.filter((item) => item.original_language === selectedLanguage);
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
          const dateA = "release_date" in a ? a.release_date : a.first_air_date || "";
          const dateB = "release_date" in b ? b.release_date : b.first_air_date || "";
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
  }, [recommendations, contentTypeFilter, selectedGenre, selectedLanguage, sortField, sortOrder]);

  const visibleItems = useMemo(
    () => processedItems.slice(0, visibleCount),
    [processedItems, visibleCount]
  );

  const hasMore = visibleCount < processedItems.length;

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ITEMS);
  }, [contentTypeFilter, selectedGenre, selectedLanguage, sortField, sortOrder]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + LOAD_MORE_BATCH, processedItems.length));
      },
      { rootMargin: "500px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, processedItems.length, visibleItems.length]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const clearFilters = () => {
    setContentTypeFilter("all");
    setSelectedGenre("all");
    setSelectedLanguage("all");
    setSortField("relevance");
    setSortOrder("desc");
  };

  if (authLoading) {
    return <AppPageSkeleton cardCount={18} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Reckon</h1>
                <p className="text-muted-foreground">
                  {isPersonalized
                    ? "Personalized recommendations that evolve with your activity"
                    : "Trending and globally diverse picks"}
                </p>
              </div>
              {isPersonalized && (
                <Badge className="bg-primary/20 text-primary ml-2">
                  Personalized
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refreshRecommendations();
                }}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                Refresh Picks
              </Button>
              <span>{processedItems.length} recommendations</span>
            </div>
          </div>

          <div className="flex gap-2 mb-6 bg-card/50 p-3 rounded-lg border border-border">
            <Button
              variant={contentTypeFilter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setContentTypeFilter("all")}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              All
            </Button>
            <Button
              variant={contentTypeFilter === "movie" ? "default" : "ghost"}
              size="sm"
              onClick={() => setContentTypeFilter("movie")}
              className="gap-2"
            >
              <Film className="w-4 h-4" />
              Movies
            </Button>
            <Button
              variant={contentTypeFilter === "tv" ? "default" : "ghost"}
              size="sm"
              onClick={() => setContentTypeFilter("tv")}
              className="gap-2"
            >
              <Tv className="w-4 h-4" />
              TV Series
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
            <Select value={selectedGenre} onValueChange={setSelectedGenre}>
              <SelectTrigger className="w-full sm:w-[170px] bg-card">
                <SelectValue placeholder="All Genres" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="all">All Genres</SelectItem>
                {availableGenres.map((genreId) => (
                  <SelectItem key={genreId} value={String(genreId)}>
                    {GENRE_MAP[genreId]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-full sm:w-[170px] bg-card">
                <SelectValue placeholder="All Languages" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="all">All Languages</SelectItem>
                {availableLanguages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {LANGUAGE_MAP[lang] || lang.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="w-full sm:w-[170px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="popularity">Popularity</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
                <SelectItem value="release_date">Release Date</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleSortOrder}
              className="bg-card shrink-0"
              title={sortOrder === "desc" ? "Descending" : "Ascending"}
            >
              <ArrowUpDown className={cn("w-4 h-4", sortOrder === "asc" && "rotate-180")} />
            </Button>

            {(selectedGenre !== "all" || selectedLanguage !== "all" || sortField !== "relevance") && (
              <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {reckonLoading ? (
            <PosterGridSkeleton count={INITIAL_VISIBLE_ITEMS} />
          ) : visibleItems.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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

              {hasMore && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount((prev) => Math.min(prev + LOAD_MORE_BATCH, processedItems.length))}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No recommendations found</h3>
              <p className="text-muted-foreground mb-4">
                {selectedGenre !== "all" || selectedLanguage !== "all"
                  ? "Try adjusting your filters"
                  : "Start watching and liking content to unlock stronger recommendations."}
              </p>
              {(selectedGenre !== "all" || selectedLanguage !== "all") && (
                <Button onClick={clearFilters}>Clear Filters</Button>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
