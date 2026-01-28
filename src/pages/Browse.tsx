import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import {
  discoverMovies,
  discoverTVShows,
  getMovieGenres,
  getTVGenres,
  getBollywoodMovies,
  getHollywoodMovies,
  Movie,
  TVShow,
  Genre,
  getPosterUrl,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ContentType = "all" | "bollywood" | "hollywood" | "tv";
type SortOption = "popularity.desc" | "vote_average.desc" | "release_date.desc" | "revenue.desc";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "release_date.desc", label: "Newest First" },
  { value: "revenue.desc", label: "Highest Grossing" },
];

export default function Browse() {
  const { user, isLoading: userLoading } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [contentType, setContentType] = useState<ContentType>(
    (searchParams.get("type") as ContentType) || "all"
  );
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get("genre") || "");
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || "popularity.desc"
  );
  const [page, setPage] = useState(1);

  // Redirect if no user
  useEffect(() => {
    if (!userLoading && !user) {
      navigate("/");
    }
  }, [user, userLoading, navigate]);

  // Fetch genres
  const { data: movieGenres } = useQuery({
    queryKey: ["movie-genres"],
    queryFn: getMovieGenres,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const { data: tvGenres } = useQuery({
    queryKey: ["tv-genres"],
    queryFn: getTVGenres,
    staleTime: 1000 * 60 * 60,
  });

  // Get appropriate genres based on content type
  const genres: Genre[] = contentType === "tv" ? tvGenres || [] : movieGenres || [];

  // Fetch content based on filters
  const { data: contentData, isLoading } = useQuery({
    queryKey: ["browse", contentType, selectedGenre, sortBy, page],
    queryFn: async () => {
      const filters = {
        page,
        sort_by: sortBy,
        with_genres: selectedGenre || undefined,
      };

      switch (contentType) {
        case "bollywood":
          return discoverMovies({ ...filters, with_original_language: "hi" });
        case "hollywood":
          return discoverMovies({ ...filters, with_original_language: "en" });
        case "tv":
          return discoverTVShows(filters);
        default:
          return discoverMovies(filters);
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (contentType !== "all") params.set("type", contentType);
    if (selectedGenre) params.set("genre", selectedGenre);
    if (sortBy !== "popularity.desc") params.set("sort", sortBy);
    setSearchParams(params, { replace: true });
  }, [contentType, selectedGenre, sortBy, setSearchParams]);

  const handleItemClick = (item: Movie | TVShow) => {
    const isTV = "first_air_date" in item;
    navigate(`/${isTV ? "tv" : "movie"}/${item.id}`);
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
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4">
          {/* Page Title */}
          <h1 className="text-3xl font-bold mb-6">Browse</h1>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            {/* Content Type Tabs */}
            <Tabs
              value={contentType}
              onValueChange={(value) => {
                setContentType(value as ContentType);
                setSelectedGenre("");
                setPage(1);
              }}
            >
              <TabsList className="bg-muted">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="bollywood">🇮🇳 Bollywood</TabsTrigger>
                <TabsTrigger value="hollywood">🎬 Hollywood</TabsTrigger>
                <TabsTrigger value="tv">📺 TV Series</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex gap-4 flex-wrap">
              {/* Genre Filter */}
              <Select
                value={selectedGenre}
                onValueChange={(value) => {
                  setSelectedGenre(value === "all" ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px] bg-card">
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

              {/* Sort By */}
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value as SortOption);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px] bg-card">
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

          {/* Content Grid */}
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
                {contentData?.results.map((item) => (
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

                      {/* Rating Badge */}
                      {item.vote_average > 0 && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
                          ⭐ {item.vote_average.toFixed(1)}
                        </div>
                      )}

                      {/* Language Badge */}
                      <div
                        className={cn(
                          "absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold",
                          item.original_language === "hi"
                            ? "badge-hindi"
                            : item.original_language === "en"
                            ? "badge-english"
                            : "bg-muted"
                        )}
                      >
                        {item.original_language === "hi" ? "HI" : item.original_language.toUpperCase()}
                      </div>
                    </div>

                    <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                      {getTitle(item)}
                    </h3>
                    <p className="text-xs text-muted-foreground">{getYear(item)}</p>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {contentData && contentData.total_pages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-4 text-sm text-muted-foreground">
                    Page {page} of {Math.min(contentData.total_pages, 500)}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= Math.min(contentData.total_pages, 500)}
                  >
                    Next
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
