import { useEffect, useState, useMemo, memo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { useRecommendations } from "@/frontend/hooks/useRecommendations";
import {
  getTrendingMovies,
  getBollywoodMovies,
  getHollywoodMovies,
  getGujaratiMovies,
  getTamilMovies,
  getTeluguMovies,
  getPopularTVShows,
  getTopRatedMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getUpcomingTVShows,
  Movie,
  TVShow,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import HeroBanner from "@/frontend/components/HeroBanner";
import ContentCarousel from "@/frontend/components/ContentCarousel";
import Footer from "@/frontend/components/Footer";
import GenreRail from "@/frontend/components/GenreRail";
import TodaysPicksDialog from "@/frontend/components/TodaysPicksDialog";
import { useTodaysPicksGate } from "@/frontend/hooks/useTodaysPicksGate";
import { useWatchlist } from "@/frontend/hooks/useWatchlist";
import { buildPickPool } from "./todaysPicksSource";
import {
  TrendingUp,
  Film,
  Tv,
  CalendarDays,
  History,
  Clapperboard,
  Award,
  Globe,
} from "lucide-react";
import { announceHomeHeroReady } from "@/frontend/lib/startupSound";
import { formatLocalDate, isAnimeLike } from "@/shared/lib/utils";
import { TMDB_FALLBACK_POSTERS } from "@/shared/lib/tmdbFallbacks";

// Memoized carousel for performance
const MemoizedCarousel = memo(ContentCarousel);
const HOME_UPCOMING_PAGES = [1, 2, 3] as const;
const HOME_UPCOMING_TV_PAGES = [1, 2] as const;
const HOME_UPCOMING_TIMEOUT_MS = 8000;

const HOME_FALLBACK_MOVIES: Movie[] = TMDB_FALLBACK_POSTERS.map((poster, index) => ({
  id: -(index + 1),
  title: poster.title,
  original_title: poster.title,
  overview: "",
  poster_path: poster.path,
  backdrop_path: null,
  release_date: "",
  vote_average: 0,
  vote_count: 0,
  popularity: 0,
  genre_ids: [],
  original_language: "en",
  adult: false,
  video: false,
}));

type HomeUpcomingData = {
  movies: Movie[];
  tvShows: TVShow[];
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export default function Home() {
  const { user, profile } = useAuth();
  const { watchHistory } = useUserData();
  const {
    items: reckonItems,
    isLoading: reckonLoading,
    isPersonalized,
    explanationById,
  } = useRecommendations();
  const { items: watchlistItems } = useWatchlist();
  const { allowed: picksAllowed, markShown: markPicksShown, skipToday: skipPicksToday } = useTodaysPicksGate(user?.id);
  const [picksOpen, setPicksOpen] = useState(false);
  const [picksWaitedLongEnough, setPicksWaitedLongEnough] = useState(false);
  const shouldReduceHomeMotion = useReducedMotion();
  const reduceHomeMotion = Boolean(shouldReduceHomeMotion);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loadSecondaryShelves, setLoadSecondaryShelves] = useState(false);
  const [loadTertiaryShelves, setLoadTertiaryShelves] = useState(false);
  const [isHeroPlaying, setIsHeroPlaying] = useState(true);
  const [isHeroInteracting, setIsHeroInteracting] = useState(false);
  const hasAnnouncedHeroReadyRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    hasAnnouncedHeroReadyRef.current = false;
    setLoadSecondaryShelves(false);
    setLoadTertiaryShelves(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const t1 = window.setTimeout(() => setLoadSecondaryShelves(true), 200);
    return () => window.clearTimeout(t1);
  }, [user]);

  // Below-the-fold shelves fetch only when the reader scrolls near them.
  const tertiarySentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!user || loadTertiaryShelves) return;
    const node = tertiarySentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setLoadTertiaryShelves(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLoadTertiaryShelves(true);
    }, { rootMargin: "900px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [user, loadTertiaryShelves, loadSecondaryShelves]);

  // Fetch all data with optimized query config
  const queryConfig = useMemo(
    () => ({
      staleTime: 1000 * 60 * 10, // 10 minutes
      gcTime: 1000 * 60 * 60,    // 60 minutes
    }),
    [],
  );

  const { data: trendingMovies } = useQuery({
    queryKey: ["trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    ...queryConfig,
  });

  const { data: bollywoodData, isLoading: bollywoodLoading } = useQuery({
    queryKey: ["bollywood-movies"],
    queryFn: () => getBollywoodMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: hollywoodData, isLoading: hollywoodLoading } = useQuery({
    queryKey: ["hollywood-movies"],
    queryFn: () => getHollywoodMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: gujaratiData, isLoading: gujaratiLoading } = useQuery({
    queryKey: ["gujarati-movies"],
    queryFn: () => getGujaratiMovies(),
    ...queryConfig,
    enabled: loadTertiaryShelves,
  });

  const { data: tamilData, isLoading: tamilLoading } = useQuery({
    queryKey: ["tamil-movies"],
    queryFn: () => getTamilMovies(),
    ...queryConfig,
    enabled: loadTertiaryShelves,
  });

  const { data: teluguData, isLoading: teluguLoading } = useQuery({
    queryKey: ["telugu-movies"],
    queryFn: () => getTeluguMovies(),
    ...queryConfig,
    enabled: loadTertiaryShelves,
  });

  const { data: tvShowsData, isLoading: tvLoading } = useQuery({
    queryKey: ["popular-tv"],
    queryFn: () => getPopularTVShows(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: topRatedData, isLoading: topRatedLoading } = useQuery({
    queryKey: ["top-rated-movies"],
    queryFn: () => getTopRatedMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: nowPlayingData, isLoading: nowPlayingLoading } = useQuery({
    queryKey: ["now-playing-movies"],
    queryFn: () => getNowPlayingMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: upcomingHomeData, isLoading: upcomingLoading } = useQuery({
    queryKey: ["upcoming-home"],
    queryFn: async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);

      const [movieResponses, tvResponses] = await Promise.all([
        Promise.allSettled(
          HOME_UPCOMING_PAGES.map((page) =>
            withTimeout(getUpcomingMovies(page), HOME_UPCOMING_TIMEOUT_MS),
          ),
        ),
        Promise.allSettled(
          HOME_UPCOMING_TV_PAGES.map((page) =>
            withTimeout(
              getUpcomingTVShows(page, tomorrowStr),
              HOME_UPCOMING_TIMEOUT_MS,
            ),
          ),
        ),
      ]);

      const dedupedMovies = new Map<number, Movie>();
      movieResponses.forEach((response) => {
        if (response.status !== "fulfilled") return;
        response.value.results?.forEach((movie) => {
          if (!dedupedMovies.has(movie.id)) {
            dedupedMovies.set(movie.id, movie);
          }
        });
      });

      const dedupedTVShows = new Map<number, TVShow>();
      tvResponses.forEach((response) => {
        if (response.status !== "fulfilled") return;
        response.value.results?.forEach((show) => {
          if (!dedupedTVShows.has(show.id)) {
            dedupedTVShows.set(show.id, show);
          }
        });
      });

      return {
        movies: Array.from(dedupedMovies.values()).sort((a, b) =>
          (a.release_date || "9999-12-31").localeCompare(
            b.release_date || "9999-12-31",
          ),
        ),
        tvShows: Array.from(dedupedTVShows.values()).sort((a, b) =>
          (a.first_air_date || "9999-12-31").localeCompare(
            b.first_air_date || "9999-12-31",
          ),
        ),
      } satisfies HomeUpcomingData;
    },
    ...queryConfig,
    enabled: loadTertiaryShelves,
    retry: false,
  });

  const upcomingMovies = upcomingHomeData?.movies;
  const upcomingTVShows = upcomingHomeData?.tvShows;

  // Filter Now Playing to only show movies released today or earlier
  const filteredNowPlaying = useMemo(() => {
    if (!nowPlayingData?.results) return [];
    const today = formatLocalDate(new Date());
    return nowPlayingData.results.filter(
      (movie) => movie.release_date <= today && !isAnimeLike(movie),
    );
  }, [nowPlayingData]);

  // Upcoming section should only include releases within the next two months.
  const filteredUpcoming = useMemo(() => {
    if (!upcomingMovies?.length && !upcomingTVShows?.length) return [];

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const twoMonthsAhead = new Date(today);
    twoMonthsAhead.setMonth(twoMonthsAhead.getMonth() + 2);
    const tomorrowStr = formatLocalDate(tomorrow);
    const twoMonthsAheadStr = formatLocalDate(twoMonthsAhead);
    const dedupe = new Set<string>();

    const upcomingMoviesOnly = (upcomingMovies || [])
      .filter(
        (movie) =>
          Boolean(movie.release_date) &&
          movie.release_date >= tomorrowStr &&
          movie.release_date <= twoMonthsAheadStr,
      )
      .filter((movie) => !isAnimeLike(movie));

    const upcomingSeriesOnly = (upcomingTVShows || [])
      .filter(
        (show) =>
          Boolean(show.first_air_date) &&
          show.first_air_date >= tomorrowStr &&
          show.first_air_date <= twoMonthsAheadStr,
      )
      .filter((show) => !isAnimeLike(show));

    const combined = [...upcomingMoviesOnly, ...upcomingSeriesOnly]
      .filter((item) => {
        const isTV = "first_air_date" in item;
        const key = `${isTV ? "tv" : "movie"}:${item.id}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      })
      .sort((a, b) => {
        const dateA = "release_date" in a ? a.release_date : a.first_air_date;
        const dateB = "release_date" in b ? b.release_date : b.first_air_date;
        return (dateA || "9999-12-31").localeCompare(dateB || "9999-12-31");
      });

    return combined;
  }, [upcomingMovies, upcomingTVShows]);

  const filteredTrendingMovies = useMemo(
    () => (trendingMovies || []).filter((movie) => !isAnimeLike(movie)),
    [trendingMovies],
  );

  const filteredTopRatedMovies = useMemo(
    () => (topRatedData?.results || []).filter((movie) => !isAnimeLike(movie)),
    [topRatedData],
  );

  const filteredTvShows = useMemo(
    () => (tvShowsData?.results || []).filter((show) => !isAnimeLike(show)),
    [tvShowsData],
  );

  // Hero movies (top 5 trending)
  const heroMovies = useMemo(
    () => (filteredTrendingMovies.length > 0 ? filteredTrendingMovies : HOME_FALLBACK_MOVIES).slice(0, 5),
    [filteredTrendingMovies],
  );
  const currentHeroMovie = heroMovies[heroIndex % heroMovies.length];
  const trendingShelfItems = filteredTrendingMovies.length > 0
    ? filteredTrendingMovies
    : HOME_FALLBACK_MOVIES;

  // Auto-rotate hero banner
  useEffect(() => {
    if (heroMovies.length === 0) {
      setHeroIndex(0);
      return;
    }

    setHeroIndex((prev) => (prev >= heroMovies.length ? 0 : prev));

    if (reduceHomeMotion || !isHeroPlaying || isHeroInteracting) return;

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroMovies.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [heroMovies.length, reduceHomeMotion, isHeroPlaying, isHeroInteracting]);

  // Get recently watched for recommendations - memoized
  const recentlyWatched = useMemo(() => {
    return watchHistory.slice(0, 10).map((item) => {
      const isTV = item.content_type === "tv";
      return {
        id: item.content_id,
        title: item.title,
        name: item.title,
        poster_path: item.poster_path,
        backdrop_path: null,
        overview: "",
        vote_average: 0,
        vote_count: 0,
        popularity: 0,
        genre_ids: item.genres,
        original_language: item.language,
        release_date: "",
        first_air_date: isTV ? "2024-01-01" : "", // Mark TV shows properly for type detection
        adult: false,
        video: false,
        original_title: item.title,
        original_name: item.title,
        origin_country: [],
        _content_type: item.content_type, // Preserve content type for routing
      };
    });
  }, [watchHistory]);

  const handleDotClick = useCallback((index: number) => {
    setHeroIndex(index);
    setIsHeroPlaying(false);
  }, []);

  const handleHeroBackdropReady = useCallback(() => {
    if (hasAnnouncedHeroReadyRef.current) return;
    hasAnnouncedHeroReadyRef.current = true;
    announceHomeHeroReady();
  }, []);

  // "What to watch today": opens once per login session, after the data it needs has settled.
  const pickCandidates = useMemo(
    () => buildPickPool({
      feed: reckonItems as (Movie | TVShow)[],
      explanations: explanationById,
      watchlist: watchlistItems,
      trending: filteredTrendingMovies,
      popularTv: filteredTvShows,
      topRated: filteredTopRatedMovies,
    }),
    [reckonItems, explanationById, watchlistItems, filteredTrendingMovies, filteredTvShows, filteredTopRatedMovies],
  );
  const watchedKeys = useMemo(
    () => new Set(watchHistory.map((entry) => `${entry.content_type}_${entry.content_id}`)),
    [watchHistory],
  );
  const firstName = (profile?.username || user?.username || "").trim().split(/\s+/)[0] || undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => setPicksWaitedLongEnough(true), 3500);
    return () => window.clearTimeout(timer);
  }, []);

  const picksReady = !reckonLoading && (Boolean(tvShowsData) || picksWaitedLongEnough) && pickCandidates.length >= 4;
  useEffect(() => {
    if (!picksAllowed || !picksReady || picksOpen) return;
    const timer = window.setTimeout(() => {
      setPicksOpen(true);
      markPicksShown();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [picksAllowed, picksReady, picksOpen, markPicksShown]);

  const secondaryShelvesPending = !loadSecondaryShelves;
  const tertiaryShelvesPending = !loadTertiaryShelves;

  return (
    <div className="app-page relative overflow-x-hidden pb-20 md:pb-0">

          <Header />

          {/* Hero Banner */}
          <HeroBanner
            movie={currentHeroMovie}
            isLoading={false}
            currentIndex={heroIndex}
            totalSlides={heroMovies.length}
            onDotClick={handleDotClick}
            onStep={setHeroIndex}
            onBackdropReady={handleHeroBackdropReady}
            isPlaying={isHeroPlaying && !reduceHomeMotion}
            onTogglePlayback={reduceHomeMotion ? undefined : () => setIsHeroPlaying(playing => !playing)}
            onInteractionChange={setIsHeroInteracting}
          />

          {/* Content Sections */}
          <main id="main-content" className="home-collections">
            <div className="space-y-10 md:space-y-12">
              {reckonItems.length > 0 && (
                <MemoizedCarousel
                  title={isPersonalized ? "Reckon For You" : "Top Picks"}
                  items={reckonItems as (Movie | TVShow)[]}
                  isLoading={reckonLoading}
                  type="mixed"
                  viewAllHref="/reckon"
                  showViewAllCard={false}
                  priorityImages
                  recommendationExplanations={explanationById}
                />
              )}

          {/* Continue Watching */}
          {recentlyWatched.length > 0 && (
            <MemoizedCarousel
              title="Continue Watching"
              icon={History}
              items={recentlyWatched as (Movie | TVShow)[]}
              isLoading={false}
              type="mixed"
              viewAllHref="/profile"
            />
          )}

          {/* Trending Now */}
          <MemoizedCarousel
            title="Trending Now"
            icon={TrendingUp}
            items={trendingShelfItems as (Movie | TVShow)[]}
            isLoading={false}
            type="movie"
            viewAllHref="/movies?category=trending"
            priorityImages={reckonItems.length === 0}
          />

          {/* Now Playing */}
          {(secondaryShelvesPending || filteredNowPlaying.length > 0 || nowPlayingLoading) && (
            <MemoizedCarousel
              title="Now Playing"
              icon={Clapperboard}
              items={filteredNowPlaying as (Movie | TVShow)[]}
              isLoading={secondaryShelvesPending || nowPlayingLoading}
              type="movie"
              viewAllHref="/movies?category=now_playing"
            />
          )}

          {/* Trending TV Series */}
          <MemoizedCarousel
            title="Trending TV Series"
            icon={Tv}
            items={filteredTvShows as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || tvLoading}
            type="tv"
            viewAllHref="/series?category=popular"
          />

          {/* Bollywood Hits */}
          <MemoizedCarousel
            title="Bollywood Hits"
            icon={Film}
            items={bollywoodData?.results as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || bollywoodLoading}
            type="movie"
            viewAllHref="/movies?category=bollywood"
          />

          {/* Hollywood Blockbusters */}
          <MemoizedCarousel
            title="Hollywood Blockbusters"
            icon={Globe}
            items={hollywoodData?.results as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || hollywoodLoading}
            type="movie"
            viewAllHref="/movies?category=hollywood"
          />

          {/* Top Rated */}
          <MemoizedCarousel
            title="Top Rated"
            icon={Award}
            items={filteredTopRatedMovies as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || topRatedLoading}
            type="movie"
            viewAllHref="/movies?sort=vote_average.desc"
          />

          <div ref={tertiarySentinelRef} aria-hidden="true" />

          {/* Browse by genre */}
          <GenreRail enabled={loadTertiaryShelves} />

          {/* Upcoming */}
          {(tertiaryShelvesPending || filteredUpcoming.length > 0 || upcomingLoading) && (
            <MemoizedCarousel
              title="Upcoming"
              icon={CalendarDays}
              items={filteredUpcoming as (Movie | TVShow)[]}
              isLoading={tertiaryShelvesPending || upcomingLoading}
              type="mixed"
              viewAllHref="/upcoming"
            />
          )}

          {/* Tamil Cinema */}
          {tamilData?.results && tamilData.results.length > 0 && (
            <MemoizedCarousel
              title="Tamil Cinema"
              icon={Film}
              items={tamilData.results as (Movie | TVShow)[]}
              isLoading={tamilLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=ta"
            />
          )}

          {/* Telugu Cinema */}
          {teluguData?.results && teluguData.results.length > 0 && (
            <MemoizedCarousel
              title="Telugu Cinema"
              icon={Film}
              items={teluguData.results as (Movie | TVShow)[]}
              isLoading={teluguLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=te"
            />
          )}

          {/* Gujarati Cinema */}
          {gujaratiData?.results && gujaratiData.results.length > 0 && (
            <MemoizedCarousel
              title="Gujarati Cinema"
              icon={Film}
              items={gujaratiData.results as (Movie | TVShow)[]}
              isLoading={gujaratiLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=gu"
            />
          )}

            </div>
          </main>

          <TodaysPicksDialog
            open={picksOpen}
            onOpenChange={setPicksOpen}
            candidates={pickCandidates}
            excludeKeys={watchedKeys}
            personalized={isPersonalized}
            name={firstName}
            onSkipToday={skipPicksToday}
          />

          <Footer />
    </div>
  );
}
