import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { useNavigate } from "react-router-dom";
import {
  getTrendingMovies,
  getBollywoodMovies,
  getHollywoodMovies,
  getPopularTVShows,
  getTopRatedMovies,
  Movie,
  TVShow,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import ContentCarousel from "@/components/ContentCarousel";
import Footer from "@/components/Footer";

export default function Home() {
  const { user, isLoading: userLoading } = useUser();
  const navigate = useNavigate();
  const [heroIndex, setHeroIndex] = useState(0);

  // Redirect to welcome if no user
  useEffect(() => {
    if (!userLoading && !user) {
      navigate("/");
    }
  }, [user, userLoading, navigate]);

  // Fetch all data
  const { data: trendingMovies, isLoading: trendingLoading } = useQuery({
    queryKey: ["trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const { data: bollywoodData, isLoading: bollywoodLoading } = useQuery({
    queryKey: ["bollywood-movies"],
    queryFn: () => getBollywoodMovies(),
    staleTime: 1000 * 60 * 10,
  });

  const { data: hollywoodData, isLoading: hollywoodLoading } = useQuery({
    queryKey: ["hollywood-movies"],
    queryFn: () => getHollywoodMovies(),
    staleTime: 1000 * 60 * 10,
  });

  const { data: tvShowsData, isLoading: tvLoading } = useQuery({
    queryKey: ["popular-tv"],
    queryFn: () => getPopularTVShows(),
    staleTime: 1000 * 60 * 10,
  });

  const { data: topRatedData, isLoading: topRatedLoading } = useQuery({
    queryKey: ["top-rated-movies"],
    queryFn: () => getTopRatedMovies(),
    staleTime: 1000 * 60 * 10,
  });

  // Auto-rotate hero banner
  useEffect(() => {
    if (!trendingMovies?.length) return;

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(5, trendingMovies.length));
    }, 5000);

    return () => clearInterval(interval);
  }, [trendingMovies]);

  // Get recently watched for recommendations
  const recentlyWatched = user?.watchHistory.slice(0, 10) || [];

  // Hero movies (top 5 trending)
  const heroMovies = trendingMovies?.slice(0, 5) || [];
  const currentHeroMovie = heroMovies[heroIndex];

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Banner */}
      <HeroBanner
        movie={currentHeroMovie}
        isLoading={trendingLoading}
        currentIndex={heroIndex}
        totalSlides={heroMovies.length}
        onDotClick={setHeroIndex}
      />

      {/* Content Sections */}
      <main className="relative z-10 -mt-32 pb-20">
        <div className="space-y-8">
          {/* Trending Now */}
          <ContentCarousel
            title="🔥 Trending Now"
            items={trendingMovies as (Movie | TVShow)[]}
            isLoading={trendingLoading}
            type="movie"
          />

          {/* Bollywood Hits */}
          <ContentCarousel
            title="🇮🇳 Bollywood Hits"
            items={bollywoodData?.results as (Movie | TVShow)[]}
            isLoading={bollywoodLoading}
            type="movie"
          />

          {/* Hollywood Blockbusters */}
          <ContentCarousel
            title="🎬 Hollywood Blockbusters"
            items={hollywoodData?.results as (Movie | TVShow)[]}
            isLoading={hollywoodLoading}
            type="movie"
          />

          {/* Recently Watched (if any) */}
          {recentlyWatched.length > 0 && (
            <ContentCarousel
              title="⏪ Continue Watching"
              items={recentlyWatched.map((item) => ({
                id: item.id,
                title: item.title,
                name: item.title,
                poster_path: item.posterPath,
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
              })) as (Movie | TVShow)[]}
              isLoading={false}
              type="mixed"
            />
          )}

          {/* Trending TV Series */}
          <ContentCarousel
            title="📺 Trending TV Series"
            items={tvShowsData?.results as (Movie | TVShow)[]}
            isLoading={tvLoading}
            type="tv"
          />

          {/* Top Rated */}
          <ContentCarousel
            title="⭐ Top Rated"
            items={topRatedData?.results as (Movie | TVShow)[]}
            isLoading={topRatedLoading}
            type="movie"
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
