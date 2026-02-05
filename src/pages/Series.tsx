import { useState, useEffect, useMemo, memo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  discoverTVShows,
  getTVGenres,
  getPopularTVShows,
  getTopRatedTVShows,
  TVShow,
  Genre,
  getPosterUrl,
  getLanguageBadgeClass,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Tv, ChevronLeft, ChevronRight } from "lucide-react";

type SeriesCategory = "all" | "popular" | "top_rated" | "korean" | "indian" | "anime";
type SortOption = "popularity.desc" | "vote_average.desc" | "first_air_date.desc";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "first_air_date.desc", label: "Newest" },
];

const PosterCard = memo(({ item, onClick }: { item: TVShow; onClick: () => void }) => (
  <div onClick={onClick} className="cursor-pointer group">
    <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
      <img
        src={getPosterUrl(item.poster_path, "medium")}
        alt={item.name}
        className="w-full h-full object-cover"
        loading="lazy"
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
      {item.name}
    </h3>
    <p className="text-xs text-muted-foreground">{item.first_air_date?.split("-")[0] || ""}</p>
  </div>
));

PosterCard.displayName = "PosterCard";

export default function Series() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [category, setCategory] = useState<SeriesCategory>(
    (searchParams.get("category") as SeriesCategory) || "all"
  );
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get("genre") || "");
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || "popularity.desc"
  );
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const { data: genres } = useQuery({
    queryKey: ["tv-genres"],
    queryFn: getTVGenres,
    staleTime: 1000 * 60 * 60,
  });

  const { data: contentData, isLoading } = useQuery({
    queryKey: ["series", category, selectedGenre, sortBy, page],
    queryFn: async () => {
      if (category === "popular") return getPopularTVShows(page);
      if (category === "top_rated") return getTopRatedTVShows(page);

      const filters: Record<string, any> = {
        page,
        sort_by: sortBy,
        with_genres: selectedGenre || undefined,
      };

      if (category === "korean") filters.with_original_language = "ko";
      if (category === "indian") filters.with_original_language = "hi";
      if (category === "anime") {
        filters.with_genres = "16"; // Animation
        filters.with_original_language = "ja";
      }

      return discoverTVShows(filters);
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (selectedGenre) params.set("genre", selectedGenre);
    if (sortBy !== "popularity.desc") params.set("sort", sortBy);
    if (page > 1) params.set("page", String(page));
    setSearchParams(params, { replace: true });
  }, [category, selectedGenre, sortBy, page, setSearchParams]);

  const totalPages = Math.min(contentData?.total_pages || 1, 50);
  const isSpecialCategory = ["popular", "top_rated"].includes(category);

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
          <div className="flex items-center gap-3 mb-6">
            <Tv className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">TV Series</h1>
          </div>

          {/* Category Chips */}
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-6">
            <div className="flex gap-2">
              {[
                { value: "all", label: "All Series" },
                { value: "popular", label: "🔥 Popular" },
                { value: "top_rated", label: "⭐ Top Rated" },
                { value: "korean", label: "🇰🇷 K-Drama" },
                { value: "indian", label: "🇮🇳 Indian" },
                { value: "anime", label: "🎌 Anime" },
              ].map((cat) => (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setCategory(cat.value as SeriesCategory); setPage(1); }}
                  className="whitespace-nowrap"
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex gap-3 flex-wrap mb-6">
            <Select
              value={selectedGenre}
              onValueChange={(v) => { setSelectedGenre(v === "all" ? "" : v); setPage(1); }}
              disabled={isSpecialCategory || category === "anime"}
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
              onValueChange={(v) => { setSortBy(v as SortOption); setPage(1); }}
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
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                  <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {contentData?.results?.map((item: TVShow) => (
                  <PosterCard key={item.id} item={item} onClick={() => navigate(`/tv/${item.id}`)} />
                ))}
              </div>

              {(!contentData?.results || contentData.results.length === 0) && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No series found for the selected filters.</p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="px-4 text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
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