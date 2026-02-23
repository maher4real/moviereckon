/**
 * GET /api/user/recommendations
 * Build personalized recommendations server-side to avoid client fan-out requests.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import type { Movie, TVShow } from "@/lib/tmdb";
import {
  discoverServerMovies,
  discoverServerTVShows,
  getServerMovieRecommendationProfile,
  getServerMovieRecommendations,
  getServerSimilarMovies,
  getServerSimilarTVShows,
  getServerTVRecommendationProfile,
  getServerTVShowRecommendations,
  getServerTrendingMovies,
  getServerTrendingTVShows,
} from "@/lib/server/tmdbServer";
import {
  buildCandidateUnion,
  getContentKey,
  getRecommendations,
  normalizeTmdbItem,
  type RecommendationReason,
  type ScoreBreakdown,
  type UnifiedContentItem,
} from "@/lib/recommendation";

type ContentType = "movie" | "tv";
type FeedbackType = "give_it_a_go" | "one_time_watch" | "must_watch" | "skip";

interface WatchHistoryItem {
  content_id: number;
  content_type: ContentType;
  title: string;
  genres: number[];
  language: string;
  watched_at: string;
}

interface LikedItem {
  content_id: number;
  content_type: ContentType;
  title: string;
  liked_at: string;
}

interface FeedbackItem {
  content_id: number;
  content_type: ContentType;
  feedback_type: FeedbackType;
  title: string;
  genres: number[];
}

interface UserPreferences {
  preferred_genres: number[];
}

interface SeedSignal {
  id: number;
  type: ContentType;
  title: string;
  weight: number;
}

interface RecommendationExplanation {
  reasons: RecommendationReason[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
  seedTitle: string | null;
}

interface RecommendationsPayload {
  items: (Movie | TVShow)[];
  isPersonalized: boolean;
  explanationById: Record<string, RecommendationExplanation>;
}

interface TMDBListPayload {
  results?: unknown[];
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

function toContentType(value: unknown): ContentType | null {
  if (value === "movie" || value === "tv") return value;
  return null;
}

function toFeedbackType(value: unknown): FeedbackType | null {
  if (
    value === "give_it_a_go" ||
    value === "one_time_watch" ||
    value === "must_watch" ||
    value === "skip"
  ) {
    return value;
  }
  return null;
}

function toPositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

function toTrimmedString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function toGenreList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();
  value.forEach((entry) => {
    const genreId = toPositiveInteger(entry);
    if (genreId) unique.add(genreId);
  });
  return Array.from(unique).slice(0, 24);
}

function toWatchHistory(items: unknown[]): WatchHistoryItem[] {
  return items
    .map((item) => {
      const doc = (item || {}) as Record<string, unknown>;
      const contentId = toPositiveInteger(doc.content_id);
      const contentType = toContentType(doc.content_type);
      if (!contentId || !contentType) return null;

      return {
        content_id: contentId,
        content_type: contentType,
        title: toTrimmedString(doc.title, "Untitled"),
        genres: toGenreList(doc.genres),
        language: toTrimmedString(doc.language, "en"),
        watched_at: toTrimmedString(doc.watched_at, new Date(0).toISOString()),
      } satisfies WatchHistoryItem;
    })
    .filter((item): item is WatchHistoryItem => item !== null)
    .sort((a, b) => b.watched_at.localeCompare(a.watched_at));
}

function toLikedItems(items: unknown[]): LikedItem[] {
  return items
    .map((item) => {
      const doc = (item || {}) as Record<string, unknown>;
      const contentId = toPositiveInteger(doc.content_id);
      const contentType = toContentType(doc.content_type);
      if (!contentId || !contentType) return null;

      return {
        content_id: contentId,
        content_type: contentType,
        title: toTrimmedString(doc.title, "Untitled"),
        liked_at: toTrimmedString(doc.liked_at, new Date(0).toISOString()),
      } satisfies LikedItem;
    })
    .filter((item): item is LikedItem => item !== null)
    .sort((a, b) => b.liked_at.localeCompare(a.liked_at));
}

function toFeedbackItems(items: unknown[]): FeedbackItem[] {
  return items
    .map((item) => {
      const doc = (item || {}) as Record<string, unknown>;
      const contentId = toPositiveInteger(doc.content_id);
      const contentType = toContentType(doc.content_type);
      const feedbackType = toFeedbackType(doc.feedback_type);
      if (!contentId || !contentType || !feedbackType) return null;

      return {
        content_id: contentId,
        content_type: contentType,
        feedback_type: feedbackType,
        title: toTrimmedString(doc.title, "Untitled"),
        genres: toGenreList(doc.genres),
      } satisfies FeedbackItem;
    })
    .filter((item): item is FeedbackItem => item !== null);
}

function toPreferences(value: unknown): UserPreferences {
  const doc = (value || {}) as Record<string, unknown>;
  return {
    preferred_genres: toGenreList(doc.preferred_genres),
  };
}

function pushSeed(map: Map<string, SeedSignal>, seed: SeedSignal): void {
  const key = getContentKey(seed.type, seed.id);
  const existing = map.get(key);

  if (!existing || seed.weight > existing.weight) {
    map.set(key, seed);
  }
}

function getFeedbackWeight(type: FeedbackType): number {
  if (type === "must_watch") return WEIGHTS.FEEDBACK_MUST_WATCH;
  if (type === "give_it_a_go") return WEIGHTS.FEEDBACK_GIVE_IT_A_GO;
  return WEIGHTS.FEEDBACK_ONE_TIME;
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

async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const { db } = await connectToDatabase();

    const [watchHistoryDocs, likedItemsDocs, feedbackDocs, preferencesDoc] = await Promise.all([
      db
        .collection("watch_history")
        .find({ user_id: user.id })
        .sort({ watched_at: -1 })
        .limit(220)
        .toArray(),
      db
        .collection("liked_items")
        .find({ user_id: user.id })
        .sort({ liked_at: -1 })
        .limit(180)
        .toArray(),
      db
        .collection("content_feedback")
        .find({ user_id: user.id })
        .sort({ updated_at: -1, created_at: -1 })
        .limit(180)
        .toArray(),
      db.collection("user_preferences").findOne({ user_id: user.id }),
    ]);

    const watchHistory = toWatchHistory(watchHistoryDocs);
    const likedItems = toLikedItems(likedItemsDocs);
    const feedbackItems = toFeedbackItems(feedbackDocs);
    const preferences = toPreferences(preferencesDoc);

    const genreScores: Record<number, number> = {};

    likedItems.forEach((item) => {
      const watched = watchHistory.find(
        (entry) =>
          entry.content_id === item.content_id &&
          entry.content_type === item.content_type,
      );

      if (!watched?.genres?.length) return;

      const weight = WEIGHTS.LIKED * recencyMultiplier(item.liked_at);
      watched.genres.forEach((genreId) => {
        genreScores[genreId] = (genreScores[genreId] || 0) + weight;
      });
    });

    watchHistory.forEach((item) => {
      if (!item.genres?.length) return;
      const recentBoost = recencyMultiplier(item.watched_at);
      const baseWeight =
        recentBoost >= 0.95 ? WEIGHTS.WATCHED_RECENT : WEIGHTS.WATCHED_OLD;
      item.genres.forEach((genreId) => {
        genreScores[genreId] = (genreScores[genreId] || 0) + baseWeight * recentBoost;
      });
    });

    feedbackItems.forEach((item) => {
      if (!item.genres?.length || item.feedback_type === "skip") return;
      const feedbackWeight = getFeedbackWeight(item.feedback_type);

      item.genres.forEach((genreId) => {
        genreScores[genreId] = (genreScores[genreId] || 0) + feedbackWeight;
      });
    });

    preferences.preferred_genres.forEach((genreId) => {
      genreScores[genreId] = (genreScores[genreId] || 0) + 0.85;
    });

    const topGenres = Object.entries(genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([genreId]) => Number(genreId));

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
      pushSeed(seedMap, {
        id: item.content_id,
        type: item.content_type,
        title: item.title,
        weight: WEIGHTS.WATCHED_RECENT * recencyMultiplier(item.watched_at),
      });
    });

    feedbackItems.forEach((item) => {
      if (item.feedback_type === "skip") return;
      pushSeed(seedMap, {
        id: item.content_id,
        type: item.content_type,
        title: item.title,
        weight: getFeedbackWeight(item.feedback_type),
      });
    });

    const seedSignals = Array.from(seedMap.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_SEEDS);

    const hasPersonalizationData =
      seedSignals.length > 0 || topGenres.length > 0 || feedbackItems.length > 0;
    const hasStrongSignals =
      watchHistory.length >= 4 || likedItems.length >= 3 || feedbackItems.length >= 3;

    const seedWeights: Record<string, number> = {};
    seedSignals.forEach((seed) => {
      seedWeights[getContentKey(seed.type, seed.id)] = seed.weight;
    });

    const [trendingMovies, trendingTV] = await Promise.all([
      safe(getServerTrendingMovies("week")),
      safe(getServerTrendingTVShows("week")),
    ]);

    const genreMovieResults = await Promise.all(
      topGenres.slice(0, 3).map((genreId, index) =>
        safe(
          discoverServerMovies({
            with_genres: genreId.toString(),
            sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
            "vote_count.gte": index === 0 ? 120 : 220,
            page: 1,
          }),
        ),
      ),
    );

    const genreTVResults = await Promise.all(
      topGenres.slice(0, 3).map((genreId, index) =>
        safe(
          discoverServerTVShows({
            with_genres: genreId.toString(),
            sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
            "vote_count.gte": index === 0 ? 80 : 150,
            page: 1,
          }),
        ),
      ),
    );

    const seedProfiles = await Promise.all(
      seedSignals.map((seed) =>
        safe<unknown>(
          seed.type === "movie"
            ? getServerMovieRecommendationProfile(seed.id)
            : getServerTVRecommendationProfile(seed.id),
        ),
      ),
    );

    const similarResults = await Promise.all(
      seedSignals.map((seed) =>
        safe<TMDBListPayload>(
          seed.type === "movie"
            ? getServerSimilarMovies(seed.id)
            : getServerSimilarTVShows(seed.id),
        ),
      ),
    );

    const recommendationResults = await Promise.all(
      seedSignals.map((seed) =>
        safe<TMDBListPayload>(
          seed.type === "movie"
            ? getServerMovieRecommendations(seed.id)
            : getServerTVShowRecommendations(seed.id),
        ),
      ),
    );

    const normalizedSeedProfiles = seedProfiles
      .map((data, index) => {
        if (!data) return null;
        const seed = seedSignals[index];
        if (!seed) return null;

        return normalizeTmdbItem(data, {
          typeHint: seed.type,
          sourceTag: "seed-profile",
        });
      })
      .filter((item): item is UnifiedContentItem => item !== null);

    const seedProfilesForRanking =
      normalizedSeedProfiles.length > 0
        ? normalizedSeedProfiles
        : watchHistory
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

    const creatorScoreMap = new Map<number, number>();
    seedProfilesForRanking.forEach((seedItem) => {
      const prioritizedPeople = [...seedItem.directors, ...seedItem.creators].slice(0, 4);

      prioritizedPeople.forEach((person, index) => {
        const score = Math.max(1, 5 - index);
        creatorScoreMap.set(person.id, (creatorScoreMap.get(person.id) || 0) + score);
      });
    });

    const creatorDirectorIds = Array.from(creatorScoreMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([personId]) => personId);

    const peopleMovieResults = await Promise.all(
      creatorDirectorIds.map((personId) =>
        safe(
          discoverServerMovies({
            with_people: personId.toString(),
            sort_by: "popularity.desc",
            "vote_count.gte": 120,
            page: 1,
          }),
        ),
      ),
    );

    const peopleTVResults = await Promise.all(
      creatorDirectorIds.map((personId) =>
        safe(
          discoverServerTVShows({
            with_people: personId.toString(),
            sort_by: "popularity.desc",
            "vote_count.gte": 80,
            page: 1,
          }),
        ),
      ),
    );

    const candidateUnion = buildCandidateUnion(
      [
        ...similarResults.map((result, index) => ({
          source: `similar:${seedSignals[index]?.type || "unknown"}:${seedSignals[index]?.id || "x"}`,
          items: result?.results,
          typeHint: seedSignals[index]?.type,
        })),
        ...recommendationResults.map((result, index) => ({
          source: `recommendations:${seedSignals[index]?.type || "unknown"}:${seedSignals[index]?.id || "x"}`,
          items: result?.results,
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
        ...genreMovieResults.map((result, index) => ({
          source: `discover:movie:genre:${topGenres[index] || "none"}`,
          items: result?.results,
          typeHint: "movie" as const,
        })),
        ...genreTVResults.map((result, index) => ({
          source: `discover:tv:genre:${topGenres[index] || "none"}`,
          items: result?.results,
          typeHint: "tv" as const,
        })),
        ...peopleMovieResults.map((result, index) => ({
          source: `people:movie:${creatorDirectorIds[index] || "none"}`,
          items: result?.results,
          typeHint: "movie" as const,
        })),
        ...peopleTVResults.map((result, index) => ({
          source: `people:tv:${creatorDirectorIds[index] || "none"}`,
          items: result?.results,
          typeHint: "tv" as const,
        })),
      ],
      MAX_CANDIDATES,
    );

    const seenIds = new Set<string>();

    watchHistory.forEach((item) => {
      seenIds.add(getContentKey(item.content_type, item.content_id));
    });

    likedItems.forEach((item) => {
      seenIds.add(getContentKey(item.content_type, item.content_id));
    });

    feedbackItems.forEach((item) => {
      if (item.feedback_type === "skip") {
        seenIds.add(getContentKey(item.content_type, item.content_id));
      }
    });

    const rankedRecommendations = getRecommendations(
      seedProfilesForRanking,
      candidateUnion.items,
      {
        seedWeights,
        seenIds,
        popularityMedian: candidateUnion.popularityMedian,
        maxCandidates: MAX_CANDIDATES,
        diversificationTopN: DIVERSIFICATION_TOP_N,
      },
    );

    const targetCount = hasStrongSignals ? 120 : hasPersonalizationData ? 96 : 84;
    const cappedRecommendations = rankedRecommendations.slice(0, targetCount);

    const items = cappedRecommendations.map((entry) => toDisplayItem(entry.item));

    const explanationById: Record<string, RecommendationExplanation> = {};
    cappedRecommendations.forEach((entry) => {
      explanationById[getContentKey(entry.item.type, entry.item.id)] = {
        reasons: entry.reasons.slice(0, 3),
        score: entry.score,
        scoreBreakdown: entry.scoreBreakdown,
        seedTitle: entry.seedTitle,
      };
    });

    const payload: RecommendationsPayload = {
      items,
      isPersonalized: hasPersonalizationData && hasStrongSignals && items.length > 0,
      explanationById,
    };

    return res.status(200).json({ data: payload });
  } catch (error) {
    console.error("Recommendations handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
