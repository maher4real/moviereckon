import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useUserData } from "./useUserData";
import {
  Movie,
  TVShow,
  getTrendingMovies,
  getTrendingTVShows,
  getPopularMovies,
  getPopularTVShows,
  discoverMovies,
  discoverTVShows,
} from "@/lib/tmdb";

interface RecommendationResult {
  items: (Movie | TVShow)[];
  isLoading: boolean;
  isPersonalized: boolean;
}

interface ScoredItem {
  item: Movie | TVShow;
  type: "movie" | "tv";
  score: number;
}

const WEIGHTS = {
  LIKED: 5,
  WATCHED_RECENT: 3,
  WATCHED_OLD: 1.4,
  PREFERENCE: 1.1,
};

const FEEDBACK_GENRE_WEIGHT: Record<string, number> = {
  must_watch: 3.5,
  give_it_a_go: 1.8,
  one_time_watch: 0.6,
  skip: -4,
};

const FEEDBACK_LANGUAGE_WEIGHT: Record<string, number> = {
  must_watch: 2.2,
  give_it_a_go: 1.2,
  one_time_watch: 0.4,
  skip: -2.8,
};

const TIME_DECAY_THRESHOLD = 7;
const GLOBAL_LANGUAGE_POOL = ["hi", "ko", "ja", "es", "fr", "ta", "te", "tr", "pt"];

const getContentType = (item: Movie | TVShow): "movie" | "tv" =>
  "title" in item ? "movie" : "tv";

