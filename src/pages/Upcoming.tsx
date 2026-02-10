import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  discoverMovies,
  discoverTVShows,
  getMovieGenres,
  getTVGenres,
  Movie,
  TVShow,
  Genre,
  getPosterUrl,
  getLanguageBadgeClass,
  DiscoverFilters,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import MediaImage from "@/components/MediaImage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type UpcomingSection = "all" | "movies" | "series";
type MovieSectionFilter = "all" | "bollywood" | "hollywood";
type UpcomingViewMode = "grid" | "calendar";

interface UpcomingPage {
  results: (Movie | TVShow)[];
  total_pages: number;
  page: number;
  total_results: number;
}

const MOVIE_SECTION_OPTIONS: { value: MovieSectionFilter; label: string }[] = [
  { value: "all", label: "All Movies" },
  { value: "bollywood", label: "Bollywood" },
  { value: "hollywood", label: "Hollywood" },
];

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

const BOLLYWOOD_LANGUAGE_OPTIONS = [
  { value: "all", label: "All Languages" },
  { value: "hi", label: "Hindi" },
  { value: "gu", label: "Gujarati" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
];
const BOLLYWOOD_LANGUAGE_CODES = new Set(["hi", "gu", "ta", "te", "kn"]);

const isAnimeLike = (item: Movie | TVShow) =>
  item.original_language === "ja" && item.genre_ids?.includes(16);

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isTVShow = (item: Movie | TVShow): item is TVShow => "first_air_date" in item;

const getReleaseDate = (item: Movie | TVShow) =>
  isTVShow(item) ? item.first_air_date : item.release_date;

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const getMonthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const parseDateKey = (value: string): Date | null => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const PosterCard = memo(({ item, onClick }: { item: Movie | TVShow; onClick: () => void }) => {
  const isTV = isTVShow(item);
  const title = isTV ? item.name : item.title;
  const year = getReleaseDate(item)?.split("-")[0] || "";

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

        <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 text-[10px] font-semibold uppercase tracking-wide">
          {isTV ? "Series" : "Movie"}
        </div>
      </div>

      <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{year}</p>
    </div>
  );
});

PosterCard.displayName = "PosterCard";

