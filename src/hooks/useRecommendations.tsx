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

// Scoring weights
const WEIGHTS = {
  LIKED: 5,           // Highest weight for liked content
  WATCHED_RECENT: 3,  // Recently watched (last 7 days)
  WATCHED_OLD: 1.5,   // Older watched content
  PREFERENCE: 1,      // User preferences
};

// Time decay factor - items older than this (in days) get reduced weight
const TIME_DECAY_THRESHOLD = 7;

// Exploration percentage - mix in diverse content
const EXPLORATION_RATIO = 0.15; // 15% exploratory content

export function useRecommendations(): RecommendationResult {
  const { watchHistory, likedItems, preferences, isLoading: userDataLoading } = useUserData();

  // Calculate weighted genre scores with time decay
  const genreScores = useMemo(() => {
    const scores: Record<number, number> = {};
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Weight liked items highest
    likedItems.forEach((item) => {
      // Liked items don't have genres directly, but we use time-based weighting
      const likedAt = new Date(item.liked_at).getTime();
      const daysAgo = (now - likedAt) / dayMs;
      const timeWeight = daysAgo <= TIME_DECAY_THRESHOLD ? 1 : Math.max(0.5, 1 - (daysAgo - TIME_DECAY_THRESHOLD) / 30);
      
      // We'll boost based on watch history genres if this item was also watched
      const watchedItem = watchHistory.find(w => w.content_id === item.content_id);
      if (watchedItem?.genres) {
        watchedItem.genres.forEach((genre) => {
          scores[genre] = (scores[genre] || 0) + WEIGHTS.LIKED * timeWeight;
        });
      }
    });

    // Weight watch history based on recency
    watchHistory.forEach((item) => {
      const watchedAt = new Date(item.watched_at).getTime();
      const daysAgo = (now - watchedAt) / dayMs;
      const isRecent = daysAgo <= TIME_DECAY_THRESHOLD;
      const baseWeight = isRecent ? WEIGHTS.WATCHED_RECENT : WEIGHTS.WATCHED_OLD;
      const timeWeight = isRecent ? 1 : Math.max(0.3, 1 - (daysAgo - TIME_DECAY_THRESHOLD) / 60);

      item.genres?.forEach((genre) => {
        scores[genre] = (scores[genre] || 0) + baseWeight * timeWeight;
      });
    });

    // Add preferences with lower weight
    preferences?.preferred_genres?.forEach((genre) => {
      scores[genre] = (scores[genre] || 0) + WEIGHTS.PREFERENCE;
    });

    return scores;
  }, [watchHistory, likedItems, preferences]);

  // Get top genres sorted by score
  const topGenres = useMemo(() => {
    return Object.entries(genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre]) => Number(genre));
  }, [genreScores]);

  // Calculate weighted language preferences with time decay
  const languageScores = useMemo(() => {
    const scores: Record<string, number> = {};
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    watchHistory.forEach((item) => {
      if (item.language) {
        const watchedAt = new Date(item.watched_at).getTime();
        const daysAgo = (now - watchedAt) / dayMs;
        const isRecent = daysAgo <= TIME_DECAY_THRESHOLD;
        const weight = isRecent ? WEIGHTS.WATCHED_RECENT : WEIGHTS.WATCHED_OLD;
        const timeWeight = isRecent ? 1 : Math.max(0.3, 1 - (daysAgo - TIME_DECAY_THRESHOLD) / 60);

        scores[item.language] = (scores[item.language] || 0) + weight * timeWeight;
      }
    });

    preferences?.preferred_languages?.forEach((lang) => {
      scores[lang] = (scores[lang] || 0) + WEIGHTS.PREFERENCE;
    });

    return scores;
  }, [watchHistory, preferences]);

  // Get preferred languages sorted by score
  const preferredLanguages = useMemo(() => {
    return Object.entries(languageScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([lang]) => lang);
  }, [languageScores]);

  // Check if user has enough data for personalization
  const hasPersonalizationData = topGenres.length > 0 || preferredLanguages.length > 0;
  const hasStrongSignals = watchHistory.length >= 3 || likedItems.length >= 2;

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
  const { data: genreData1, isLoading: genre1Loading } = useQuery({
    queryKey: ["recommendations-genre-1", topGenres[0]],
    queryFn: () =>
      discoverMovies({
        with_genres: topGenres[0]?.toString(),
        sort_by: "popularity.desc",
        page: 1,
      }),
    enabled: topGenres.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  // Fetch second genre for diversity
  const { data: genreData2, isLoading: genre2Loading } = useQuery({
    queryKey: ["recommendations-genre-2", topGenres[1]],
    queryFn: () =>
      discoverMovies({
        with_genres: topGenres[1]?.toString(),
        sort_by: "vote_average.desc",
        "vote_count.gte": 100,
        page: 1,
      }),
    enabled: topGenres.length > 1,
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

  // Fetch exploratory content (different genres/new releases)
  const exploratoryPage = useMemo(() => Math.floor(Math.random() * 5) + 1, []);
  
  const { data: exploratoryData, isLoading: exploratoryLoading } = useQuery({
    queryKey: ["recommendations-exploratory", exploratoryPage],
    queryFn: () =>
      discoverMovies({
        sort_by: "popularity.desc",
        "vote_average.gte": 7,
        "vote_count.gte": 500,
        page: exploratoryPage,
      }),
    staleTime: 1000 * 60 * 5, // Shorter cache for exploration
  });

  // Fetch TV shows for diversity
  const { data: tvData, isLoading: tvLoading } = useQuery({
    queryKey: ["recommendations-tv", topGenres[0]],
    queryFn: () =>
      discoverTVShows({
        with_genres: topGenres[0]?.toString(),
        sort_by: "popularity.desc",
        page: 1,
      }),
    enabled: topGenres.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  // Combine and deduplicate recommendations with scoring
  const recommendations = useMemo(() => {
    const watchedIds = new Set(watchHistory.map((w) => w.content_id));
    const likedIds = new Set(likedItems.map((l) => l.content_id));
    const seen = new Set<string>(); // Use string to differentiate movie/tv
    const results: (Movie | TVShow)[] = [];

    // Score and add items, avoiding watched content
    const addScoredItems = (
      items: (Movie | TVShow)[] | undefined,
      baseScore: number,
      maxItems: number
    ) => {
      if (!items) return;

      // Sort by score combining API data with our preferences
      const scored = items
        .filter((item) => {
          const key = `${item.id}-${"title" in item ? "movie" : "tv"}`;
          const alreadyWatched = watchedIds.has(item.id);
          const alreadySeen = seen.has(key);
          return !alreadySeen && !alreadyWatched;
        })
        .map((item) => {
          let score = baseScore;
          
          // Boost items in preferred genres
          const genres = item.genre_ids || [];
          genres.forEach((g) => {
            if (genreScores[g]) {
              score += genreScores[g] * 0.5;
            }
          });

          // Boost items in preferred language
          if (languageScores[item.original_language]) {
            score += languageScores[item.original_language] * 0.3;
          }

          // Boost highly rated items
          if (item.vote_average >= 7.5) {
            score += 1;
          }

          return { item, score };
        })
        .sort((a, b) => b.score - a.score);

      let added = 0;
      for (const { item } of scored) {
        if (added >= maxItems || results.length >= 30) break;
        
        const key = `${item.id}-${"title" in item ? "movie" : "tv"}`;
        seen.add(key);
        results.push(item);
        added++;
      }
    };

    // Priority-based addition with exploration mix
    if (hasPersonalizationData && hasStrongSignals) {
      // Strong personalization
      addScoredItems(genreData1?.results, 10, 8);
      addScoredItems(langData?.results, 8, 6);
      addScoredItems(genreData2?.results, 7, 5);
      addScoredItems(tvData?.results, 6, 4);
      
      // Exploration (15% of total ~30 items = ~4-5 items)
      addScoredItems(exploratoryData?.results, 3, 5);
    } else if (hasPersonalizationData) {
      // Weak personalization - blend with trending
      addScoredItems(genreData1?.results, 8, 6);
      addScoredItems(trendingData, 7, 8);
      addScoredItems(langData?.results, 6, 4);
      addScoredItems(popularData?.results, 5, 6);
    } else {
      // No personalization - use trending/popular as fallback
      addScoredItems(trendingData, 10, 12);
      addScoredItems(popularData?.results, 8, 10);
      addScoredItems(exploratoryData?.results, 5, 8);
    }

    return results.slice(0, 30);
  }, [
    watchHistory,
    likedItems,
    genreScores,
    languageScores,
    genreData1,
    genreData2,
    langData,
    tvData,
    trendingData,
    popularData,
    exploratoryData,
    hasPersonalizationData,
    hasStrongSignals,
  ]);

  const isLoading =
    userDataLoading ||
    trendingLoading ||
    popularLoading ||
    (hasPersonalizationData && (genre1Loading || genre2Loading || langLoading || tvLoading));

  return {
    items: recommendations,
    isLoading,
    isPersonalized: hasPersonalizationData && hasStrongSignals && recommendations.length > 0,
  };
}
