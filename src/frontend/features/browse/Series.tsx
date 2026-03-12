import { useState, useEffect, useMemo, memo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  discoverTVShows,
  getTVGenres,
  getPopularTVShows,
  getTopRatedTVShows,
  TVShow,
  Genre,
  getPosterUrl,
  getLanguageBadgeClass,
  getLanguageLabel,
  DiscoverFilters,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import {
  AppPageSkeleton,
  PosterGridSkeleton,
  InlineLoadMoreSkeleton,
} from "@/frontend/components/AppSkeletons";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { Tv } from "lucide-react";

type SeriesCategory =
  | "all"
  | "popular"
  | "top_rated"
  | "upcoming"
  | "korean"
  | "indian"
  | "anime";
type SortOption =
  | "popularity.desc"
  | "vote_average.desc"
  | "first_air_date.desc"
  | "first_air_date.asc";

interface SeriesPage {
  results: TVShow[];
  total_pages: number;
  page: number;
  total_results: number;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "first_air_date.desc", label: "Newest" },
  { value: "first_air_date.asc", label: "Earliest Release" },
];
const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

const OTT_OPTIONS = [
  { value: "all", label: "All OTT" },
  { value: "8", label: "Netflix" },
  { value: "9", label: "Prime Video" },
  { value: "337", label: "Disney+" },
  { value: "15", label: "Hulu" },
  { value: "350", label: "Apple TV+" },
];

