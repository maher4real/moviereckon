import { useState, useMemo, useEffect, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRecommendations } from "@/hooks/useRecommendations";
import { Movie, TVShow, getPosterUrl, getLanguageBadgeClass } from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { ContentCard } from "@/components/ContentCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowUpDown, Filter, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type SortField = "relevance" | "popularity" | "rating" | "release_date";
type SortOrder = "asc" | "desc";

const ITEMS_PER_PAGE_OPTIONS = [12, 24, 36, 48];

// Genre ID to name mapping (TMDB)
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
};

const ReckonCard = memo(({ item, type }: { item: Movie | TVShow; type: "movie" | "tv" | "mixed" }) => {
  return <ContentCard item={item} type={type} showActions={true} />;
});

ReckonCard.displayName = "ReckonCard";

export default function Reckon() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { items: recommendations, isLoading: reckonLoading, isPersonalized } = useRecommendations();

  // Filters and sorting
  const [sortField, setSortField] = useState<SortField>("relevance");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Get unique genres from recommendations
  const availableGenres = useMemo(() => {
    const genres = new Set<number>();
    recommendations.forEach((item) => {
      item.genre_ids?.forEach((g) => genres.add(g));
    });
    return Array.from(genres)
      .filter((g) => GENRE_MAP[g])
      .sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]));
  }, [recommendations]);

  // Get unique languages from recommendations
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

  // Filter and sort recommendations
  const processedItems = useMemo(() => {
    let filtered = [...recommendations];

    // Filter by genre
    if (selectedGenre) {
      const genreId = Number(selectedGenre);
      filtered = filtered.filter((item) => item.genre_ids?.includes(genreId));
    }

    // Filter by language
    if (selectedLanguage) {
      filtered = filtered.filter((item) => item.original_language === selectedLanguage);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "popularity":
          comparison = (a.popularity || 0) - (b.popularity || 0);
          break;
        case "rating":
          comparison = (a.vote_average || 0) - (b.vote_average || 0);
          break;
        case "release_date":
          const dateA = "release_date" in a ? a.release_date : a.first_air_date || "";
          const dateB = "release_date" in b ? b.release_date : b.first_air_date || "";
          comparison = dateA.localeCompare(dateB);
          break;
        case "relevance":
        default:
          // Keep original order (already sorted by relevance)
          return 0;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [recommendations, selectedGenre, selectedLanguage, sortField, sortOrder]);

  // Paginate
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return processedItems.slice(start, start + itemsPerPage);
  }, [processedItems, page, itemsPerPage]);

  const totalPages = Math.ceil(processedItems.length / itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedGenre, selectedLanguage, sortField, sortOrder, itemsPerPage]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const clearFilters = () => {
    setSelectedGenre("");
    setSelectedLanguage("");
    setSortField("relevance");
    setSortOrder("desc");
  };

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
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Reckon</h1>
                <p className="text-muted-foreground">
                  {isPersonalized
                    ? "Personalized recommendations just for you"
                    : "Top picks and trending content"}
                </p>
              </div>
              {isPersonalized && (
                <Badge className="bg-primary/20 text-primary ml-2">
                  Personalized
                </Badge>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{processedItems.length} recommendations</span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
            {/* Genre Filter */}
            <Select value={selectedGenre} onValueChange={setSelectedGenre}>
              <SelectTrigger className="w-full sm:w-[160px] bg-card">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
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

            {/* Language Filter */}
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-full sm:w-[160px] bg-card">
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

            {/* Sort Field */}
            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="w-full sm:w-[160px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="popularity">Popularity</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
                <SelectItem value="release_date">Release Date</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Order Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSortOrder}
              className="bg-card shrink-0"
              title={sortOrder === "desc" ? "Descending" : "Ascending"}
            >
              <ArrowUpDown className={cn("w-4 h-4", sortOrder === "asc" && "rotate-180")} />
            </Button>

            {/* Rows per page */}
            <Select value={String(itemsPerPage)} onValueChange={(v) => setItemsPerPage(Number(v))}>
              <SelectTrigger className="w-full sm:w-[120px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            {(selectedGenre || selectedLanguage || sortField !== "relevance") && (
              <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Content Grid */}
          {reckonLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: itemsPerPage }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                  <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="mt-1 h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : paginatedItems.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {paginatedItems.map((item) => {
                  const isTV = "first_air_date" in item;
                  return (
                    <ReckonCard
                      key={`${item.id}-${isTV ? "tv" : "movie"}`}
                      item={item}
                      type="mixed"
                    />
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="flex items-center px-4 text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPage(totalPages)}
                      disabled={page >= totalPages}
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No recommendations found</h3>
              <p className="text-muted-foreground mb-4">
                {selectedGenre || selectedLanguage
                  ? "Try adjusting your filters"
                  : "Start watching and liking content to get personalized recommendations!"}
              </p>
              {(selectedGenre || selectedLanguage) && (
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
