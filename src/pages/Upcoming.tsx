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
import {
  AppPageSkeleton,
  PosterGridSkeleton,
  InlineLoadMoreSkeleton,
} from "@/components/AppSkeletons";
import MediaImage from "@/components/MediaImage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type UpcomingSection = "all" | "movies" | "series";
type MovieSectionFilter = "all" | "bollywood" | "hollywood";

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
const BOLLYWOOD_LANGUAGE_LIST = ["hi", "gu", "ta", "te", "kn"] as const;
const BOLLYWOOD_LANGUAGE_CODES = new Set<string>(BOLLYWOOD_LANGUAGE_LIST);

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

const parseDateKey = (value: string): Date | null => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatDateHeading = (date: Date) =>
  date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });

const getRelativeReleaseLabel = (date: Date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays === -1) return "Yesterday";
  return `${Math.abs(diffDays)} days ago`;
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
  const calendarLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const dateSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [section, setSection] = useState<UpcomingSection>(
    (searchParams.get("section") as UpcomingSection) || "all",
  );
  const [movieSectionFilter, setMovieSectionFilter] = useState<MovieSectionFilter>(
    (searchParams.get("movieType") as MovieSectionFilter) || "all",
  );
  const [bollywoodLanguage, setBollywoodLanguage] = useState<string>(searchParams.get("bollyLang") || "all");
  const [movieGenre, setMovieGenre] = useState<string>(searchParams.get("movieGenre") || "");
  const [seriesGenre, setSeriesGenre] = useState<string>(searchParams.get("seriesGenre") || "");
  const [seriesOtt, setSeriesOtt] = useState<string>(searchParams.get("ott") || "all");
  const [seriesLanguage, setSeriesLanguage] = useState<string>(searchParams.get("lang") || "all");
  const [calendarGroupLimit, setCalendarGroupLimit] = useState(8);
  const [selectedDateKey, setSelectedDateKey] = useState<string>("");

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
        const baseFilters: DiscoverFilters = {
          page,
          sort_by: "primary_release_date.asc",
          with_genres: movieGenre || undefined,
          "primary_release_date.gte": tomorrowStr,
        };

        if (movieSectionFilter === "bollywood" && bollywoodLanguage === "all") {
          const languageResponses = await Promise.allSettled(
            BOLLYWOOD_LANGUAGE_LIST.map((language) =>
              discoverMovies({
                ...baseFilters,
                with_original_language: language,
                region: "IN",
              }),
            ),
          );

          const successfulPages = languageResponses.flatMap((response) =>
            response.status === "fulfilled" ? [response.value] : [],
          );

          if (successfulPages.length === 0) {
            return { page, results: [], total_pages: 1, total_results: 0 };
          }

          const deduped = new Map<number, Movie>();
          successfulPages.forEach((data) => {
            (data.results || []).forEach((movie) => {
              if (!deduped.has(movie.id)) {
                deduped.set(movie.id, movie);
              }
            });
          });

          const mergedResults = Array.from(deduped.values()).sort((a, b) => {
            const dateCompare = (a.release_date || "9999-12-31").localeCompare(
              b.release_date || "9999-12-31",
            );
            if (dateCompare !== 0) return dateCompare;
            return (b.popularity || 0) - (a.popularity || 0);
          });

          return {
            page,
            results: mergedResults,
            total_pages: Math.max(...successfulPages.map((data) => data.total_pages || 1)),
            total_results: successfulPages.reduce(
              (total, data) => total + (data.total_results || 0),
              0,
            ),
          };
        }

        const filters: DiscoverFilters = { ...baseFilters };

        if (movieSectionFilter === "hollywood") {
          filters.with_original_language = "en";
          filters.region = "US";
        }

        if (movieSectionFilter === "bollywood") {
          filters.region = "IN";
          if (bollywoodLanguage !== "all") {
            filters.with_original_language = bollywoodLanguage;
          }
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
    movieSectionFilter,
    bollywoodLanguage,
    movieGenre,
    seriesGenre,
    seriesOtt,
    seriesLanguage,
    setSearchParams,
  ]);

  useEffect(() => {
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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, filteredUpcoming.length]);

  const releaseDateKeys = useMemo(() => {
    const keys = new Set<string>();
    filteredUpcoming.forEach((item) => {
      const dateKey = getReleaseDate(item);
      if (dateKey) keys.add(dateKey);
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [filteredUpcoming]);

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

  const allReleaseDateGroups = useMemo(
    () =>
      releaseDateKeys
        .map((dateKey) => {
          const date = parseDateKey(dateKey);
          if (!date) return null;
          return {
            dateKey,
            date,
            items: releasesByDate.get(dateKey) || [],
          };
        })
        .filter(
          (
            group,
          ): group is { dateKey: string; date: Date; items: (Movie | TVShow)[] } => group !== null,
        ),
    [releaseDateKeys, releasesByDate],
  );

  const activeReleaseDateGroups = allReleaseDateGroups;
  const visibleReleaseDateGroups = activeReleaseDateGroups.slice(0, calendarGroupLimit);
  const hasMoreReleaseDateGroups = activeReleaseDateGroups.length > calendarGroupLimit;
  const nextReleaseDateLabel = visibleReleaseDateGroups[0]
    ? visibleReleaseDateGroups[0].date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "No releases yet";
  const selectedReleaseDate = activeReleaseDateGroups.find((group) => group.dateKey === selectedDateKey);
  const selectedReleaseDateLabel = selectedReleaseDate
    ? selectedReleaseDate.date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : nextReleaseDateLabel;

  useEffect(() => {
    setCalendarGroupLimit(8);
  }, [
    section,
    movieSectionFilter,
    bollywoodLanguage,
    movieGenre,
    seriesGenre,
    seriesOtt,
    seriesLanguage,
  ]);

  useEffect(() => {
    if (!activeReleaseDateGroups.length) {
      setSelectedDateKey("");
      return;
    }

    setSelectedDateKey((current) => {
      if (current && activeReleaseDateGroups.some((group) => group.dateKey === current)) {
        return current;
      }
      return activeReleaseDateGroups[0]?.dateKey || "";
    });
  }, [activeReleaseDateGroups]);

  useEffect(() => {
    if (!selectedDateKey) return;
    const selectedIndex = activeReleaseDateGroups.findIndex((group) => group.dateKey === selectedDateKey);
    if (selectedIndex !== -1 && selectedIndex + 1 > calendarGroupLimit) {
      setCalendarGroupLimit(selectedIndex + 1);
    }
  }, [selectedDateKey, activeReleaseDateGroups, calendarGroupLimit]);

  useEffect(() => {
    if (!selectedDateKey) return;
    const node = dateSectionRefs.current[selectedDateKey];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDateKey, visibleReleaseDateGroups.length]);

  const handleItemClick = (item: Movie | TVShow) => {
    const isTV = isTVShow(item);
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/${isTV ? "tv" : "movie"}/${item.id}`, {
      state: { from: fromPath },
    });
  };

  if (authLoading) {
    return <AppPageSkeleton cardCount={18} />;
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
            <PosterGridSkeleton count={18} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/80 bg-card/45 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/90">
                  Date-wise Schedule
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{selectedReleaseDateLabel}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeReleaseDateGroups.length} release dates and {filteredUpcoming.length} titles loaded.
                </p>
              </div>

              {activeReleaseDateGroups.length > 0 && (
                <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                  <div className="flex w-max gap-2">
                    {activeReleaseDateGroups.map((group) => {
                      const isSelected = group.dateKey === selectedDateKey;
                      return (
                        <button
                          key={`date-chip-${group.dateKey}`}
                          type="button"
                          onClick={() => setSelectedDateKey(group.dateKey)}
                          className={cn(
                            "min-w-[92px] rounded-xl border px-3 py-2 text-left transition-colors",
                            isSelected
                              ? "border-primary bg-primary/12 text-primary"
                              : "border-border/80 bg-card/35 text-muted-foreground hover:border-primary/60 hover:text-foreground",
                          )}
                        >
                          <p className="text-[10px] uppercase tracking-wide">
                            {group.date.toLocaleDateString("en-US", { weekday: "short" })}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {group.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {visibleReleaseDateGroups.length > 0 ? (
                visibleReleaseDateGroups.map((group) => {
                  const isSelected = group.dateKey === selectedDateKey;
                  return (
                    <div
                      key={group.dateKey}
                      ref={(node) => {
                        dateSectionRefs.current[group.dateKey] = node;
                      }}
                    >
                      <Card
                        className={cn(
                          "border-border/70 bg-card/35",
                          isSelected && "border-primary/60 ring-1 ring-primary/25",
                        )}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">{formatDateHeading(group.date)}</CardTitle>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {getRelativeReleaseLabel(group.date)}
                              </p>
                            </div>
                            <span className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 text-xs font-medium text-foreground">
                              {group.items.length} {group.items.length === 1 ? "release" : "releases"}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
                            {group.items.map((item) => (
                              <PosterCard
                                key={`${item.id}-${isTVShow(item) ? "tv" : "movie"}-${group.dateKey}`}
                                item={item}
                                onClick={() => handleItemClick(item)}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })
              ) : isFetchingNextPage ? (
                <div className="text-center py-12 border rounded-lg bg-card/40">
                  <InlineLoadMoreSkeleton className="py-0 justify-center" />
                  <p className="text-sm text-muted-foreground mt-3">Loading release schedule...</p>
                </div>
              ) : (
                <div className="text-center py-12 border rounded-lg bg-card/40">
                  <p className="text-muted-foreground">No date-wise releases found yet.</p>
                </div>
              )}

              {hasMoreReleaseDateGroups && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setCalendarGroupLimit((current) => current + 8)}
                  >
                    Show More Dates
                  </Button>
                </div>
              )}

              {hasNextPage && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading..." : "Load More From API"}
                  </Button>
                </div>
              )}

              {isFetchingNextPage && (
                <InlineLoadMoreSkeleton />
              )}

              {!hasNextPage && filteredUpcoming.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  You are all caught up.
                </p>
              )}

              <div ref={calendarLoadMoreRef} className="h-10 w-full" />
            </div>
          )}
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
