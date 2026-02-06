import { useEffect, useState, useMemo, memo, useCallback } from "react";
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
  Movie,
  TVShow,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import HeroBanner from "@/components/HeroBanner";
import ContentCarousel from "@/components/ContentCarousel";
import Footer from "@/components/Footer";
import { Sparkles } from "lucide-react";

// Memoized carousel for performance
const MemoizedCarousel = memo(ContentCarousel);
const STARTUP_SOUND_SRC =
  "https://cdn.jsdelivr.net/gh/maher4real/moviereckon@main/startup.mp3";
const STARTUP_SOUND_PENDING_KEY = "startupSoundPending";
const STARTUP_SOUND_PLAYED_KEY = "startupSoundPlayed";
const isAnimeLike = (item: Movie | TVShow) =>
  item.original_language === "ja" && item.genre_ids?.includes(16);

export default function Home() {
  const { user, isLoading: authLoading, profile } = useAuth();
  const { watchHistory, isLoading: dataLoading } = useUserData();
  const { items: reckonItems, isLoading: reckonLoading, isPersonalized } = useRecommendations();
  const navigate = useNavigate();
  const [heroIndex, setHeroIndex] = useState(0);

  // Redirect to auth if no user
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Play startup sound after auth success, or on first authenticated app startup.
  useEffect(() => {
    if (authLoading || !user) return;

    const pendingStartupSound = (() => {
      try {
        return sessionStorage.getItem(STARTUP_SOUND_PENDING_KEY) === "1";
      } catch {
        return false;
      }
    })();

    const startupSoundAlreadyPlayed = (() => {
      try {
        return sessionStorage.getItem(STARTUP_SOUND_PLAYED_KEY) === "1";
      } catch {
        return false;
      }
    })();

    if (!pendingStartupSound && startupSoundAlreadyPlayed) return;

    const audio = new Audio(STARTUP_SOUND_SRC);
    audio.preload = "auto";
    let fallbackAttached = false;

    const markStartupSoundPlayed = () => {
      try {
        sessionStorage.setItem(STARTUP_SOUND_PLAYED_KEY, "1");
        sessionStorage.removeItem(STARTUP_SOUND_PENDING_KEY);
      } catch {
        // Ignore storage errors (private mode, strict browser settings).
      }
    };

    const cleanupFallbackListeners = () => {
      if (!fallbackAttached) return;
      window.removeEventListener("pointerdown", playOnInteraction);
      window.removeEventListener("keydown", playOnInteraction);
      fallbackAttached = false;
    };

    const playOnInteraction = () => {
      cleanupFallbackListeners();
      void audio.play().then(markStartupSoundPlayed).catch(() => undefined);
    };

    const attachFallbackListeners = () => {
      if (fallbackAttached) return;
      window.addEventListener("pointerdown", playOnInteraction, { once: true });
      window.addEventListener("keydown", playOnInteraction, { once: true });
      fallbackAttached = true;
    };

    void audio
      .play()
      .then(markStartupSoundPlayed)
      .catch(() => {
        attachFallbackListeners();
      });

    return () => {
      cleanupFallbackListeners();
      audio.pause();
      audio.src = "";
    };
  }, [authLoading, user]);

  // Fetch all data with optimized query config
  const queryConfig = useMemo(() => ({
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  }), []);

  const { data: trendingMovies, isLoading: trendingLoading } = useQuery({
    queryKey: ["trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    ...queryConfig,
  });

  const { data: bollywoodData, isLoading: bollywoodLoading } = useQuery({
    queryKey: ["bollywood-movies"],
    queryFn: () => getBollywoodMovies(),
    ...queryConfig,
  });

  const { data: hollywoodData, isLoading: hollywoodLoading } = useQuery({
    queryKey: ["hollywood-movies"],
    queryFn: () => getHollywoodMovies(),
    ...queryConfig,
  });

  const { data: gujaratiData, isLoading: gujaratiLoading } = useQuery({
    queryKey: ["gujarati-movies"],
    queryFn: () => getGujaratiMovies(),
    ...queryConfig,
  });

  const { data: tamilData, isLoading: tamilLoading } = useQuery({
    queryKey: ["tamil-movies"],
    queryFn: () => getTamilMovies(),
    ...queryConfig,
  });

  const { data: teluguData, isLoading: teluguLoading } = useQuery({
    queryKey: ["telugu-movies"],
    queryFn: () => getTeluguMovies(),
    ...queryConfig,
  });

  const { data: tvShowsData, isLoading: tvLoading } = useQuery({
    queryKey: ["popular-tv"],
    queryFn: () => getPopularTVShows(),
    ...queryConfig,
  });

  const { data: topRatedData, isLoading: topRatedLoading } = useQuery({
    queryKey: ["top-rated-movies"],
    queryFn: () => getTopRatedMovies(),
    ...queryConfig,
  });

  const { data: nowPlayingData, isLoading: nowPlayingLoading } = useQuery({
    queryKey: ["now-playing-movies"],
    queryFn: () => getNowPlayingMovies(),
    ...queryConfig,
  });

  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ["upcoming-movies"],
    queryFn: () => getUpcomingMovies(),
    ...queryConfig,
  });

  // Filter Now Playing to only show movies released today or earlier
  const filteredNowPlaying = useMemo(() => {
    if (!nowPlayingData?.results) return [];
    const today = new Date().toISOString().split("T")[0];
    return nowPlayingData.results.filter(
      (movie) => movie.release_date <= today && !isAnimeLike(movie)
    );
  }, [nowPlayingData]);

  // Filter Upcoming to only show movies releasing tomorrow or later
  const filteredUpcoming = useMemo(() => {
    if (!upcomingData?.results) return [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    return upcomingData.results.filter(
      (movie) => movie.release_date >= tomorrowStr && !isAnimeLike(movie)
    );
  }, [upcomingData]);

  const filteredTrendingMovies = useMemo(
    () => (trendingMovies || []).filter((movie) => !isAnimeLike(movie)),
    [trendingMovies]
  );

  const filteredTopRatedMovies = useMemo(
    () => (topRatedData?.results || []).filter((movie) => !isAnimeLike(movie)),
    [topRatedData]
  );

  const filteredTvShows = useMemo(
    () => (tvShowsData?.results || []).filter((show) => !isAnimeLike(show)),
    [tvShowsData]
  );

  // Hero movies (top 5 trending)
  const heroMovies = useMemo(() => filteredTrendingMovies.slice(0, 5), [filteredTrendingMovies]);
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
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
              />
            </section>
          )}

          {/* Now Playing - Only movies released today or earlier */}
          {(filteredNowPlaying.length > 0 || nowPlayingLoading) && (
            <MemoizedCarousel
              title="🎬 Now Playing in Theaters"
              items={filteredNowPlaying as (Movie | TVShow)[]}
              isLoading={nowPlayingLoading}
              type="movie"
              viewAllHref="/movies?category=now_playing"
            />
          )}

          {/* Upcoming - Only movies releasing tomorrow or later */}
          {(filteredUpcoming.length > 0 || upcomingLoading) && (
            <MemoizedCarousel
              title="🗓️ Coming Soon"
              items={filteredUpcoming as (Movie | TVShow)[]}
              isLoading={upcomingLoading}
              type="movie"
              viewAllHref="/movies?category=upcoming"
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
            isLoading={bollywoodLoading}
            type="movie"
            viewAllHref="/movies?category=bollywood"
          />

          {/* Hollywood Blockbusters */}
          <MemoizedCarousel
            title="🎬 Hollywood Blockbusters"
            items={hollywoodData?.results as (Movie | TVShow)[]}
            isLoading={hollywoodLoading}
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
              viewAllHref="/movies?category=tamil"
            />
          )}

          {/* Telugu Cinema */}
          {teluguData?.results && teluguData.results.length > 0 && (
            <MemoizedCarousel
              title="🌟 Telugu Cinema"
              items={teluguData.results as (Movie | TVShow)[]}
              isLoading={teluguLoading}
              type="movie"
              viewAllHref="/movies?category=telugu"
            />
          )}

          {/* Gujarati Cinema */}
          {gujaratiData?.results && gujaratiData.results.length > 0 && (
            <MemoizedCarousel
              title="🎪 Gujarati Cinema"
              items={gujaratiData.results as (Movie | TVShow)[]}
              isLoading={gujaratiLoading}
              type="movie"
              viewAllHref="/browse?type=gujarati"
            />
          )}

          {/* Trending TV Series */}
          <MemoizedCarousel
            title="📺 Trending TV Series"
            items={filteredTvShows as (Movie | TVShow)[]}
            isLoading={tvLoading}
            type="tv"
            viewAllHref="/series?category=popular"
          />

          {/* Top Rated */}
          <MemoizedCarousel
            title="⭐ Top Rated"
            items={filteredTopRatedMovies as (Movie | TVShow)[]}
            isLoading={topRatedLoading}
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