export function useRecommendations(): RecommendationResult {
  const { watchHistory, likedItems, feedbackItems, preferences, isLoading: userDataLoading } = useUserData();

  const genreScores = useMemo(() => {
    const scores: Record<number, number> = {};
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    likedItems.forEach((item) => {
      const likedAt = new Date(item.liked_at).getTime();
      const daysAgo = (now - likedAt) / dayMs;
      const timeWeight = daysAgo <= TIME_DECAY_THRESHOLD
        ? 1
        : Math.max(0.5, 1 - (daysAgo - TIME_DECAY_THRESHOLD) / 30);

      const watchedItem = watchHistory.find(
        (w) => w.content_id === item.content_id && w.content_type === item.content_type
      );

      watchedItem?.genres?.forEach((genre) => {
        scores[genre] = (scores[genre] || 0) + WEIGHTS.LIKED * timeWeight;
      });
    });

    watchHistory.forEach((item) => {
      const watchedAt = new Date(item.watched_at).getTime();
      const daysAgo = (now - watchedAt) / dayMs;
      const isRecent = daysAgo <= TIME_DECAY_THRESHOLD;
      const baseWeight = isRecent ? WEIGHTS.WATCHED_RECENT : WEIGHTS.WATCHED_OLD;
      const timeWeight = isRecent ? 1 : Math.max(0.35, 1 - (daysAgo - TIME_DECAY_THRESHOLD) / 60);

      item.genres?.forEach((genre) => {
        scores[genre] = (scores[genre] || 0) + baseWeight * timeWeight;
      });
    });

    preferences?.preferred_genres?.forEach((genre) => {
      scores[genre] = (scores[genre] || 0) + WEIGHTS.PREFERENCE;
    });

    feedbackItems.forEach((item) => {
      const weight = FEEDBACK_GENRE_WEIGHT[item.feedback_type] || 0;
      item.genres?.forEach((genre) => {
        scores[genre] = (scores[genre] || 0) + weight;
      });
    });

    return scores;
  }, [watchHistory, likedItems, feedbackItems, preferences]);

  const topGenres = useMemo(
    () =>
      Object.entries(genreScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([genre]) => Number(genre)),
    [genreScores]
  );

  const languageScores = useMemo(() => {
    const scores: Record<string, number> = {};
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    watchHistory.forEach((item) => {
      if (!item.language) return;
      const watchedAt = new Date(item.watched_at).getTime();
      const daysAgo = (now - watchedAt) / dayMs;
      const isRecent = daysAgo <= TIME_DECAY_THRESHOLD;
      const baseWeight = isRecent ? WEIGHTS.WATCHED_RECENT : WEIGHTS.WATCHED_OLD;
      const timeWeight = isRecent ? 1 : Math.max(0.35, 1 - (daysAgo - TIME_DECAY_THRESHOLD) / 60);

      scores[item.language] = (scores[item.language] || 0) + baseWeight * timeWeight;
    });

    preferences?.preferred_languages?.forEach((lang) => {
      scores[lang] = (scores[lang] || 0) + WEIGHTS.PREFERENCE;
    });

    feedbackItems.forEach((item) => {
      if (!item.language) return;
      const weight = FEEDBACK_LANGUAGE_WEIGHT[item.feedback_type] || 0;
      scores[item.language] = (scores[item.language] || 0) + weight;
    });

    return scores;
  }, [watchHistory, feedbackItems, preferences]);

  const preferredLanguages = useMemo(
    () =>
      Object.entries(languageScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([lang]) => lang),
    [languageScores]
  );

  const hasPersonalizationData = topGenres.length > 0 || preferredLanguages.length > 0 || feedbackItems.length > 0;
  const hasStrongSignals = watchHistory.length >= 4 || likedItems.length >= 3 || feedbackItems.length >= 3;

  const explorationLanguages = useMemo(() => {
    const seeded = [...preferredLanguages.filter((lang) => lang !== "en")];
    GLOBAL_LANGUAGE_POOL.forEach((lang) => {
      if (!seeded.includes(lang)) seeded.push(lang);
    });
    return seeded.slice(0, 3);
  }, [preferredLanguages]);

  const explorationPages = useMemo(
    () => ({
      movie: Math.floor(Math.random() * 8) + 1,
      tv: Math.floor(Math.random() * 8) + 1,
    }),
    []
  );

  const { data: trendingMovies, isLoading: trendingMoviesLoading } = useQuery({
    queryKey: ["recommendations-trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: 1000 * 60 * 10,
  });

  const { data: trendingTV, isLoading: trendingTVLoading } = useQuery({
    queryKey: ["recommendations-trending-tv"],
    queryFn: () => getTrendingTVShows("week"),
    staleTime: 1000 * 60 * 10,
  });

  const { data: popularMovies, isLoading: popularMoviesLoading } = useQuery({
    queryKey: ["recommendations-popular-movies"],
    queryFn: () => getPopularMovies(1),
    staleTime: 1000 * 60 * 10,
  });

  const { data: popularTV, isLoading: popularTVLoading } = useQuery({
    queryKey: ["recommendations-popular-tv"],
    queryFn: () => getPopularTVShows(1),
    staleTime: 1000 * 60 * 10,
  });

  const { data: genreMoviePrimary, isLoading: genreMoviePrimaryLoading } = useQuery({
    queryKey: ["recommendations-genre-movie-primary", topGenres[0]],
    queryFn: () => discoverMovies({ with_genres: topGenres[0]?.toString(), sort_by: "popularity.desc", page: 1 }),
    enabled: topGenres.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  const { data: genreMovieSecondary, isLoading: genreMovieSecondaryLoading } = useQuery({
    queryKey: ["recommendations-genre-movie-secondary", topGenres[1]],
    queryFn: () =>
      discoverMovies({
        with_genres: topGenres[1]?.toString(),
        sort_by: "vote_average.desc",
        "vote_count.gte": 120,
        page: 1,
      }),
    enabled: topGenres.length > 1,
    staleTime: 1000 * 60 * 10,
  });

  const { data: genreTVPrimary, isLoading: genreTVPrimaryLoading } = useQuery({
    queryKey: ["recommendations-genre-tv-primary", topGenres[0]],
    queryFn: () => discoverTVShows({ with_genres: topGenres[0]?.toString(), sort_by: "popularity.desc", page: 1 }),
    enabled: topGenres.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  const { data: genreTVSecondary, isLoading: genreTVSecondaryLoading } = useQuery({
    queryKey: ["recommendations-genre-tv-secondary", topGenres[1]],
    queryFn: () =>
      discoverTVShows({
        with_genres: topGenres[1]?.toString(),
        sort_by: "vote_average.desc",
        "vote_count.gte": 80,
        page: 1,
      }),
    enabled: topGenres.length > 1,
    staleTime: 1000 * 60 * 10,
  });

  const languageFocus = useMemo(() => {
    const base = preferredLanguages.filter((lang) => lang !== "en");
    explorationLanguages.forEach((lang) => {
      if (!base.includes(lang)) base.push(lang);
    });
    return base.slice(0, 2);
  }, [preferredLanguages, explorationLanguages]);

  const languageMovieQueries = useQueries({
    queries: languageFocus.map((lang) => ({
      queryKey: ["recommendations-language-movie", lang],
      queryFn: () =>
        discoverMovies({
          with_original_language: lang,
          sort_by: "popularity.desc",
          page: 1,
        }),
      staleTime: 1000 * 60 * 10,
    })),
  });

  const languageTVQueries = useQueries({
    queries: languageFocus.map((lang) => ({
      queryKey: ["recommendations-language-tv", lang],
      queryFn: () =>
        discoverTVShows({
          with_original_language: lang,
          sort_by: "popularity.desc",
          page: 1,
        }),
      staleTime: 1000 * 60 * 10,
    })),
  });

  const { data: exploratoryMovies, isLoading: exploratoryMoviesLoading } = useQuery({
    queryKey: ["recommendations-exploratory-movies", explorationLanguages[0], explorationPages.movie],
    queryFn: () =>
      discoverMovies({
        with_original_language: explorationLanguages[0],
        sort_by: "popularity.desc",
        "vote_average.gte": 6.8,
        "vote_count.gte": 200,
        page: explorationPages.movie,
      }),
    staleTime: 1000 * 60 * 8,
  });

  const { data: exploratoryTV, isLoading: exploratoryTVLoading } = useQuery({
    queryKey: ["recommendations-exploratory-tv", explorationLanguages[1], explorationPages.tv],
    queryFn: () =>
      discoverTVShows({
        with_original_language: explorationLanguages[1],
        sort_by: "popularity.desc",
        "vote_average.gte": 6.8,
        "vote_count.gte": 100,
        page: explorationPages.tv,
      }),
    staleTime: 1000 * 60 * 8,
  });

  const recommendations = useMemo(() => {
    const watchedKeys = new Set(watchHistory.map((w) => `${w.content_type}:${w.content_id}`));
    const likedKeys = new Set(likedItems.map((l) => `${l.content_type}:${l.content_id}`));
    const feedbackMap = new Map(
      feedbackItems.map((item) => [`${item.content_type}:${item.content_id}`, item.feedback_type])
    );
    const seenKeys = new Set<string>();

    const movieCandidates: ScoredItem[] = [];
    const tvCandidates: ScoredItem[] = [];

    const scoreItem = (item: Movie | TVShow, baseScore: number) => {
      const itemType = getContentType(item);
      const itemKey = `${itemType}:${item.id}`;

      if (watchedKeys.has(itemKey)) return null;
      if (feedbackMap.get(itemKey) === "skip") return null;

      let score = baseScore;
      score += (item.vote_average || 0) / 2;
      score += Math.min((item.popularity || 0) / 120, 2.5);

      (item.genre_ids || []).forEach((genre) => {
        if (genreScores[genre]) score += genreScores[genre] * 0.35;
      });

      if (languageScores[item.original_language]) {
        score += languageScores[item.original_language] * 0.5;
      }

      if (item.original_language !== "en") {
        score += 0.7;
      }

      if (likedKeys.has(itemKey)) {
        score += 1.2;
      }

      const feedbackType = feedbackMap.get(itemKey);
      if (feedbackType === "must_watch") score += 2.8;
      if (feedbackType === "give_it_a_go") score += 1.4;
      if (feedbackType === "one_time_watch") score += 0.4;

      return { item, type: itemType, score };
    };

    const addSource = (
      items: (Movie | TVShow)[] | undefined,
      baseScore: number,
      cap: number
    ) => {
      if (!items?.length) return;

      const scored = items
        .map((item) => scoreItem(item, baseScore))
        .filter((entry): entry is ScoredItem => !!entry)
        .sort((a, b) => b.score - a.score)
        .slice(0, cap);

      scored.forEach((entry) => {
        if (entry.type === "movie") {
          movieCandidates.push(entry);
        } else {
          tvCandidates.push(entry);
        }
      });
    };

    addSource(genreMoviePrimary?.results, 12, 20);
    addSource(genreMovieSecondary?.results, 10, 16);
    addSource(genreTVPrimary?.results, 12, 20);
    addSource(genreTVSecondary?.results, 10, 16);

    languageMovieQueries.forEach((query) =>
      addSource((query.data as { results: Movie[] } | undefined)?.results, 9, 14)
    );
    languageTVQueries.forEach((query) =>
      addSource((query.data as { results: TVShow[] } | undefined)?.results, 9, 14)
    );

    addSource(exploratoryMovies?.results, 8, 16);
    addSource(exploratoryTV?.results, 8, 16);

    addSource(trendingMovies, 8, 22);
    addSource(trendingTV, 8, 22);
    addSource(popularMovies?.results, 7, 20);
    addSource(popularTV?.results, 7, 20);

    movieCandidates.sort((a, b) => b.score - a.score);
    tvCandidates.sort((a, b) => b.score - a.score);

    const targetCount = hasStrongSignals ? 120 : hasPersonalizationData ? 96 : 84;
    const movieTarget = Math.ceil(targetCount * 0.52);
    const tvTarget = targetCount - movieTarget;

    const takeUnique = (pool: ScoredItem[], limit: number) => {
      const picked: ScoredItem[] = [];
      for (const entry of pool) {
        const key = `${entry.type}:${entry.item.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        picked.push(entry);
        if (picked.length >= limit) break;
      }
      return picked;
    };

    const pickedMovies = takeUnique(movieCandidates, movieTarget);
    const pickedTV = takeUnique(tvCandidates, tvTarget);

    const interleaved: (Movie | TVShow)[] = [];
    const rounds = Math.max(pickedMovies.length, pickedTV.length);
    for (let i = 0; i < rounds; i++) {
      if (pickedMovies[i]) interleaved.push(pickedMovies[i].item);
      if (pickedTV[i]) interleaved.push(pickedTV[i].item);
    }

    if (interleaved.length < targetCount) {
      const leftovers = [...movieCandidates, ...tvCandidates]
        .sort((a, b) => b.score - a.score)
        .filter((entry) => !seenKeys.has(`${entry.type}:${entry.item.id}`));

      for (const entry of leftovers) {
        interleaved.push(entry.item);
        seenKeys.add(`${entry.type}:${entry.item.id}`);
        if (interleaved.length >= targetCount) break;
      }
    }

    return interleaved;
  }, [
    watchHistory,
    likedItems,
    feedbackItems,
    genreScores,
    languageScores,
    trendingMovies,
    trendingTV,
    popularMovies,
    popularTV,
    genreMoviePrimary,
    genreMovieSecondary,
    genreTVPrimary,
    genreTVSecondary,
    exploratoryMovies,
    exploratoryTV,
    languageMovieQueries,
    languageTVQueries,
    hasPersonalizationData,
    hasStrongSignals,
  ]);

  const languageMovieLoading = languageMovieQueries.some((query) => query.isLoading);
  const languageTVLoading = languageTVQueries.some((query) => query.isLoading);

  const isLoading =
    userDataLoading ||
    trendingMoviesLoading ||
    trendingTVLoading ||
    popularMoviesLoading ||
    popularTVLoading ||
    exploratoryMoviesLoading ||
    exploratoryTVLoading ||
    (hasPersonalizationData &&
      (genreMoviePrimaryLoading ||
        genreMovieSecondaryLoading ||
        genreTVPrimaryLoading ||
        genreTVSecondaryLoading ||
        languageMovieLoading ||
        languageTVLoading));

  return {
    items: recommendations,
    isLoading,
    isPersonalized: hasPersonalizationData && hasStrongSignals && recommendations.length > 0,
  };
}