const LANGUAGE_OPTIONS = [
  { value: "all", label: "All Languages" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ko", label: "Korean" },
  { value: "ja", label: "Japanese" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

const isAnimeLikeSeries = (item: TVShow) =>
  item.original_language === "ja" && item.genre_ids?.includes(16);

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const PosterCard = memo(
  ({ item, onClick, ottLabel }: { item: TVShow; onClick: () => void; ottLabel?: string }) => (
    <div onClick={onClick} className="cursor-pointer group">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
        <MediaImage
          src={getPosterUrl(item.poster_path, "medium")}
          alt={item.name}
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
        {ottLabel && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 text-[10px] font-semibold uppercase tracking-wide">
            {ottLabel}
          </div>
        )}
      </div>
      <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
        {item.name}
      </h3>
      <p className="text-xs text-muted-foreground">
        {item.first_air_date?.split("-")[0] || ""} • {getLanguageLabel(item.original_language)}
      </p>
    </div>
  )
);

PosterCard.displayName = "PosterCard";

export default function Series() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [category, setCategory] = useState<SeriesCategory>(
    (searchParams.get("category") as SeriesCategory) || "all"
  );
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get("genre") || "");
  const [selectedYear, setSelectedYear] = useState<string>(searchParams.get("year") || "");
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || "popularity.desc"
  );
  const [ottFilter, setOttFilter] = useState<string>(searchParams.get("platform") || "all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(searchParams.get("lang") || "all");

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

  const resolvedLanguage = useMemo(() => {
    if (category === "korean") return "ko";
    if (category === "indian") return "hi";
    if (category === "anime") return "ja";
    return selectedLanguage === "all" ? undefined : selectedLanguage;
  }, [category, selectedLanguage]);

  const normalizedGenre = useMemo(() => {
    if (category === "anime") return "16";
    return selectedGenre || undefined;
  }, [category, selectedGenre]);

  const isSpecialCategory = ["popular", "top_rated"].includes(category);

  const {
    data: contentData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<SeriesPage>({
    queryKey: ["series-infinite", category, selectedGenre, selectedYear, sortBy, ottFilter, selectedLanguage],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;
      const needsFilteredDiscover = !!normalizedGenre || !!resolvedLanguage || !!selectedYear || ottFilter !== "all";
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);
      const yearStart = selectedYear ? `${selectedYear}-01-01` : undefined;
      const yearEnd = selectedYear ? `${selectedYear}-12-31` : undefined;

      if (category === "popular" && !needsFilteredDiscover) {
        return getPopularTVShows(page);
      }

      if (category === "top_rated" && !needsFilteredDiscover) {
        return getTopRatedTVShows(page);
      }

      if (category === "upcoming") {
        const filters: DiscoverFilters = {
          page,
          sort_by: sortBy === "popularity.desc" ? "first_air_date.asc" : sortBy,
          with_genres: normalizedGenre,
          with_original_language: resolvedLanguage,
          "first_air_date.gte": yearStart ? (yearStart > tomorrowStr ? yearStart : tomorrowStr) : tomorrowStr,
          "first_air_date.lte": yearEnd,
        };

        if (ottFilter !== "all") {
          filters.with_watch_providers = ottFilter;
          filters.watch_region = "US";
        }

        return discoverTVShows(filters);
      }

      const filters: DiscoverFilters = {
        page,
        sort_by: isSpecialCategory
          ? category === "popular"
            ? "popularity.desc"
            : "vote_average.desc"
          : sortBy,
        with_genres: normalizedGenre,
        with_original_language: resolvedLanguage,
        "first_air_date.gte": yearStart,
        "first_air_date.lte": yearEnd,
      };

      if (ottFilter !== "all") {
        filters.with_watch_providers = ottFilter;
        filters.watch_region = "US";
      }

      return discoverTVShows(filters);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.page || !lastPage?.total_pages) return undefined;
      return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
    enabled: !authLoading && !!user,
  });

  const filteredSeries = useMemo(() => {
    if (!contentData?.pages) return [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatLocalDate(tomorrow);

    const dedupe = new Set<number>();
    const merged: TVShow[] = [];

    contentData.pages.forEach((page) => {
      (page.results || []).forEach((item) => {
        if (dedupe.has(item.id)) return;

        const animeLike = isAnimeLikeSeries(item);
        if (category === "anime" && !animeLike) return;
        if (category !== "anime" && animeLike) return;
        if (category === "upcoming" && item.first_air_date < tomorrowStr) return;
        if (selectedYear && !item.first_air_date?.startsWith(`${selectedYear}-`)) return;
        if (selectedLanguage !== "all" && category === "all" && item.original_language !== selectedLanguage) {
          return;
        }

        dedupe.add(item.id);
        merged.push(item);
      });
    });

    return merged;
  }, [contentData, category, selectedLanguage, selectedYear]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (selectedGenre) params.set("genre", selectedGenre);
    if (selectedYear) params.set("year", selectedYear);
    if (sortBy !== "popularity.desc") params.set("sort", sortBy);
    if (ottFilter !== "all") params.set("platform", ottFilter);
    if (selectedLanguage !== "all") params.set("lang", selectedLanguage);
    setSearchParams(params, { replace: true });
  }, [category, selectedGenre, selectedYear, sortBy, ottFilter, selectedLanguage, setSearchParams]);

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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, filteredSeries.length]);

  const ottLabel = useMemo(
    () => OTT_OPTIONS.find((opt) => opt.value === ottFilter)?.label,
    [ottFilter]
  );

  const cardOttLabel = useMemo(() => {
    if (ottFilter !== "all") return ottLabel;
    if (category === "anime") return "Anime";
    if (category === "korean") return "K-Drama";
    if (category === "indian") return "Indian OTT";
    return "OTT Mix";
  }, [ottFilter, ottLabel, category]);

  if (authLoading) {
    return <AppPageSkeleton cardCount={18} />;
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

          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-6">
            <div className="flex gap-2">
              {[
                { value: "all", label: "All Series" },
                { value: "popular", label: "🔥 Popular" },
                { value: "top_rated", label: "⭐ Top Rated" },
                { value: "upcoming", label: "🗓️ Upcoming" },
                { value: "korean", label: "🇰🇷 K-Drama" },
                { value: "indian", label: "🇮🇳 Indian" },
                { value: "anime", label: "🎌 Anime" },
              ].map((cat) => (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory(cat.value as SeriesCategory)}
                  className="whitespace-nowrap"
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap mb-6">
            <Select
              value={selectedGenre}
              onValueChange={(v) => setSelectedGenre(v === "all" ? "" : v)}
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
              onValueChange={(v) => setSortBy(v as SortOption)}
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

            <Select value={ottFilter} onValueChange={setOttFilter}>
              <SelectTrigger className="w-[160px] bg-card">
                <SelectValue placeholder="OTT Platform" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {OTT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedYear}
              onValueChange={(v) => setSelectedYear(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50 max-h-[300px]">
                <SelectItem value="all">All Years</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
              disabled={category === "korean" || category === "indian" || category === "anime"}
            >
              <SelectTrigger className="w-[170px] bg-card">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <PosterGridSkeleton count={18} />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredSeries.map((item) => (
                  <PosterCard
                    key={item.id}
                    item={item}
                    onClick={() =>
                      navigate(`/tv/${item.id}`, {
                        state: {
                          from: `${location.pathname}${location.search}${location.hash}`,
                        },
                      })
                    }
                    ottLabel={cardOttLabel}
                  />
                ))}
              </div>

              {filteredSeries.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No series found for the selected filters.</p>
                </div>
              )}

              <div ref={loadMoreRef} className="h-12 w-full" />

              {isFetchingNextPage && (
                <InlineLoadMoreSkeleton />
              )}

              {!hasNextPage && filteredSeries.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  You are all caught up.
                </p>
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
