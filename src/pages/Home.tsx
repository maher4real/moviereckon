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
    return nowPlayingData.results.filter((movie) => movie.release_date <= today);
  }, [nowPlayingData]);

  // Filter Upcoming to only show movies releasing tomorrow or later
  const filteredUpcoming = useMemo(() => {
    if (!upcomingData?.results) return [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    return upcomingData.results.filter((movie) => movie.release_date >= tomorrowStr);
  }, [upcomingData]);

  // Auto-rotate hero banner
  useEffect(() => {
    if (!trendingMovies?.length) return;

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(5, trendingMovies.length));
    }, 5000);

    return () => clearInterval(interval);
  }, [trendingMovies]);

  // Get recently watched for recommendations - memoized
  const recentlyWatched = useMemo(() => {
    return watchHistory.slice(0, 10).map((item) => ({
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
      first_air_date: "",
      adult: false,
      video: false,
      original_title: item.title,
      original_name: item.title,
      origin_country: [],
    }));
  }, [watchHistory]);

  // Hero movies (top 5 trending)
  const heroMovies = useMemo(() => trendingMovies?.slice(0, 5) || [], [trendingMovies]);
  const currentHeroMovie = heroMovies[heroIndex];

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
      <main className="relative z-10 -mt-32 pb-20">
        <div className="space-y-8">
          {/* Reckon - Personalized Recommendations */}
          {reckonItems.length > 0 && (
            <section className="px-4 md:px-8">
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
                <a
                  href="/reckon"
                  className="text-sm text-primary hover:underline transition-colors"
                >
                  View All →
                </a>
              </div>
              <MemoizedCarousel
                title=""
                items={reckonItems as (Movie | TVShow)[]}
                isLoading={reckonLoading}
                type="mixed"
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
            />
          )}

          {/* Upcoming - Only movies releasing tomorrow or later */}
          {(filteredUpcoming.length > 0 || upcomingLoading) && (
            <MemoizedCarousel
              title="🗓️ Coming Soon"
              items={filteredUpcoming as (Movie | TVShow)[]}
              isLoading={upcomingLoading}
              type="movie"
            />
          )}

          {/* Trending Now */}
          <MemoizedCarousel
            title="🔥 Trending Now"
            items={trendingMovies as (Movie | TVShow)[]}
            isLoading={trendingLoading}
            type="movie"
          />

          {/* Recently Watched (if any) */}
          {recentlyWatched.length > 0 && (
            <MemoizedCarousel
              title="⏪ Continue Watching"
              items={recentlyWatched as (Movie | TVShow)[]}
              isLoading={false}
              type="mixed"
            />
          )}

          {/* Bollywood Hits */}
          <MemoizedCarousel
            title="🇮🇳 Bollywood Hits"
            items={bollywoodData?.results as (Movie | TVShow)[]}
            isLoading={bollywoodLoading}
            type="movie"
          />

          {/* Hollywood Blockbusters */}
          <MemoizedCarousel
            title="🎬 Hollywood Blockbusters"
            items={hollywoodData?.results as (Movie | TVShow)[]}
            isLoading={hollywoodLoading}
            type="movie"
          />

          {/* Tamil Cinema */}
          {tamilData?.results && tamilData.results.length > 0 && (
            <MemoizedCarousel
              title="🎭 Tamil Cinema"
              items={tamilData.results as (Movie | TVShow)[]}
              isLoading={tamilLoading}
              type="movie"
            />
          )}

          {/* Telugu Cinema */}
          {teluguData?.results && teluguData.results.length > 0 && (
            <MemoizedCarousel
              title="🌟 Telugu Cinema"
              items={teluguData.results as (Movie | TVShow)[]}
              isLoading={teluguLoading}
              type="movie"
            />
          )}

          {/* Gujarati Cinema */}
          {gujaratiData?.results && gujaratiData.results.length > 0 && (
            <MemoizedCarousel
              title="🎪 Gujarati Cinema"
              items={gujaratiData.results as (Movie | TVShow)[]}
              isLoading={gujaratiLoading}
              type="movie"
            />
          )}

          {/* Trending TV Series */}
          <MemoizedCarousel
            title="📺 Trending TV Series"
            items={tvShowsData?.results as (Movie | TVShow)[]}
            isLoading={tvLoading}
            type="tv"
          />

          {/* Top Rated */}
          <MemoizedCarousel
            title="⭐ Top Rated"
            items={topRatedData?.results as (Movie | TVShow)[]}
            isLoading={topRatedLoading}
            type="movie"
          />
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
