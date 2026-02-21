import { useEffect, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useUserData } from "./useUserData";
import {
  Movie,
  TVShow,
  discoverMovies,
  discoverTVShows,
  getMovieRecommendationProfile,
  getMovieRecommendations,
  getSimilarMovies,
  getSimilarTVShows,
  getTVRecommendationProfile,
  getTVShowRecommendations,
  getTrendingMovies,
  getTrendingTVShows,
} from "@/lib/tmdb";
import {
  RecommendationReason,
  ScoreBreakdown,
  UnifiedContentItem,
  buildCandidateUnion,
  getContentKey,
  getRecommendations,
  normalizeTmdbItem,
} from "@/lib/recommendation";
import { isDevelopment } from "@/lib/runtimeEnv";

interface RecommendationExplanation {
  reasons: RecommendationReason[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
  seedTitle: string | null;
}

interface RecommendationResult {
  items: (Movie | TVShow)[];
  isLoading: boolean;
  isPersonalized: boolean;
  explanationById: Record<string, RecommendationExplanation>;
}

type ContentType = "movie" | "tv";

interface SeedSignal {
  id: number;
  type: ContentType;
  title: string;
  weight: number;
}

const MAX_SEEDS = 6;
const MAX_CANDIDATES = 500;
const DIVERSIFICATION_TOP_N = 120;
const TIME_DECAY_THRESHOLD_DAYS = 7;

const WEIGHTS = {
  LIKED: 1.5,
  WATCHED_RECENT: 1.15,
  WATCHED_OLD: 0.9,
  FEEDBACK_MUST_WATCH: 1.35,
  FEEDBACK_GIVE_IT_A_GO: 1.1,
  FEEDBACK_ONE_TIME: 0.8,
};

function recencyMultiplier(timestamp: string): number {
  const date = new Date(timestamp).getTime();
  if (!Number.isFinite(date)) return 1;

  const daysAgo = (Date.now() - date) / (24 * 60 * 60 * 1000);
  if (daysAgo <= TIME_DECAY_THRESHOLD_DAYS) return 1;

  return Math.max(0.55, 1 - (daysAgo - TIME_DECAY_THRESHOLD_DAYS) / 45);
}

function pushSeed(
  map: Map<string, SeedSignal>,
  seed: SeedSignal,
): void {
  const key = getContentKey(seed.type, seed.id);
  const existing = map.get(key);

  if (!existing) {
    map.set(key, seed);
    return;
  }

  if (seed.weight > existing.weight) {
    map.set(key, seed);
  }
}

function toDisplayItem(item: UnifiedContentItem): Movie | TVShow {
  const raw = item.raw;
  if (raw && typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    if (item.type === "movie") {
      if (typeof source.title === "string") {
        return source as unknown as Movie;
      }
    } else if (typeof source.name === "string") {
      return source as unknown as TVShow;
    }
  }

  if (item.type === "movie") {
    return {
      id: item.id,
      title: item.title,
      original_title: item.originalTitle || item.title,
      overview: item.overview,
      poster_path: null,
      backdrop_path: null,
      release_date: item.releaseDate || "",
      vote_average: item.voteAverage,
      vote_count: item.voteCount,
      popularity: item.popularity,
      genre_ids: item.genreIds,
      original_language: item.originalLanguage || "en",
      adult: false,
      video: false,
    };
  }

  return {
    id: item.id,
    name: item.title,
    original_name: item.originalTitle || item.title,
    overview: item.overview,
    poster_path: null,
    backdrop_path: null,
    first_air_date: item.releaseDate || "",
    vote_average: item.voteAverage,
    vote_count: item.voteCount,
    popularity: item.popularity,
    genre_ids: item.genreIds,
    original_language: item.originalLanguage || "en",
    origin_country: [],
  };
}

export function useRecommendations(): RecommendationResult {
  const { watchHistory, likedItems, feedbackItems, preferences, isLoading: userDataLoading } =
    useUserData();

  const genreScores = useMemo(() => {
    const scores: Record<number, number> = {};

    likedItems.forEach((item) => {
      const watched = watchHistory.find(
        (entry) =>
          entry.content_id === item.content_id &&
          entry.content_type === item.content_type,
      );

      if (!watched?.genres?.length) return;

      const weight = WEIGHTS.LIKED * recencyMultiplier(item.liked_at);
      watched.genres.forEach((genreId) => {
        scores[genreId] = (scores[genreId] || 0) + weight;
      });
    });

    watchHistory.forEach((item) => {
      if (!item.genres?.length) return;
      const recentBoost = recencyMultiplier(item.watched_at);
      const baseWeight =
        recentBoost >= 0.95 ? WEIGHTS.WATCHED_RECENT : WEIGHTS.WATCHED_OLD;
      item.genres.forEach((genreId) => {
        scores[genreId] = (scores[genreId] || 0) + baseWeight * recentBoost;
      });
    });

    feedbackItems.forEach((item) => {
      if (!item.genres?.length || item.feedback_type === "skip") return;
      const feedbackWeight =
        item.feedback_type === "must_watch"
          ? WEIGHTS.FEEDBACK_MUST_WATCH
          : item.feedback_type === "give_it_a_go"
            ? WEIGHTS.FEEDBACK_GIVE_IT_A_GO
            : WEIGHTS.FEEDBACK_ONE_TIME;

      item.genres.forEach((genreId) => {
        scores[genreId] = (scores[genreId] || 0) + feedbackWeight;
      });
    });

    preferences?.preferred_genres?.forEach((genreId) => {
      scores[genreId] = (scores[genreId] || 0) + 0.85;
    });

    return scores;
  }, [feedbackItems, likedItems, preferences, watchHistory]);

  const topGenres = useMemo(
    () =>
      Object.entries(genreScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([genreId]) => Number(genreId)),
    [genreScores],
  );

  const seedSignals = useMemo(() => {
    const seedMap = new Map<string, SeedSignal>();

    likedItems.forEach((item) => {
      pushSeed(seedMap, {
        id: item.content_id,
        type: item.content_type,
        title: item.title,
        weight: WEIGHTS.LIKED * recencyMultiplier(item.liked_at),
      });
    });

    watchHistory.forEach((item) => {
      const weight = WEIGHTS.WATCHED_RECENT * recencyMultiplier(item.watched_at);
      pushSeed(seedMap, {
        id: item.content_id,
        type: item.content_type,
        title: item.title,
        weight,
      });
    });

    feedbackItems.forEach((item) => {
      if (item.feedback_type === "skip") return;

      const feedbackWeight =
        item.feedback_type === "must_watch"
          ? WEIGHTS.FEEDBACK_MUST_WATCH
          : item.feedback_type === "give_it_a_go"
            ? WEIGHTS.FEEDBACK_GIVE_IT_A_GO
            : WEIGHTS.FEEDBACK_ONE_TIME;

      pushSeed(seedMap, {
        id: item.content_id,
        type: item.content_type,
        title: item.title,
        weight: feedbackWeight,
      });
    });

    return Array.from(seedMap.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_SEEDS);
  }, [feedbackItems, likedItems, watchHistory]);

  const hasPersonalizationData =
    seedSignals.length > 0 || topGenres.length > 0 || feedbackItems.length > 0;
  const hasStrongSignals =
    watchHistory.length >= 4 || likedItems.length >= 3 || feedbackItems.length >= 3;

  const seedWeights = useMemo(() => {
    const weights: Record<string, number> = {};
    seedSignals.forEach((seed) => {
      weights[getContentKey(seed.type, seed.id)] = seed.weight;
    });
    return weights;
  }, [seedSignals]);

  const { data: trendingMovies, isLoading: trendingMoviesLoading } = useQuery({
    queryKey: ["recommendations-trending-movies-v2"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: 1000 * 60 * 10,
  });

  const { data: trendingTV, isLoading: trendingTVLoading } = useQuery({
    queryKey: ["recommendations-trending-tv-v2"],
    queryFn: () => getTrendingTVShows("week"),
    staleTime: 1000 * 60 * 10,
  });

  const genreMovieQueries = useQueries({
    queries: topGenres.slice(0, 3).map((genreId, index) => ({
      queryKey: ["recommendations-v2-genre-movie", genreId, index],
      queryFn: () =>
        discoverMovies({
          with_genres: genreId.toString(),
          sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
          "vote_count.gte": index === 0 ? 120 : 220,
          page: 1,
        }),
      enabled: genreId > 0,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const genreTVQueries = useQueries({
    queries: topGenres.slice(0, 3).map((genreId, index) => ({
      queryKey: ["recommendations-v2-genre-tv", genreId, index],
      queryFn: () =>
        discoverTVShows({
          with_genres: genreId.toString(),
          sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
          "vote_count.gte": index === 0 ? 80 : 150,
          page: 1,
        }),
      enabled: genreId > 0,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const seedProfileQueries = useQueries({
    queries: seedSignals.map((seed) => ({
      queryKey: ["recommendations-v2-seed-profile", seed.type, seed.id],
      queryFn: () =>
        seed.type === "movie"
          ? getMovieRecommendationProfile(seed.id)
          : getTVRecommendationProfile(seed.id),
      enabled: seedSignals.length > 0,
      staleTime: 1000 * 60 * 30,
    })),
  });

  const similarQueries = useQueries({
    queries: seedSignals.map((seed) => ({
      queryKey: ["recommendations-v2-similar", seed.type, seed.id],
      queryFn: () =>
        seed.type === "movie"
          ? getSimilarMovies(seed.id)
          : getSimilarTVShows(seed.id),
      enabled: seedSignals.length > 0,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const recommendationQueries = useQueries({
    queries: seedSignals.map((seed) => ({
      queryKey: ["recommendations-v2-recommendations", seed.type, seed.id],
      queryFn: () =>
        seed.type === "movie"
          ? getMovieRecommendations(seed.id)
          : getTVShowRecommendations(seed.id),
      enabled: seedSignals.length > 0,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const normalizedSeedProfiles = useMemo(() => {
    const fromProfiles = seedProfileQueries
      .map((query, index) => {
        if (!query.data) return null;
        const seed = seedSignals[index];
        if (!seed) return null;

        return normalizeTmdbItem(query.data, {
          typeHint: seed.type,
          sourceTag: "seed-profile",
        });
      })
      .filter((item): item is UnifiedContentItem => item !== null);

    if (fromProfiles.length > 0) {
      return fromProfiles;
    }

    return watchHistory
      .slice(0, MAX_SEEDS)
      .map((item) =>
        normalizeTmdbItem(
          {
            id: item.content_id,
            title: item.title,
            name: item.title,
            overview: "",
            genre_ids: item.genres,
            original_language: item.language,
            release_date: item.content_type === "movie" ? "2000-01-01" : undefined,
            first_air_date: item.content_type === "tv" ? "2000-01-01" : undefined,
            vote_average: 0,
            vote_count: 0,
            popularity: 0,
            _content_type: item.content_type,
          },
          {
            typeHint: item.content_type,
            sourceTag: "seed-history-fallback",
            useCache: false,
          },
        ),
      )
      .filter((entry): entry is UnifiedContentItem => entry !== null);
  }, [seedProfileQueries, seedSignals, watchHistory]);

  const creatorDirectorIds = useMemo(() => {
    const scoreMap = new Map<number, number>();

    normalizedSeedProfiles.forEach((seedItem) => {
      const prioritizedPeople = [
        ...seedItem.directors,
        ...seedItem.creators,
      ].slice(0, 4);

      prioritizedPeople.forEach((person, index) => {
        const score = Math.max(1, 5 - index);
        scoreMap.set(person.id, (scoreMap.get(person.id) || 0) + score);
      });
    });

    return Array.from(scoreMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([personId]) => personId);
  }, [normalizedSeedProfiles]);

  const peopleMovieQueries = useQueries({
    queries: creatorDirectorIds.map((personId) => ({
      queryKey: ["recommendations-v2-people-movie", personId],
      queryFn: () =>
        discoverMovies({
          with_people: personId.toString(),
          sort_by: "popularity.desc",
          "vote_count.gte": 120,
          page: 1,
        }),
      enabled: creatorDirectorIds.length > 0,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const peopleTVQueries = useQueries({
    queries: creatorDirectorIds.map((personId) => ({
      queryKey: ["recommendations-v2-people-tv", personId],
      queryFn: () =>
        discoverTVShows({
          with_people: personId.toString(),
          sort_by: "popularity.desc",
          "vote_count.gte": 80,
          page: 1,
        }),
      enabled: creatorDirectorIds.length > 0,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const candidateUnion = useMemo(
    () =>
      buildCandidateUnion(
        [
          ...similarQueries.map((query, index) => ({
            source: `similar:${seedSignals[index]?.type || "unknown"}:${seedSignals[index]?.id || "x"}`,
            items: query.data?.results,
            typeHint: seedSignals[index]?.type,
          })),
          ...recommendationQueries.map((query, index) => ({
            source: `recommendations:${seedSignals[index]?.type || "unknown"}:${seedSignals[index]?.id || "x"}`,
            items: query.data?.results,
            typeHint: seedSignals[index]?.type,
          })),
          {
            source: "trending:movie:week",
            items: trendingMovies,
            typeHint: "movie" as const,
          },
          {
            source: "trending:tv:week",
            items: trendingTV,
            typeHint: "tv" as const,
          },
          ...genreMovieQueries.map((query, index) => ({
            source: `discover:movie:genre:${topGenres[index] || "none"}`,
            items: query.data?.results,
            typeHint: "movie" as const,
          })),
          ...genreTVQueries.map((query, index) => ({
            source: `discover:tv:genre:${topGenres[index] || "none"}`,
            items: query.data?.results,
            typeHint: "tv" as const,
          })),
          ...peopleMovieQueries.map((query, index) => ({
            source: `people:movie:${creatorDirectorIds[index] || "none"}`,
            items: query.data?.results,
            typeHint: "movie" as const,
          })),
          ...peopleTVQueries.map((query, index) => ({
            source: `people:tv:${creatorDirectorIds[index] || "none"}`,
            items: query.data?.results,
            typeHint: "tv" as const,
          })),
        ],
        MAX_CANDIDATES,
      ),
    [
      creatorDirectorIds,
      genreMovieQueries,
      genreTVQueries,
      peopleMovieQueries,
      peopleTVQueries,
      recommendationQueries,
      seedSignals,
      similarQueries,
      topGenres,
      trendingMovies,
      trendingTV,
    ],
  );

  const seenIds = useMemo(() => {
    const seen = new Set<string>();

    watchHistory.forEach((item) => {
      seen.add(getContentKey(item.content_type, item.content_id));
    });

    likedItems.forEach((item) => {
      seen.add(getContentKey(item.content_type, item.content_id));
    });

    feedbackItems.forEach((item) => {
      if (item.feedback_type === "skip") {
        seen.add(getContentKey(item.content_type, item.content_id));
      }
    });

    return seen;
  }, [feedbackItems, likedItems, watchHistory]);

  const rankedRecommendations = useMemo(() => {
    const ranked = getRecommendations(normalizedSeedProfiles, candidateUnion.items, {
      seedWeights,
      seenIds,
      popularityMedian: candidateUnion.popularityMedian,
      maxCandidates: MAX_CANDIDATES,
      diversificationTopN: DIVERSIFICATION_TOP_N,
    });

    const targetCount = hasStrongSignals ? 120 : hasPersonalizationData ? 96 : 84;
    return ranked.slice(0, targetCount);
  }, [
    candidateUnion.items,
    candidateUnion.popularityMedian,
    hasPersonalizationData,
    hasStrongSignals,
    normalizedSeedProfiles,
    seedWeights,
    seenIds,
  ]);

  const items = useMemo(
    () => rankedRecommendations.map((entry) => toDisplayItem(entry.item)),
    [rankedRecommendations],
  );

  const explanationById = useMemo(() => {
    const map: Record<string, RecommendationExplanation> = {};

    rankedRecommendations.forEach((entry) => {
      map[getContentKey(entry.item.type, entry.item.id)] = {
        reasons: entry.reasons.slice(0, 3),
        score: entry.score,
        scoreBreakdown: entry.scoreBreakdown,
        seedTitle: entry.seedTitle,
      };
    });

    return map;
  }, [rankedRecommendations]);

  useEffect(() => {
    if (!isDevelopment()) return;

    const sourceCoverage = rankedRecommendations.reduce((acc, entry) => {
      entry.sourceTags.forEach((source) => {
        acc[source] = (acc[source] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    console.debug("[recommendations:v2]", {
      seedCount: normalizedSeedProfiles.length,
      candidateCount: candidateUnion.items.length,
      rankedCount: rankedRecommendations.length,
      hiddenGemCount: rankedRecommendations.filter((entry) => entry.isHiddenGem).length,
      sourceCoverage,
    });
  }, [candidateUnion.items.length, normalizedSeedProfiles.length, rankedRecommendations]);

  const isAnyLoading = (
    queries: Array<{ isLoading: boolean; fetchStatus?: string }>,
  ): boolean =>
    queries.some((query) => query.isLoading || query.fetchStatus === "fetching");

  const isLoading =
    userDataLoading ||
    trendingMoviesLoading ||
    trendingTVLoading ||
    (hasPersonalizationData &&
      (isAnyLoading(genreMovieQueries) ||
        isAnyLoading(genreTVQueries) ||
        isAnyLoading(seedProfileQueries) ||
        isAnyLoading(similarQueries) ||
        isAnyLoading(recommendationQueries) ||
        isAnyLoading(peopleMovieQueries) ||
        isAnyLoading(peopleTVQueries)));

  return {
    items,
    isLoading,
    isPersonalized: hasPersonalizationData && hasStrongSignals && items.length > 0,
    explanationById,
  };
}
