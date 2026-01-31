import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserData } from "./useUserData";
import {
  Movie,
  TVShow,
  getTrendingMovies,
  getPopularMovies,
  discoverMovies,
  discoverTVShows,
} from "@/lib/tmdb";

interface RecommendationResult {
  items: (Movie | TVShow)[];
  isLoading: boolean;
  isPersonalized: boolean;
}

export function useRecommendations(): RecommendationResult {
  const { watchHistory, likedItems, preferences, isLoading: userDataLoading } = useUserData();

  // Get user's top genres from watch history
  const topGenres = useMemo(() => {
    const genreCounts: Record<number, number> = {};
    
    // Weight watch history
    watchHistory.forEach((item) => {
      item.genres?.forEach((genre) => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 2;
      });
    });
    
    // Add liked items with higher weight
    likedItems.forEach((item) => {
      // Liked items don't have genres directly, but we boost based on preferences
    });

    // Add preferences with moderate weight
    preferences?.preferred_genres?.forEach((genre) => {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });

    return Object.entries(genreCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre]) => Number(genre));
  }, [watchHistory, likedItems, preferences]);

  // Get user's preferred languages
  const preferredLanguages = useMemo(() => {
    const langCounts: Record<string, number> = {};
    
    watchHistory.forEach((item) => {
      if (item.language) {
        langCounts[item.language] = (langCounts[item.language] || 0) + 1;
      }
    });

    preferences?.preferred_languages?.forEach((lang) => {
      langCounts[lang] = (langCounts[lang] || 0) + 0.5;
    });

    return Object.entries(langCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([lang]) => lang);
  }, [watchHistory, preferences]);

  // Check if user has enough data for personalization
  const hasPersonalizationData = topGenres.length > 0 || preferredLanguages.length > 0;

  // Fetch trending as fallback
  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ["recommendations-trending"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: 1000 * 60 * 10,
  });

  // Fetch popular movies as additional fallback
  const { data: popularData, isLoading: popularLoading } = useQuery({
    queryKey: ["recommendations-popular"],
    queryFn: () => getPopularMovies(1),
    staleTime: 1000 * 60 * 10,
  });

  // Fetch personalized content based on top genre
  const { data: genreData, isLoading: genreLoading } = useQuery({
    queryKey: ["recommendations-genre", topGenres[0]],
    queryFn: () =>
      discoverMovies({
        with_genres: topGenres[0]?.toString(),
        sort_by: "popularity.desc",
        page: 1,
      }),
    enabled: topGenres.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  // Fetch content by preferred language
  const { data: langData, isLoading: langLoading } = useQuery({
    queryKey: ["recommendations-language", preferredLanguages[0]],
    queryFn: () =>
      discoverMovies({
        with_original_language: preferredLanguages[0],
        sort_by: "popularity.desc",
        page: 1,
      }),
    enabled: preferredLanguages.length > 0 && preferredLanguages[0] !== "en",
    staleTime: 1000 * 60 * 10,
  });

  // Combine and deduplicate recommendations
  const recommendations = useMemo(() => {
    const watchedIds = new Set(watchHistory.map((w) => w.content_id));
    const seen = new Set<number>();
    const results: (Movie | TVShow)[] = [];

    const addItems = (items: (Movie | TVShow)[] | undefined, maxItems = 10) => {
      if (!items) return;
      for (const item of items) {
        if (!seen.has(item.id) && !watchedIds.has(item.id)) {
          seen.add(item.id);
          results.push(item);
          if (results.length >= 20) break;
        }
      }
    };

    // Priority: personalized content first
    if (hasPersonalizationData) {
      addItems(genreData?.results, 8);
      addItems(langData?.results, 8);
    }

    // Fill with trending
    addItems(trendingData, 10);

    // Fill remaining with popular
    addItems(popularData?.results, 10);

    return results.slice(0, 20);
  }, [
    watchHistory,
    genreData,
    langData,
    trendingData,
    popularData,
    hasPersonalizationData,
  ]);

  const isLoading =
    userDataLoading ||
    trendingLoading ||
    popularLoading ||
    (hasPersonalizationData && (genreLoading || langLoading));

  return {
    items: recommendations,
    isLoading,
    isPersonalized: hasPersonalizationData && recommendations.length > 0,
  };
}