export default function Upcoming() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const calendarLoadMoreRef = useRef<HTMLDivElement | null>(null);

  const [section, setSection] = useState<UpcomingSection>(
    (searchParams.get("section") as UpcomingSection) || "all",
  );
  const [movieSectionFilter, setMovieSectionFilter] = useState<MovieSectionFilter>(
    (searchParams.get("movieType") as MovieSectionFilter) || "all",
  );
  const [viewMode, setViewMode] = useState<UpcomingViewMode>(
    searchParams.get("view") === "calendar" ? "calendar" : "grid",
  );
  const [bollywoodLanguage, setBollywoodLanguage] = useState<string>(searchParams.get("bollyLang") || "all");
  const [movieGenre, setMovieGenre] = useState<string>(searchParams.get("movieGenre") || "");
  const [seriesGenre, setSeriesGenre] = useState<string>(searchParams.get("seriesGenre") || "");
  const [seriesOtt, setSeriesOtt] = useState<string>(searchParams.get("ott") || "all");
  const [seriesLanguage, setSeriesLanguage] = useState<string>(searchParams.get("lang") || "all");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(undefined);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => getMonthStart(new Date()));

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const { data: movieGenres } = useQuery({
    queryKey: ["movie-genres"],
    queryFn: getMovieGenres,
    staleTime: 1000 * 60 * 60,
  });

  const { data: tvGenres } = useQuery({
    queryKey: ["tv-genres"],
    queryFn: getTVGenres,
    staleTime: 1000 * 60 * 60,
  });

  const {
    data: upcomingData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<UpcomingPage>({
    queryKey: [
      "upcoming-infinite",
      section,
      movieSectionFilter,
      bollywoodLanguage,
      movieGenre,
      seriesGenre,
      seriesOtt,
      seriesLanguage,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);

      if (section === "movies") {
        const filters: DiscoverFilters = {
          page,
          sort_by: "primary_release_date.asc",
          with_genres: movieGenre || undefined,
          "primary_release_date.gte": tomorrowStr,
        };

        if (movieSectionFilter === "hollywood") {
          filters.with_original_language = "en";
        }

        if (movieSectionFilter === "bollywood" && bollywoodLanguage !== "all") {
          filters.with_original_language = bollywoodLanguage;
        }

        return discoverMovies(filters);
      }

      if (section === "series") {
        const filters: DiscoverFilters = {
          page,
          sort_by: "first_air_date.asc",
          with_genres: seriesGenre || undefined,
          with_original_language: seriesLanguage === "all" ? undefined : seriesLanguage,
          "first_air_date.gte": tomorrowStr,
        };

        if (seriesOtt !== "all") {
          filters.with_watch_providers = seriesOtt;
          filters.watch_region = "US";
        }

        return discoverTVShows(filters);
      }

      const [upcomingMovies, upcomingSeries] = await Promise.all([
        discoverMovies({
          page,
          sort_by: "primary_release_date.asc",
          "primary_release_date.gte": tomorrowStr,
        }).catch(() => ({
          page,
          results: [] as Movie[],
          total_pages: 1,
          total_results: 0,
        })),
        discoverTVShows({
          page,
          sort_by: "first_air_date.asc",
          "first_air_date.gte": tomorrowStr,
        }).catch(() => ({
          page,
          results: [] as TVShow[],
          total_pages: 1,
          total_results: 0,
        })),
      ]);

      return {
        page,
        results: [...(upcomingMovies.results || []), ...(upcomingSeries.results || [])],
        total_pages: Math.max(upcomingMovies.total_pages || 1, upcomingSeries.total_pages || 1),
        total_results: (upcomingMovies.total_results || 0) + (upcomingSeries.total_results || 0),
      };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.page || !lastPage?.total_pages) return undefined;
      return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
    enabled: !authLoading && !!user,
  });

  const filteredUpcoming = useMemo(() => {
    if (!upcomingData?.pages) return [];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatLocalDate(tomorrow);

    const dedupe = new Set<string>();
    const merged: (Movie | TVShow)[] = [];

    upcomingData.pages.forEach((page) => {
      (page.results || []).forEach((item) => {
        const itemIsTV = isTVShow(item);
        if (section === "movies" && itemIsTV) return;
        if (section === "series" && !itemIsTV) return;

        const releaseDate = getReleaseDate(item);
        if (!releaseDate || releaseDate < tomorrowStr) return;
        if (isAnimeLike(item)) return;

        if (section === "movies") {
          if (movieSectionFilter === "hollywood" && item.original_language !== "en") return;
          if (
            movieSectionFilter === "bollywood" &&
            bollywoodLanguage === "all" &&
            !BOLLYWOOD_LANGUAGE_CODES.has(item.original_language)
          ) {
            return;
          }
          if (
            movieSectionFilter === "bollywood" &&
            bollywoodLanguage !== "all" &&
            item.original_language !== bollywoodLanguage
          ) {
            return;
          }
          if (movieGenre && !item.genre_ids?.includes(Number(movieGenre))) return;
        }

        if (section === "series") {
          if (seriesLanguage !== "all" && item.original_language !== seriesLanguage) return;
          if (seriesGenre && !item.genre_ids?.includes(Number(seriesGenre))) return;
        }

        const key = `${itemIsTV ? "tv" : "movie"}:${item.id}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);
        merged.push(item);
      });
    });

    return merged.sort((a, b) => {
      const dateComparison = (getReleaseDate(a) || "9999-12-31").localeCompare(
        getReleaseDate(b) || "9999-12-31",
      );
      if (dateComparison !== 0) return dateComparison;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  }, [
    upcomingData,
    section,
    movieSectionFilter,
    bollywoodLanguage,
    movieGenre,
    seriesLanguage,
    seriesGenre,
  ]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (section !== "all") params.set("section", section);
    if (viewMode !== "grid") params.set("view", viewMode);
    if (movieSectionFilter !== "all") params.set("movieType", movieSectionFilter);
    if (movieSectionFilter === "bollywood" && bollywoodLanguage !== "all") {
      params.set("bollyLang", bollywoodLanguage);
    }
    if (movieGenre) params.set("movieGenre", movieGenre);
    if (seriesGenre) params.set("seriesGenre", seriesGenre);
    if (seriesOtt !== "all") params.set("ott", seriesOtt);
    if (seriesLanguage !== "all") params.set("lang", seriesLanguage);
    setSearchParams(params, { replace: true });
  }, [
    section,
    viewMode,
    movieSectionFilter,
    bollywoodLanguage,
    movieGenre,
    seriesGenre,
    seriesOtt,
    seriesLanguage,
    setSearchParams,
  ]);

  useEffect(() => {
    if (viewMode !== "grid") return;
    const node = loadMoreRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, filteredUpcoming.length, viewMode]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    const node = calendarLoadMoreRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "500px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, filteredUpcoming.length, viewMode]);

  const releaseDateKeys = useMemo(() => {
    const keys = new Set<string>();
    filteredUpcoming.forEach((item) => {
      const dateKey = getReleaseDate(item);
      if (dateKey) keys.add(dateKey);
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [filteredUpcoming]);

  const releaseDateKeySet = useMemo(() => new Set(releaseDateKeys), [releaseDateKeys]);

  const releasesByDate = useMemo(() => {
    const map = new Map<string, (Movie | TVShow)[]>();
    filteredUpcoming.forEach((item) => {
      const dateKey = getReleaseDate(item);
      if (!dateKey) return;

      const existing = map.get(dateKey);
      if (existing) {
        existing.push(item);
      } else {
        map.set(dateKey, [item]);
      }
    });
    return map;
  }, [filteredUpcoming]);

  const releaseCalendarDates = useMemo(
    () =>
      releaseDateKeys
        .map((key) => parseDateKey(key))
        .filter((value): value is Date => value !== null),
    [releaseDateKeys],
  );

  useEffect(() => {
    if (!releaseDateKeys.length) {
      setSelectedCalendarDate(undefined);
      return;
    }

    setSelectedCalendarDate((current) => {
      if (current && releaseDateKeySet.has(formatLocalDate(current))) {
        return current;
      }
      return parseDateKey(releaseDateKeys[0]) || current;
    });
  }, [releaseDateKeys, releaseDateKeySet]);

  useEffect(() => {
    if (!selectedCalendarDate) return;
    setCalendarMonth(getMonthStart(selectedCalendarDate));
  }, [selectedCalendarDate]);

  const selectedCalendarDateKey = selectedCalendarDate
    ? formatLocalDate(selectedCalendarDate)
    : "";

  const selectedCalendarItems = useMemo(() => {
    if (!selectedCalendarDateKey) return [];
    return releasesByDate.get(selectedCalendarDateKey) || [];
  }, [releasesByDate, selectedCalendarDateKey]);

  const selectedCalendarMonthEndKey = formatLocalDate(getMonthEnd(calendarMonth));
  const maxLoadedDateKey = releaseDateKeys.length ? releaseDateKeys[releaseDateKeys.length - 1] : "";

  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (!hasNextPage || isLoading || isFetchingNextPage) return;

    if (!maxLoadedDateKey || maxLoadedDateKey < selectedCalendarMonthEndKey) {
      fetchNextPage();
    }
  }, [
    viewMode,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    maxLoadedDateKey,
    selectedCalendarMonthEndKey,
    fetchNextPage,
  ]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (!selectedCalendarDateKey || !maxLoadedDateKey) return;
    if (!hasNextPage || isLoading || isFetchingNextPage) return;

    if (selectedCalendarDateKey > maxLoadedDateKey) {
      fetchNextPage();
    }
  }, [
    viewMode,
    selectedCalendarDateKey,
    maxLoadedDateKey,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  const selectedCalendarDateLabel = selectedCalendarDate
    ? selectedCalendarDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Select a date";

  const handleItemClick = (item: Movie | TVShow) => {
    const isTV = isTVShow(item);
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/${isTV ? "tv" : "movie"}/${item.id}`, {
      state: { from: fromPath },
    });
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
          <div className="flex items-center gap-3 mb-2">
            <CalendarDays className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">Upcoming</h1>
          </div>
          <p className="text-muted-foreground mb-6">
            Explore upcoming movies and series by section-specific filters.
          </p>

          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-6">
            <div className="flex gap-2">
              {[
                { value: "all", label: "All" },
                { value: "movies", label: "Movies" },
                { value: "series", label: "Series" },
              ].map((entry) => (
                <Button
                  key={entry.value}
                  variant={section === entry.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSection(entry.value as UpcomingSection)}
                  className="whitespace-nowrap"
                >
                  {entry.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-6">
            <div className="flex gap-2">
              {[
                { value: "grid", label: "Grid View" },
                { value: "calendar", label: "Calendar View" },
              ].map((entry) => (
                <Button
                  key={entry.value}
                  variant={viewMode === entry.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode(entry.value as UpcomingViewMode)}
                  className="whitespace-nowrap"
                >
                  {entry.label}
                </Button>
              ))}
            </div>
          </div>

          {section === "movies" && (
            <div className="space-y-3 mb-6">
              <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
                <div className="flex gap-2">
                  {MOVIE_SECTION_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={movieSectionFilter === option.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMovieSectionFilter(option.value)}
                      className="whitespace-nowrap"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                {movieSectionFilter === "bollywood" && (
                  <Select value={bollywoodLanguage} onValueChange={setBollywoodLanguage}>
                    <SelectTrigger className="w-[170px] bg-card">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50">
                      {BOLLYWOOD_LANGUAGE_OPTIONS.map((language) => (
                        <SelectItem key={language.value} value={language.value}>
                          {language.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select
                  value={movieGenre}
                  onValueChange={(value) => setMovieGenre(value === "all" ? "" : value)}
                >
                  <SelectTrigger className="w-[170px] bg-card">
                    <SelectValue placeholder="Movie Genre" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border z-50">
                    <SelectItem value="all">All Genres</SelectItem>
                    {movieGenres?.map((genre: Genre) => (
                      <SelectItem key={genre.id} value={String(genre.id)}>
                        {genre.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {section === "series" && (
            <div className="flex gap-3 flex-wrap mb-6">
              <Select value={seriesOtt} onValueChange={setSeriesOtt}>
                <SelectTrigger className="w-[170px] bg-card">
                  <SelectValue placeholder="OTT Platform" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  {OTT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={seriesLanguage} onValueChange={setSeriesLanguage}>
                <SelectTrigger className="w-[170px] bg-card">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={seriesGenre}
                onValueChange={(value) => setSeriesGenre(value === "all" ? "" : value)}
              >
                <SelectTrigger className="w-[170px] bg-card">
                  <SelectValue placeholder="Series Genre" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="all">All Genres</SelectItem>
                  {tvGenres?.map((genre: Genre) => (
                    <SelectItem key={genre.id} value={String(genre.id)}>
                      {genre.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                  <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                </div>
              ))}
            </div>
          ) : viewMode === "calendar" ? (
            <div className="grid grid-cols-1 lg:grid-cols-[340px,1fr] gap-6">
              <Card className="h-fit">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Release Calendar</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Calendar
                    mode="single"
                    selected={selectedCalendarDate}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    onSelect={(date) => {
                      if (date) setSelectedCalendarDate(date);
                    }}
                    modifiers={{ release: releaseCalendarDates }}
                    modifiersClassNames={{
                      release: "bg-primary/15 text-primary font-semibold rounded-md",
                    }}
                    className="rounded-md border bg-card"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Highlighted dates have upcoming releases.
                  </p>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-xl font-semibold mb-4">{selectedCalendarDateLabel}</h3>
                {selectedCalendarItems.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                    {selectedCalendarItems.map((item) => (
                      <PosterCard
                        key={`${item.id}-${isTVShow(item) ? "tv" : "movie"}-calendar`}
                        item={item}
                        onClick={() => handleItemClick(item)}
                      />
                    ))}
                  </div>
                ) : isFetchingNextPage ? (
                  <div className="text-center py-12 border rounded-lg bg-card/40">
                    <div className="mx-auto w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground mt-3">Loading more releases...</p>
                  </div>
                ) : (
                  <div className="text-center py-12 border rounded-lg bg-card/40">
                    <p className="text-muted-foreground">
                      No releases found for this date.
                    </p>
                  </div>
                )}

                {hasNextPage && (
                  <div className="flex justify-center mt-6">
                    <Button
                      variant="outline"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? "Loading..." : "Load More Dates"}
                    </Button>
                  </div>
                )}

                <div ref={calendarLoadMoreRef} className="h-10 w-full" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredUpcoming.map((item) => (
                  <PosterCard
                    key={`${item.id}-${isTVShow(item) ? "tv" : "movie"}`}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>

              {filteredUpcoming.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No upcoming content found for the selected filters.</p>
                </div>
              )}

              <div ref={loadMoreRef} className="h-12 w-full" />

              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!hasNextPage && filteredUpcoming.length > 0 && (
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
