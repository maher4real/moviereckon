import { useEffect, useState, useMemo, memo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { useRecommendations } from "@/frontend/hooks/useRecommendations";
import { useNavigate } from "react-router-dom";
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
import BottomNav from "@/frontend/components/BottomNav";
import HeroBanner from "@/frontend/components/HeroBanner";
import ContentCarousel from "@/frontend/components/ContentCarousel";
import Footer from "@/frontend/components/Footer";
import {
  Sparkles,
  TrendingUp,
  Star,
  Film,
  Tv,
  CalendarDays,
  History,
  Clapperboard,
  Award,
  Globe,
} from "lucide-react";
import { announceHomeHeroReady } from "@/frontend/lib/startupSound";
import { cn, formatLocalDate, isAnimeLike } from "@/shared/lib/utils";

// Memoized carousel for performance
const MemoizedCarousel = memo(ContentCarousel);
const HOME_UPCOMING_PAGES = [1, 2, 3] as const;
const HOME_UPCOMING_TV_PAGES = [1, 2] as const;
const HOME_UPCOMING_TIMEOUT_MS = 8000;

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
  const { watchHistory, isLoading: dataLoading } = useUserData();
  const {
    items: reckonItems,
    isLoading: reckonLoading,
    isPersonalized,
    explanationById,
  } = useRecommendations();
  const navigate = useNavigate();
  const [heroIndex, setHeroIndex] = useState(0);
  const [loadSecondaryShelves, setLoadSecondaryShelves] = useState(false);
  const [loadTertiaryShelves, setLoadTertiaryShelves] = useState(false);
  const [isHeroVisualReady, setIsHeroVisualReady] = useState(false);
  const hasAnnouncedHeroReadyRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    hasAnnouncedHeroReadyRef.current = false;
    setLoadSecondaryShelves(false);
    setLoadTertiaryShelves(false);
    setIsHeroVisualReady(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const t1 = window.setTimeout(() => setLoadSecondaryShelves(true), 200);
    const t2 = window.setTimeout(() => setLoadTertiaryShelves(true), 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [user]);

  // Fetch all data with optimized query config
  const queryConfig = useMemo(
    () => ({
      staleTime: 1000 * 60 * 10, // 10 minutes
      gcTime: 1000 * 60 * 60,    // 60 minutes
    }),
    [],
  );

  const { data: trendingMovies, isLoading: trendingLoading } = useQuery({
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
    () => filteredTrendingMovies.slice(0, 5),
    [filteredTrendingMovies],
  );
  const currentHeroMovie = heroMovies[heroIndex];

  // Auto-rotate hero banner
  useEffect(() => {
    if (heroMovies.length === 0) {
      setHeroIndex(0);
      return;
    }

    setHeroIndex((prev) => (prev >= heroMovies.length ? 0 : prev));

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroMovies.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [heroMovies.length]);

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
  }, []);

  const handleHeroBackdropReady = useCallback(() => {
    setIsHeroVisualReady(true);
    if (hasAnnouncedHeroReadyRef.current) return;
    hasAnnouncedHeroReadyRef.current = true;
    announceHomeHeroReady();
  }, []);

  const secondaryShelvesPending = !loadSecondaryShelves;
  const tertiaryShelvesPending = !loadTertiaryShelves;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />

      {/* Hero Banner */}
      <HeroBanner
        movie={currentHeroMovie}
        isLoading={trendingLoading}
        currentIndex={heroIndex}
        totalSlides={heroMovies.length}
        onDotClick={handleDotClick}
        onBackdropReady={handleHeroBackdropReady}
      />

      {/* Content Sections */}
      <main className="relative z-10 -mt-20 md:-mt-24 pt-6 md:pt-8 pb-20">
        <div className="space-y-10">

          {/* Reckon - Personalized Recommendations */}
          {reckonItems.length > 0 && (
            <section className="mx-2 md:mx-4 rounded-2xl border border-primary/20 bg-linear-to-b from-primary/6 via-card/40 to-transparent overflow-hidden">
              <div className="px-4 md:px-6 pt-5 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-lg bg-primary/20 blur-sm" />
                    <div className="relative p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                  <h2 className="text-lg md:text-xl font-bold tracking-tight">
                    {isPersonalized ? "Reckon For You" : "Top Picks"}
                  </h2>
                  {isPersonalized && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary text-[10px] font-semibold">
                      Personalized
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/reckon")}
                  className={cn(
                    "flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors duration-200 cursor-pointer"
                  )}
                >
                  View All
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <MemoizedCarousel
                title=""
                items={reckonItems as (Movie | TVShow)[]}
                isLoading={reckonLoading}
                type="mixed"
                viewAllHref="/reckon"
                showViewAllCard={false}
                priorityImages={!currentHeroMovie}
                recommendationExplanations={explanationById}
              />
            </section>
          )}

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

          {/* Trending Now */}
          <MemoizedCarousel
            title="Trending Now"
            icon={TrendingUp}
            items={filteredTrendingMovies as (Movie | TVShow)[]}
            isLoading={trendingLoading}
            type="movie"
            viewAllHref="/movies?category=trending"
            priorityImages={!currentHeroMovie && reckonItems.length === 0}
          />

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

          {/* Trending TV Series */}
          <MemoizedCarousel
            title="Trending TV Series"
            icon={Tv}
            items={filteredTvShows as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || tvLoading}
            type="tv"
            viewAllHref="/series?category=popular"
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

        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
