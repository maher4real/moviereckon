import { useEffect, useState, useMemo, memo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserData } from "@/hooks/useUserData";
import { useRecommendations } from "@/hooks/useRecommendations";
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
} from "@/lib/tmdb";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import HeroBanner from "@/components/HeroBanner";
import ContentCarousel from "@/components/ContentCarousel";
import Footer from "@/components/Footer";
import { AppPageSkeleton } from "@/components/AppSkeletons";
import { Sparkles } from "lucide-react";
import { announceHomeHeroReady } from "@/lib/startupSound";

// Memoized carousel for performance
const MemoizedCarousel = memo(ContentCarousel);
const HOME_UPCOMING_PAGES = [1, 2, 3] as const;
const HOME_UPCOMING_TV_PAGES = [1, 2] as const;
const isAnimeLike = (item: Movie | TVShow) =>
  item.original_language === "ja" && item.genre_ids?.includes(16);

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function Home() {
  const { user, isLoading: authLoading, profile } = useAuth();
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
  const [isHeroVisualReady, setIsHeroVisualReady] = useState(false);
  const hasAnnouncedHeroReadyRef = useRef(false);

  // Redirect to auth if no user
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    hasAnnouncedHeroReadyRef.current = false;
    setLoadSecondaryShelves(false);
    setIsHeroVisualReady(false);
  }, [user]);

  useEffect(() => {
    if (!user || loadSecondaryShelves) return;
    // Start loading secondary shelves immediately while hero loads
    const timer = window.setTimeout(() => setLoadSecondaryShelves(true), 50);
    return () => window.clearTimeout(timer);
  }, [user, loadSecondaryShelves]);

  // Fetch all data with optimized query config
  const queryConfig = useMemo(
    () => ({
      staleTime: 1000 * 60 * 10, // 10 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
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
    enabled: loadSecondaryShelves,
  });

  const { data: tamilData, isLoading: tamilLoading } = useQuery({
    queryKey: ["tamil-movies"],
    queryFn: () => getTamilMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: teluguData, isLoading: teluguLoading } = useQuery({
    queryKey: ["telugu-movies"],
    queryFn: () => getTeluguMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
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

  const { data: upcomingMovies, isLoading: upcomingLoading } = useQuery({
    queryKey: ["upcoming-movies-home"],
    queryFn: async () => {
      const responses = await Promise.all(
        HOME_UPCOMING_PAGES.map((page) => getUpcomingMovies(page).catch(() => null)),
      );

      const deduped = new Map<number, Movie>();
      responses.forEach((response) => {
        response?.results?.forEach((movie) => {
          if (!deduped.has(movie.id)) {
            deduped.set(movie.id, movie);
          }
        });
      });

      return Array.from(deduped.values()).sort((a, b) =>
        (a.release_date || "9999-12-31").localeCompare(
          b.release_date || "9999-12-31",
        ),
      );
    },
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: upcomingTVShows, isLoading: upcomingTVLoading } = useQuery({
    queryKey: ["upcoming-tv-home"],
    queryFn: async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);

      const responses = await Promise.all(
        HOME_UPCOMING_TV_PAGES.map((page) =>
          getUpcomingTVShows(page, tomorrowStr).catch(() => null),
        ),
      );

      const deduped = new Map<number, TVShow>();
      responses.forEach((response) => {
        response?.results?.forEach((show) => {
          if (!deduped.has(show.id)) {
            deduped.set(show.id, show);
          }
        });
      });

      return Array.from(deduped.values()).sort((a, b) =>
        (a.first_air_date || "9999-12-31").localeCompare(
          b.first_air_date || "9999-12-31",
        ),
      );
    },
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

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

  if (authLoading) {
    return <AppPageSkeleton cardCount={10} showFilterRow={false} />;
  }

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
        <div className="space-y-8">
          {/* Reckon - Personalized Recommendations */}
          {reckonItems.length > 0 && (
            <section className="px-4 md:px-8 py-6 bg-gradient-to-b from-card/50 to-transparent rounded-xl mx-2 md:mx-4 border border-border/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-primary" />
                  <h2 className="text-xl md:text-2xl font-bold">
                    {isPersonalized ? "Reckon For You" : "Reckon - Top Picks"}
                  </h2>
                  {isPersonalized && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                      Personalized
                    </span>
                  )}
                </div>
              </div>
              <MemoizedCarousel
                title=""
                items={reckonItems as (Movie | TVShow)[]}
                isLoading={reckonLoading}
                type="mixed"
                viewAllHref="/reckon"
                recommendationExplanations={explanationById}
              />
            </section>
          )}

          {/* Now Playing - Only movies released today or earlier */}
          {(secondaryShelvesPending || filteredNowPlaying.length > 0 || nowPlayingLoading) && (
            <MemoizedCarousel
              title="🎬 Now Playing in Theaters"
              items={filteredNowPlaying as (Movie | TVShow)[]}
              isLoading={secondaryShelvesPending || nowPlayingLoading}
              type="movie"
              viewAllHref="/movies?category=now_playing"
            />
          )}

          {/* Upcoming - Only movies releasing tomorrow or later */}
          {(secondaryShelvesPending || filteredUpcoming.length > 0 || upcomingLoading || upcomingTVLoading) && (
            <MemoizedCarousel
              title="🗓️ Upcoming"
              items={filteredUpcoming as (Movie | TVShow)[]}
              isLoading={secondaryShelvesPending || upcomingLoading || upcomingTVLoading}
              type="mixed"
              viewAllHref="/upcoming"
            />
          )}

          {/* Trending Now */}
          <MemoizedCarousel
            title="🔥 Trending Now"
            items={filteredTrendingMovies as (Movie | TVShow)[]}
            isLoading={trendingLoading}
            type="movie"
            viewAllHref="/movies?category=trending"
          />

          {/* Recently Watched (if any) */}
          {recentlyWatched.length > 0 && (
            <MemoizedCarousel
              title="⏪ Continue Watching"
              items={recentlyWatched as (Movie | TVShow)[]}
              isLoading={false}
              type="mixed"
              viewAllHref="/profile"
            />
          )}

          {/* Bollywood Hits */}
          <MemoizedCarousel
            title="🇮🇳 Bollywood Hits"
            items={bollywoodData?.results as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || bollywoodLoading}
            type="movie"
            viewAllHref="/movies?category=bollywood"
          />

          {/* Hollywood Blockbusters */}
          <MemoizedCarousel
            title="🎬 Hollywood Blockbusters"
            items={hollywoodData?.results as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || hollywoodLoading}
            type="movie"
            viewAllHref="/movies?category=hollywood"
          />

          {/* Tamil Cinema */}
          {tamilData?.results && tamilData.results.length > 0 && (
            <MemoizedCarousel
              title="🎭 Tamil Cinema"
              items={tamilData.results as (Movie | TVShow)[]}
              isLoading={tamilLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=ta"
            />
          )}

          {/* Telugu Cinema */}
          {teluguData?.results && teluguData.results.length > 0 && (
            <MemoizedCarousel
              title="🌟 Telugu Cinema"
              items={teluguData.results as (Movie | TVShow)[]}
              isLoading={teluguLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=te"
            />
          )}

          {/* Gujarati Cinema */}
          {gujaratiData?.results && gujaratiData.results.length > 0 && (
            <MemoizedCarousel
              title="🎪 Gujarati Cinema"
              items={gujaratiData.results as (Movie | TVShow)[]}
              isLoading={gujaratiLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=gu"
            />
          )}

          {/* Trending TV Series */}
          <MemoizedCarousel
            title="📺 Trending TV Series"
            items={filteredTvShows as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || tvLoading}
            type="tv"
            viewAllHref="/series?category=popular"
          />

          {/* Top Rated */}
          <MemoizedCarousel
            title="⭐ Top Rated"
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
