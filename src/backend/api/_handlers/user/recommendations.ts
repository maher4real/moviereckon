/**
 * GET /api/user/recommendations
 * Build personalized recommendations server-side to avoid client fan-out requests.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import { getRedisKey, isRedisConfigured, runRedisCommand } from "../../lib/redis-rest.js";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import {
  discoverServerMovies,
  discoverServerTVShows,
  getServerMovieKeywords,
  getServerMovieRecommendationProfile,
  getServerMovieRecommendations,
  getServerNowPlayingMovies,
  getServerPopularTVShows,
  getServerSimilarMovies,
  getServerSimilarTVShows,
  getServerTopRatedMovies,
  getServerTVRecommendationProfile,
  getServerTVShowKeywords,
  getServerTVShowRecommendations,
  getServerTrendingMovies,
  getServerTrendingTVShows,
  getServerUpcomingMovies,
} from "@/backend/services/tmdbServer";
import {
  buildCandidateUnion,
  getContentKey,
  getRecommendations,
  normalizeTmdbItem,
  type RecommendationReason,
  type ScoreBreakdown,
  type UnifiedContentItem,
} from "@/shared/lib/recommendation";
import { enrichCandidatesWithKeywords } from "./recommendation-metadata";

type ContentType = "movie" | "tv";
type FeedbackType = "give_it_a_go" | "one_time_watch" | "must_watch" | "skip";
type RecommendationMode = "feed" | "more-like-this";

interface RecommendationRequestContext {
  mode: RecommendationMode;
  seedKeys: string[];
  displayedKeys: string[];
  genreId: number | null;
  language: string | null;
  contentType: ContentType | "all";
}

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

interface WatchlistItem {
  content_id: number;
  content_type: ContentType;
  title: string;
  added_at: string;
}

interface FeedbackItem {
  content_id: number;
  content_type: ContentType;
  feedback_type: FeedbackType;
  title: string;
  genres: number[];
}

interface UserPreferences {
  preferred_languages: string[];
  preferred_genres: number[];
  inferred_languages: string[];
  inferred_genres: number[];
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

const MAX_SEEDS = 10;
const MAX_CANDIDATES = 900;
const DIVERSIFICATION_TOP_N = 220;
const TIME_DECAY_THRESHOLD_DAYS = 7;
const CACHE_TTL_MS = 90 * 1000;
const CACHE_STALE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = Math.max(
  300,
  Number(process.env.RECOMMENDATIONS_CACHE_MAX_ENTRIES || 2_500),
);
const DB_TIMEOUT_MS = 4500;
const TMDB_TIMEOUT_MS = 6500;
const BUILD_TIMEOUT_MS = 12_000;
const METADATA_ENRICHMENT_TIMEOUT_MS = 1800;
const MAX_IP_REQUESTS = 70;
const MAX_USER_REQUESTS = 35;
const LANGUAGE_DISCOVERY_LIMIT = 4;
const CROSS_LANGUAGE_LIMIT = 2;
const LANGUAGE_GENRE_DISCOVERY_LIMIT = 2;
const KEYWORD_ENRICHMENT_LIMIT = 90;
const SOURCE_BOOSTS: Record<string, number> = {
  "recommendations:": 0.08,
  "similar:": 0.07,
  "people:": 0.05,
  "discover:": 0.03,
  "trending:": 0.02,
  "top-rated:": 0.025,
  "popular:": 0.02,
  "new-release:": 0.02,
};
const DISCOVERY_LANGUAGE_FALLBACKS = [
  "en",
  "hi",
  "ta",
  "te",
  "ml",
  "kn",
  "ko",
  "ja",
  "es",
  "fr",
] as const;

interface RecommendationCacheEntry {
  userId: string;
  revision: string;
  payload: RecommendationsPayload;
  expiresAt: number;
  staleUntil: number;
  updatedAt: number;
}

const recommendationsCache = new Map<string, RecommendationCacheEntry>();
const RECOMMENDATIONS_CACHE_VERSION = "v3";

const WEIGHTS = {
  LIKED: 1.5,
  WATCHLIST: 1.2,
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

function normalizeLanguageCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(normalized) ? normalized : null;
}

function getUrl(req: VercelRequest): URL {
  const host =
    typeof req.headers.host === "string" ? req.headers.host : "localhost";
  return new URL(req.url || "/api/user/recommendations", `http://${host}`);
}

function parseKeyList(searchParams: URLSearchParams, name: string): string[] {
  const values = searchParams.getAll(name).flatMap((value) => value.split(","));
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => /^(movie|tv)_\d+$/.test(value)),
    ),
  ).slice(0, 160);
}

function parseRecommendationRequest(req: VercelRequest): RecommendationRequestContext {
  const searchParams = getUrl(req).searchParams;
  const mode =
    searchParams.get("mode") === "more-like-this" ? "more-like-this" : "feed";
  const contentTypeParam = searchParams.get("content_type");
  const contentType =
    contentTypeParam === "movie" || contentTypeParam === "tv"
      ? contentTypeParam
      : "all";

  return {
    mode,
    seedKeys: parseKeyList(searchParams, "seed"),
    displayedKeys: parseKeyList(searchParams, "exclude"),
    genreId: toPositiveInteger(searchParams.get("genre")),
    language: normalizeLanguageCode(searchParams.get("language")),
    contentType,
  };
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

function toLanguageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  value.forEach((entry) => {
    const normalized = normalizeLanguageCode(entry);
    if (normalized) {
      unique.add(normalized);
    }
  });

  return Array.from(unique).slice(0, 10);
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

function toWatchlistItems(items: unknown[]): WatchlistItem[] {
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
        added_at: toTrimmedString(doc.added_at, new Date(0).toISOString()),
      } satisfies WatchlistItem;
    })
    .filter((item): item is WatchlistItem => item !== null)
    .sort((a, b) => b.added_at.localeCompare(a.added_at));
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
    preferred_languages: toLanguageList(doc.preferred_languages),
    preferred_genres: toGenreList(doc.preferred_genres),
    inferred_languages: toLanguageList(doc.inferred_languages),
    inferred_genres: toGenreList(doc.inferred_genres),
  };
}

function getLatest<T>(items: T[], resolver: (item: T) => string | undefined): string {
  if (!items.length) return "";
  const value = resolver(items[0]);
  return typeof value === "string" ? value : "";
}

function toSeedSlice(values: string[]): string {
  return values.slice(0, 6).join(",");
}

function addLanguageWeight(
  languageScores: Record<string, number>,
  language: string | null | undefined,
  weight: number,
): void {
  const normalized = normalizeLanguageCode(language);
  if (!normalized || !Number.isFinite(weight) || weight <= 0) return;
  languageScores[normalized] = (languageScores[normalized] || 0) + weight;
}

function selectTopLanguages(
  languageScores: Record<string, number>,
  limit: number,
): string[] {
  return Object.entries(languageScores)
    .sort(([, leftWeight], [, rightWeight]) => rightWeight - leftWeight)
    .slice(0, limit)
    .map(([language]) => language);
}

function getExplorationLanguages(
  prioritizedLanguages: string[],
  limit: number,
): string[] {
  const seen = new Set(prioritizedLanguages.map((language) => language.toLowerCase()));
  const exploration: string[] = [];

  for (const language of DISCOVERY_LANGUAGE_FALLBACKS) {
    if (seen.has(language)) continue;
    seen.add(language);
    exploration.push(language);
    if (exploration.length >= limit) {
      break;
    }
  }

  return exploration;
}

function buildRecommendationRevision(
  watchHistory: WatchHistoryItem[],
  likedItems: LikedItem[],
  watchlistItems: WatchlistItem[],
  feedbackItems: FeedbackItem[],
  preferences: UserPreferences,
): string {
  const watchSlice = toSeedSlice(
    watchHistory.map((item) => `${item.content_type}:${item.content_id}:${item.watched_at}`),
  );
  const likedSlice = toSeedSlice(
    likedItems.map((item) => `${item.content_type}:${item.content_id}:${item.liked_at}`),
  );
  const watchlistSlice = toSeedSlice(
    watchlistItems.map((item) => `${item.content_type}:${item.content_id}:${item.added_at}`),
  );
  const feedbackSlice = toSeedSlice(
    feedbackItems.map(
      (item) => `${item.content_type}:${item.content_id}:${item.feedback_type}`,
    ),
  );
  const languagePrefs = [...preferences.preferred_languages].sort().join(",");
  const genrePrefs = [...preferences.preferred_genres].sort((a, b) => a - b).join(",");
  const inferredLanguagePrefs = [...preferences.inferred_languages].sort().join(",");
  const inferredGenrePrefs = [...preferences.inferred_genres].sort((a, b) => a - b).join(",");

  return [
    `w:${watchHistory.length}:${getLatest(watchHistory, (item) => item.watched_at)}:${watchSlice}`,
    `l:${likedItems.length}:${getLatest(likedItems, (item) => item.liked_at)}:${likedSlice}`,
    `wl:${watchlistItems.length}:${getLatest(watchlistItems, (item) => item.added_at)}:${watchlistSlice}`,
    `f:${feedbackItems.length}:${feedbackSlice}`,
    `lang:${languagePrefs}`,
    `g:${genrePrefs}`,
    `ilang:${inferredLanguagePrefs}`,
    `ig:${inferredGenrePrefs}`,
  ].join("|");
}

function cleanupCache(now = Date.now()) {
  recommendationsCache.forEach((entry, key) => {
    if (entry.staleUntil <= now) {
      recommendationsCache.delete(key);
    }
  });

  evictOldestEntries(MAX_CACHE_ENTRIES);
}

function evictOldestEntries(maxEntries: number) {
  if (recommendationsCache.size <= maxEntries) return;

  const overflow = recommendationsCache.size - maxEntries;
  const sorted = Array.from(recommendationsCache.entries()).sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt,
  );

  for (let index = 0; index < overflow; index += 1) {
    const entry = sorted[index];
    if (!entry) break;
    recommendationsCache.delete(entry[0]);
  }
}

function getRecommendationsRedisKey(userId: string): string {
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return getRedisKey(`recommendations:${RECOMMENDATIONS_CACHE_VERSION}:${digest}`);
}

function isValidRecommendationsPayload(value: unknown): value is RecommendationsPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as RecommendationsPayload;
  return Array.isArray(payload.items) && typeof payload.explanationById === "object";
}

function toCacheEntry(value: unknown): RecommendationCacheEntry | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<RecommendationCacheEntry>;
  if (
    typeof parsed.userId !== "string" ||
    typeof parsed.revision !== "string" ||
    !isValidRecommendationsPayload(parsed.payload) ||
    typeof parsed.expiresAt !== "number" ||
    typeof parsed.staleUntil !== "number" ||
    typeof parsed.updatedAt !== "number"
  ) {
    return null;
  }

  return {
    userId: parsed.userId,
    revision: parsed.revision,
    payload: parsed.payload,
    expiresAt: parsed.expiresAt,
    staleUntil: parsed.staleUntil,
    updatedAt: parsed.updatedAt,
  };
}

async function readDistributedCacheEntry(userId: string): Promise<RecommendationCacheEntry | null> {
  if (!isRedisConfigured()) return null;

  const response = await runRedisCommand<string>(["GET", getRecommendationsRedisKey(userId)]);
  if (!response.ok || !response.result) return null;

  try {
    const parsed = JSON.parse(response.result);
    return toCacheEntry(parsed);
  } catch {
    return null;
  }
}

async function writeDistributedCacheEntry(entry: RecommendationCacheEntry): Promise<void> {
  if (!isRedisConfigured()) return;

  await runRedisCommand([
    "SET",
    getRecommendationsRedisKey(entry.userId),
    JSON.stringify(entry),
    "PX",
    CACHE_STALE_TTL_MS,
  ]);
}

async function readCachedPayload(
  userId: string,
  revision: string,
): Promise<RecommendationsPayload | null> {
  const now = Date.now();
  const local = recommendationsCache.get(userId);
  if (local && local.revision === revision && local.expiresAt > now) {
    return local.payload;
  }

  const distributed = await readDistributedCacheEntry(userId);
  if (!distributed) return null;

  recommendationsCache.set(userId, distributed);
  if (distributed.revision !== revision) return null;
  if (distributed.expiresAt <= now) return null;
  return distributed.payload;
}

async function readLatestUserPayload(
  userId: string,
  mode: "fresh" | "stale" = "stale",
): Promise<RecommendationsPayload | null> {
  const now = Date.now();
  const local = recommendationsCache.get(userId);
  if (local) {
    if (mode === "fresh" && local.expiresAt > now) return local.payload;
    if (mode === "stale" && local.staleUntil > now) return local.payload;
  }

  const distributed = await readDistributedCacheEntry(userId);
  if (!distributed) return null;
  recommendationsCache.set(userId, distributed);
  if (mode === "fresh" && distributed.expiresAt > now) return distributed.payload;
  if (mode === "stale" && distributed.staleUntil > now) return distributed.payload;
  return null;
}

async function writeCachedPayload(
  userId: string,
  revision: string,
  payload: RecommendationsPayload,
) {
  const now = Date.now();
  const entry: RecommendationCacheEntry = {
    userId,
    revision,
    payload,
    expiresAt: now + CACHE_TTL_MS,
    staleUntil: now + CACHE_STALE_TTL_MS,
    updatedAt: now,
  };
  recommendationsCache.set(userId, entry);
  cleanupCache(now);
  await writeDistributedCacheEntry(entry);
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
    return await withTimeout(promise, TMDB_TIMEOUT_MS);
  } catch {
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export function __clearRecommendationsCacheForTests() {
  recommendationsCache.clear();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  res.setHeader("Vary", "Cookie, Authorization");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const clientIp = getClientIp(req);
  const ipRateLimit = await consumeRateLimit(
    `recommendations:ip:${clientIp}`,
    MAX_IP_REQUESTS,
    5 * 60 * 1000,
  );
  const userRateLimit = await consumeRateLimit(
    `recommendations:user:${user.id}`,
    MAX_USER_REQUESTS,
    5 * 60 * 1000,
  );
  if (!ipRateLimit.allowed || !userRateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "user_recommendations",
      reason: "recommendation_limit",
      req,
      userId: user.id,
      metadata: {
        ip_source: ipRateLimit.source,
        user_source: userRateLimit.source,
      },
    });
    const retryAfter = Math.max(
      ipRateLimit.retryAfterSeconds,
      userRateLimit.retryAfterSeconds,
      30,
    );
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(429)
      .json({ error: "Too many recommendation requests. Please try again shortly." });
  }

  try {
    const requestContext = parseRecommendationRequest(req);
    const { db } = await connectToDatabase();

    const [
      watchHistoryDocs,
      likedItemsDocs,
      watchlistDocs,
      feedbackDocs,
      preferencesDoc,
    ] = await withTimeout(
      Promise.all([
        db
          .collection("watch_history")
          .find(
            { user_id: user.id },
            {
              projection: {
                content_id: 1,
                content_type: 1,
                title: 1,
                genres: 1,
                language: 1,
                watched_at: 1,
              },
            },
          )
          .sort({ watched_at: -1, _id: -1 })
          .limit(220)
          .toArray(),
        db
          .collection("liked_items")
          .find(
            { user_id: user.id },
            {
              projection: {
                content_id: 1,
                content_type: 1,
                title: 1,
                liked_at: 1,
              },
            },
          )
          .sort({ liked_at: -1, _id: -1 })
          .limit(180)
          .toArray(),
        db
          .collection("watchlist")
          .find(
            { user_id: user.id },
            {
              projection: {
                content_id: 1,
                content_type: 1,
                title: 1,
                added_at: 1,
              },
            },
          )
          .sort({ added_at: -1, _id: -1 })
          .limit(180)
          .toArray(),
        db
          .collection("content_feedback")
          .find(
            { user_id: user.id },
            {
              projection: {
                content_id: 1,
                content_type: 1,
                feedback_type: 1,
                title: 1,
                genres: 1,
                updated_at: 1,
                created_at: 1,
              },
            },
          )
          .sort({ updated_at: -1, created_at: -1, _id: -1 })
          .limit(180)
          .toArray(),
        db.collection("user_preferences").findOne(
          { user_id: user.id },
          { projection: { preferred_genres: 1, preferred_languages: 1, inferred_genres: 1, inferred_languages: 1 } },
        ),
      ]),
      DB_TIMEOUT_MS,
    );

    const watchHistory = toWatchHistory(watchHistoryDocs);
    const likedItems = toLikedItems(likedItemsDocs);
    const watchlistItems = toWatchlistItems(watchlistDocs);
    const feedbackItems = toFeedbackItems(feedbackDocs);
    const preferences = toPreferences(preferencesDoc);
    const revision = buildRecommendationRevision(
      watchHistory,
      likedItems,
      watchlistItems,
      feedbackItems,
      preferences,
    );
    const requestRevision = [
      revision,
      `mode:${requestContext.mode}`,
      `seed:${requestContext.seedKeys.join(",")}`,
      `exclude:${requestContext.displayedKeys.join(",")}`,
      `genre:${requestContext.genreId || "all"}`,
      `language:${requestContext.language || "all"}`,
      `type:${requestContext.contentType}`,
    ].join("|");
    cleanupCache();

    const cachedPayload = await readCachedPayload(user.id, requestRevision);
    if (cachedPayload) {
      return res.status(200).json({ data: cachedPayload });
    }

    const payload = await withTimeout(
      (async (): Promise<RecommendationsPayload> => {
        const genreScores: Record<number, number> = {};
        const languageScores: Record<string, number> = {};
        const watchHistoryByContentKey = new Map(
          watchHistory.map((entry) => [getContentKey(entry.content_type, entry.content_id), entry]),
        );

        likedItems.forEach((item) => {
          const watched = watchHistoryByContentKey.get(
            getContentKey(item.content_type, item.content_id),
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
          addLanguageWeight(
            languageScores,
            item.language,
            baseWeight * recentBoost * (item.content_type === "movie" ? 1.12 : 0.9),
          );
          item.genres.forEach((genreId) => {
            genreScores[genreId] = (genreScores[genreId] || 0) + baseWeight * recentBoost;
          });
        });

        feedbackItems.forEach((item) => {
          if (!item.genres?.length) return;
          if (item.feedback_type === "skip") {
            // Skipped items slightly suppress those genres
            item.genres.forEach((genreId) => {
              genreScores[genreId] = (genreScores[genreId] || 0) - 0.4;
            });
            return;
          }
          const feedbackWeight = getFeedbackWeight(item.feedback_type);
          item.genres.forEach((genreId) => {
            genreScores[genreId] = (genreScores[genreId] || 0) + feedbackWeight;
          });
        });

        // Explicit preferences get strong boosts — user set these intentionally
        preferences.preferred_genres.forEach((genreId, index) => {
          const boost = Math.max(1.2, 2.5 - index * 0.15);
          genreScores[genreId] = (genreScores[genreId] || 0) + boost;
        });

        preferences.preferred_languages.forEach((language, index) => {
          addLanguageWeight(languageScores, language, Math.max(1.2, 2.8 - index * 0.2));
        });

        preferences.inferred_genres.forEach((genreId, index) => {
          const boost = Math.max(0.55, 1.2 - index * 0.08);
          genreScores[genreId] = (genreScores[genreId] || 0) + boost;
        });

        preferences.inferred_languages.forEach((language, index) => {
          addLanguageWeight(languageScores, language, Math.max(0.5, 1.15 - index * 0.08));
        });

        const topGenres = Object.entries(genreScores)
          .filter(([, score]) => score > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 6)
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

        watchlistItems.forEach((item) => {
          pushSeed(seedMap, {
            id: item.content_id,
            type: item.content_type,
            title: item.title,
            weight: WEIGHTS.WATCHLIST * recencyMultiplier(item.added_at),
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

        if (requestContext.mode === "more-like-this") {
          requestContext.seedKeys.forEach((key, index) => {
            const [type, idText] = key.split("_");
            const id = toPositiveInteger(idText);
            if ((type === "movie" || type === "tv") && id) {
              pushSeed(seedMap, {
                id,
                type,
                title: `Selected ${type}`,
                weight: Math.max(1.6, 2.2 - index * 0.12),
              });
            }
          });
        }

        const seedSignals = Array.from(seedMap.values())
          .sort((a, b) => b.weight - a.weight)
          .slice(0, MAX_SEEDS);

        const hasExplicitPreferences =
          preferences.preferred_genres.length > 0 ||
          preferences.preferred_languages.length > 0;
        const hasPersonalizationData =
          seedSignals.length > 0 || topGenres.length > 0 || feedbackItems.length > 0;
        const hasStrongSignals =
          watchHistory.length >= 4 || likedItems.length >= 3 || feedbackItems.length >= 3;

        const seedWeights: Record<string, number> = {};
        seedSignals.forEach((seed) => {
          seedWeights[getContentKey(seed.type, seed.id)] = seed.weight;
        });

    const [trendingMovies, trendingTV, topRatedMovies, popularTV, nowPlaying, upcoming] =
      await Promise.all([
        safe(getServerTrendingMovies("week")),
        safe(getServerTrendingTVShows("week")),
        safe(getServerTopRatedMovies(1)),
        safe(getServerPopularTVShows(1)),
        safe(getServerNowPlayingMovies(1)),
        safe(getServerUpcomingMovies(1)),
      ]);

    const requestGenreFilter = requestContext.genreId
      ? requestContext.genreId.toString()
      : undefined;
    const requestLanguageFilter = requestContext.language || undefined;

    const genreMovieResults = await Promise.all(
      topGenres.slice(0, 5).flatMap((genreId, index) =>
        [1, 2].map((page) =>
          safe(
            discoverServerMovies({
              with_genres: requestGenreFilter || genreId.toString(),
              with_original_language: requestLanguageFilter,
              sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
              "vote_count.gte": index === 0 ? 100 : 180,
              page,
            }),
          ),
        ),
      ),
    );

    const genreTVResults = await Promise.all(
      topGenres.slice(0, 5).flatMap((genreId, index) =>
        [1, 2].map((page) =>
          safe(
            discoverServerTVShows({
              with_genres: requestGenreFilter || genreId.toString(),
              with_original_language: requestLanguageFilter,
              sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
              "vote_count.gte": index === 0 ? 60 : 120,
              page,
            }),
          ),
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

    seedProfilesForRanking.forEach((seedItem, index) => {
      addLanguageWeight(
        languageScores,
        seedItem.originalLanguage,
        (seedSignals[index]?.weight || 1) * 1.1,
      );
    });

    const prioritizedLanguages = selectTopLanguages(languageScores, 3);
    const explorationLanguages = getExplorationLanguages(
      prioritizedLanguages,
      CROSS_LANGUAGE_LIMIT,
    );
    const discoveryLanguages = Array.from(
      new Set([...prioritizedLanguages, ...explorationLanguages]),
    ).slice(0, LANGUAGE_DISCOVERY_LIMIT);

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

    const languageMovieResults = await Promise.all(
      discoveryLanguages.map((language, index) =>
        safe(
          discoverServerMovies({
            with_original_language: language,
            with_genres: requestGenreFilter,
            sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
            "vote_count.gte": index === 0 ? 90 : 140,
            page: 1,
          }),
        ),
      ),
    );

    const languageTVResults = await Promise.all(
      discoveryLanguages.map((language, index) =>
        safe(
          discoverServerTVShows({
            with_original_language: language,
            with_genres: requestGenreFilter,
            sort_by: index === 0 ? "popularity.desc" : "vote_average.desc",
            "vote_count.gte": index === 0 ? 70 : 120,
            page: 1,
          }),
        ),
      ),
    );

    const languageGenreSources = discoveryLanguages
      .slice(0, LANGUAGE_GENRE_DISCOVERY_LIMIT)
      .flatMap((language) =>
        topGenres.slice(0, LANGUAGE_GENRE_DISCOVERY_LIMIT).map((genreId) => ({
          language,
          genreId,
        })),
      );

    const languageGenreMovieResults = await Promise.all(
      languageGenreSources.map(({ language, genreId }) =>
        safe(
          discoverServerMovies({
            with_original_language: requestLanguageFilter || language,
            with_genres: requestGenreFilter || genreId.toString(),
            sort_by: "vote_average.desc",
            "vote_count.gte": 60,
            page: 1,
          }),
        ),
      ),
    );

    const languageGenreTVResults = await Promise.all(
      languageGenreSources.map(({ language, genreId }) =>
        safe(
          discoverServerTVShows({
            with_original_language: requestLanguageFilter || language,
            with_genres: requestGenreFilter || genreId.toString(),
            sort_by: "vote_average.desc",
            "vote_count.gte": 50,
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
        {
          source: "top-rated:movie:p1",
          items: topRatedMovies?.results,
          typeHint: "movie" as const,
        },
        {
          source: "popular:tv:p1",
          items: popularTV?.results,
          typeHint: "tv" as const,
        },
        {
          source: "new-release:movie:now-playing:p1",
          items: nowPlaying?.results,
          typeHint: "movie" as const,
        },
        {
          source: "new-release:movie:upcoming:p1",
          items: upcoming?.results,
          typeHint: "movie" as const,
        },
        ...genreMovieResults.map((result, index) => ({
          source: `discover:movie:genre:${topGenres[Math.floor(index / 2)] || "none"}:p${(index % 2) + 1}`,
          items: result?.results,
          typeHint: "movie" as const,
        })),
        ...genreTVResults.map((result, index) => ({
          source: `discover:tv:genre:${topGenres[Math.floor(index / 2)] || "none"}:p${(index % 2) + 1}`,
          items: result?.results,
          typeHint: "tv" as const,
        })),
        ...languageMovieResults.map((result, index) => ({
          source: `discover:movie:language:${discoveryLanguages[index] || "none"}`,
          items: result?.results,
          typeHint: "movie" as const,
        })),
        ...languageTVResults.map((result, index) => ({
          source: `discover:tv:language:${discoveryLanguages[index] || "none"}`,
          items: result?.results,
          typeHint: "tv" as const,
        })),
        ...languageGenreMovieResults.map((result, index) => ({
          source: `discover:movie:language-genre:${languageGenreSources[index]?.language || "none"}:${languageGenreSources[index]?.genreId || "none"}`,
          items: result?.results,
          typeHint: "movie" as const,
        })),
        ...languageGenreTVResults.map((result, index) => ({
          source: `discover:tv:language-genre:${languageGenreSources[index]?.language || "none"}:${languageGenreSources[index]?.genreId || "none"}`,
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

    const contentFilteredCandidates =
      requestContext.contentType === "all"
        ? candidateUnion.items
        : candidateUnion.items.filter((item) => item.type === requestContext.contentType);

    const enrichedCandidates = await withTimeout(
      enrichCandidatesWithKeywords(contentFilteredCandidates, {
        fetchMovieKeywords: (id) =>
          safe(getServerMovieKeywords(id)).then((value) => value || []),
        fetchTVKeywords: (id) =>
          safe(getServerTVShowKeywords(id)).then((value) => value || []),
        limit: KEYWORD_ENRICHMENT_LIMIT,
        deadlineMs: METADATA_ENRICHMENT_TIMEOUT_MS,
      }),
      METADATA_ENRICHMENT_TIMEOUT_MS,
    ).catch(() => contentFilteredCandidates);

    const seenIds = new Set<string>();

    watchHistory.forEach((item) => {
      seenIds.add(getContentKey(item.content_type, item.content_id));
    });

    likedItems.forEach((item) => {
      seenIds.add(getContentKey(item.content_type, item.content_id));
    });

    watchlistItems.forEach((item) => {
      seenIds.add(getContentKey(item.content_type, item.content_id));
    });

    feedbackItems.forEach((item) => {
      if (item.feedback_type === "skip") {
        seenIds.add(getContentKey(item.content_type, item.content_id));
      }
    });

    requestContext.displayedKeys.forEach((key) => seenIds.add(key));

    const negativeGenreIds = Array.from(
      new Set(
        feedbackItems
          .filter((item) => item.feedback_type === "skip")
          .flatMap((item) => item.genres),
      ),
    );

    const rankedRecommendations = getRecommendations(
      seedProfilesForRanking,
      enrichedCandidates,
      {
        seedWeights,
        seenIds,
        preferredLanguages: prioritizedLanguages,
        preferredGenres: preferences.preferred_genres,
        negativeGenreIds,
        dominantLanguage: prioritizedLanguages[0] || null,
        popularityMedian: candidateUnion.popularityMedian,
        maxCandidates: MAX_CANDIDATES,
        diversificationTopN: DIVERSIFICATION_TOP_N,
        sourceBoosts: SOURCE_BOOSTS,
      },
    );

        const targetCount = hasStrongSignals ? 220 : hasPersonalizationData ? 180 : 150;
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
          isPersonalized:
            hasPersonalizationData && (hasStrongSignals || hasExplicitPreferences) && items.length > 0,
          explanationById,
        };

        return payload;
      })(),
      BUILD_TIMEOUT_MS,
    );

    await writeCachedPayload(user.id, requestRevision, payload);
    return res.status(200).json({ data: payload });
  } catch (error) {
    console.error("Recommendations handler error:", error);
    emitSecurityEvent({
      type: "recommendations_error",
      outcome: "error",
      route: "user_recommendations",
      reason: "build_or_dependency_error",
      req,
      userId: user.id,
    });
    const fallbackPayload = await readLatestUserPayload(user.id, "stale");
    if (fallbackPayload) {
      res.setHeader("X-Recommendations-Fallback", "stale-cache");
      return res.status(200).json({ data: fallbackPayload });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
