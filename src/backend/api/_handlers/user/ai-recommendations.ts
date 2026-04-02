/**
 * GET /api/user/ai-recommendations
 *
 * AI-powered recommendation layer using OpenAI embeddings + GPT-4o-mini.
 * Pipeline:
 *  1. Load user signals (watch history, likes, feedback) from MongoDB.
 *  2. Fetch candidate pool from TMDB (trending + top-rated + genre-matched).
 *  3. Build user taste text → embed to a single taste vector.
 *  4. Embed each candidate (cached in Redis, 7-day TTL).
 *  5. Cosine similarity ranking.
 *  6. GPT-4o-mini generates a one-sentence explanation for each top result.
 *  7. Return ranked items + explanations.
 *
 * Falls back gracefully — any step failure returns an empty payload.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { getRedisKey, isRedisConfigured, runRedisCommand } from "../../lib/redis-rest.js";
import {
  isOpenAIConfigured,
  embedTexts,
  cosineSimilarity,
  averageEmbeddings,
  generateExplanations,
} from "../../lib/openai.js";
import {
  getServerTrendingMovies,
  getServerTrendingTVShows,
  getServerTopRatedMovies,
  getServerPopularTVShows,
} from "@/backend/services/tmdbServer";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_IP_REQUESTS = 30;
const MAX_USER_REQUESTS = 15;
const RATE_WINDOW_MS = 5 * 60 * 1000;

const EMBED_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const RESULT_CACHE_TTL_SECONDS = 5 * 60;     // 5 minutes

const MAX_HISTORY_SEEDS = 20;
const MAX_LIKED_SEEDS = 15;
const MAX_CANDIDATES = 120;
const TOP_N_FOR_EXPLANATIONS = 25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContentType = "movie" | "tv";
type FeedbackType = "give_it_a_go" | "one_time_watch" | "must_watch" | "skip";

interface UserSignal {
  content_id: number;
  content_type: ContentType;
  title: string;
  genres: number[];
  language: string;
  weight: number;
}

interface AICandidate {
  item: Movie | TVShow;
  type: ContentType;
  embedText: string;
}

interface AIRecommendation {
  item: Movie | TVShow;
  type: ContentType;
  aiScore: number;
  explanation: string;
}

export interface AIRecommendationsPayload {
  items: (Movie | TVShow)[];
  explanationById: Record<string, { label: string; text: string }>;
  isAIRanked: true;
}

const EMPTY_PAYLOAD: AIRecommendationsPayload = {
  items: [],
  explanationById: {},
  isAIRanked: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GENRE_NAMES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

function genreNames(ids: number[]): string {
  return ids.map((id) => GENRE_NAMES[id] || "").filter(Boolean).join(", ");
}

function candidateEmbedText(item: Movie | TVShow, type: ContentType): string {
  const title = type === "movie" ? (item as Movie).title : (item as TVShow).name;
  const overview = item.overview?.slice(0, 200) || "";
  const genres = genreNames(item.genre_ids || []);
  const year = (type === "movie"
    ? (item as Movie).release_date
    : (item as TVShow).first_air_date
  )?.slice(0, 4) || "";
  const lang = item.original_language || "";

  return `${title}. ${overview}. Genres: ${genres}. Year: ${year}. Language: ${lang}`.trim();
}

function buildTasteProfile(signals: UserSignal[]): string {
  if (!signals.length) return "Enjoys popular movies and TV shows";

  const top = signals.slice(0, 12);
  const titles = top.map((s) => s.title).join(", ");
  const allGenreIds = signals.flatMap((s) => s.genres);
  const genreCount = new Map<number, number>();
  for (const id of allGenreIds) genreCount.set(id, (genreCount.get(id) || 0) + 1);
  const topGenres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => GENRE_NAMES[id])
    .filter(Boolean)
    .join(", ");

  const langs = [...new Set(signals.map((s) => s.language))].slice(0, 3).join(", ");

  return `Watches and enjoys: ${titles}. Favourite genres: ${topGenres || "various"}. Preferred languages: ${langs || "various"}.`;
}

// ---------------------------------------------------------------------------
// Redis embedding cache helpers
// ---------------------------------------------------------------------------

async function getCachedEmbedding(key: string): Promise<number[] | null> {
  if (!isRedisConfigured()) return null;
  const result = await runRedisCommand<string>(["GET", getRedisKey(key)]);
  if (!result.ok || !result.result) return null;
  try {
    return JSON.parse(result.result) as number[];
  } catch {
    return null;
  }
}

async function setCachedEmbedding(key: string, vector: number[]): Promise<void> {
  if (!isRedisConfigured()) return;
  await runRedisCommand(["SET", getRedisKey(key), JSON.stringify(vector), "EX", EMBED_TTL_SECONDS]);
}

async function getCachedResult(key: string): Promise<AIRecommendationsPayload | null> {
  if (!isRedisConfigured()) return null;
  const result = await runRedisCommand<string>(["GET", getRedisKey(key)]);
  if (!result.ok || !result.result) return null;
  try {
    return JSON.parse(result.result) as AIRecommendationsPayload;
  } catch {
    return null;
  }
}

async function setCachedResult(key: string, payload: AIRecommendationsPayload): Promise<void> {
  if (!isRedisConfigured()) return;
  await runRedisCommand(["SET", getRedisKey(key), JSON.stringify(payload), "EX", RESULT_CACHE_TTL_SECONDS]);
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

async function buildAIRecommendations(
  userId: string,
  signals: UserSignal[],
  seenIds: Set<string>,
): Promise<AIRecommendationsPayload> {

  // 1. Fetch candidate pool from TMDB in parallel
  const [trendingMovies, trendingTV, topRated, popularTV] = await Promise.allSettled([
    getServerTrendingMovies("week"),
    getServerTrendingTVShows("week"),
    getServerTopRatedMovies(1),
    getServerPopularTVShows(1),
  ]);

  const movieCandidates: AICandidate[] = [];
  const tvCandidates: AICandidate[] = [];

  const addMovies = (movies: Movie[]) => {
    for (const m of movies) {
      if (!seenIds.has(`movie:${m.id}`) && m.overview) {
        movieCandidates.push({ item: m, type: "movie", embedText: candidateEmbedText(m, "movie") });
      }
    }
  };

  const addTV = (shows: TVShow[]) => {
    for (const s of shows) {
      if (!seenIds.has(`tv:${s.id}`) && s.overview) {
        tvCandidates.push({ item: s, type: "tv", embedText: candidateEmbedText(s, "tv") });
      }
    }
  };

  // trendingMovies / trendingTV return arrays directly
  // topRated / popularTV return TMDBResponse objects with .results
  if (trendingMovies.status === "fulfilled") addMovies(trendingMovies.value || []);
  if (topRated.status === "fulfilled") addMovies(topRated.value.results || []);
  if (trendingTV.status === "fulfilled") addTV(trendingTV.value || []);
  if (popularTV.status === "fulfilled") addTV(popularTV.value.results || []);

  // Deduplicate candidates by id
  const seenCandidateIds = new Set<string>();
  const allCandidates: AICandidate[] = [];
  for (const c of [...movieCandidates, ...tvCandidates]) {
    const key = `${c.type}:${(c.item as Movie).id ?? (c.item as TVShow).id}`;
    if (!seenCandidateIds.has(key)) {
      seenCandidateIds.add(key);
      allCandidates.push(c);
    }
  }

  const candidates = allCandidates.slice(0, MAX_CANDIDATES);
  if (!candidates.length) return EMPTY_PAYLOAD;

  // 2. Build user taste profile and embed it
  const tasteProfile = buildTasteProfile(signals);
  const tasteEmbedding = await embedTexts([tasteProfile]).then((r) => r[0]);
  if (!tasteEmbedding) return EMPTY_PAYLOAD;

  // 3. Embed candidates (with Redis cache)
  const vectorsById = new Map<string, number[]>();
  const toEmbed: { key: string; text: string; index: number }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const id = (c.item as Movie).id ?? (c.item as TVShow).id;
    const cacheKey = `ai:embed:${c.type}:${id}`;
    const cached = await getCachedEmbedding(cacheKey);
    if (cached) {
      vectorsById.set(cacheKey, cached);
    } else {
      toEmbed.push({ key: cacheKey, text: c.embedText, index: i });
    }
  }

  // Batch embed uncached candidates (max 2048 per call)
  if (toEmbed.length > 0) {
    const BATCH_SIZE = 512;
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE);
      const embeddings = await embedTexts(batch.map((b) => b.text));
      for (let j = 0; j < batch.length; j++) {
        const vector = embeddings[j];
        if (vector) {
          vectorsById.set(batch[j].key, vector);
          void setCachedEmbedding(batch[j].key, vector);
        }
      }
    }
  }

  // 4. Cosine similarity ranking
  const scored: Array<{ candidate: AICandidate; score: number }> = [];
  for (const c of candidates) {
    const id = (c.item as Movie).id ?? (c.item as TVShow).id;
    const cacheKey = `ai:embed:${c.type}:${id}`;
    const vector = vectorsById.get(cacheKey);
    if (!vector) continue;
    const score = cosineSimilarity(tasteEmbedding, vector);
    scored.push({ candidate: c, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_N_FOR_EXPLANATIONS);

  // 5. GPT-4o-mini explanations for top results
  const explanationInputs = top.map((s) => {
    const id = (s.candidate.item as Movie).id ?? (s.candidate.item as TVShow).id;
    const title = s.candidate.type === "movie"
      ? (s.candidate.item as Movie).title
      : (s.candidate.item as TVShow).name;
    return {
      id,
      type: s.candidate.type,
      title,
      overview: s.candidate.item.overview?.slice(0, 150) || "",
    };
  });

  const rawExplanations = await generateExplanations(tasteProfile, explanationInputs).catch(() => ({}));

  // 6. Build final payload
  const explanationById: Record<string, { label: string; text: string }> = {};
  const rankedItems: (Movie | TVShow)[] = [];

  for (const { candidate, score } of top) {
    const id = (candidate.item as Movie).id ?? (candidate.item as TVShow).id;
    const key = `${id}:${candidate.type}`;
    const clientKey = `${candidate.type}:${id}`;
    const rawText = rawExplanations[key] || "";

    rankedItems.push(candidate.item);
    explanationById[clientKey] = {
      label: "AI Pick",
      text: rawText || "Matched to your taste profile.",
    };
  }

  // Pad with remaining scored items (no explanation)
  for (const { candidate } of scored.slice(TOP_N_FOR_EXPLANATIONS)) {
    rankedItems.push(candidate.item);
  }

  return { items: rankedItems, explanationById, isAIRanked: true };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function aiRecommendationsHandler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isOpenAIConfigured()) {
    return res.status(503).json({ error: "AI recommendations not configured" });
  }

  // Rate limiting
  const ip = getClientIp(req);
  const ipLimit = await consumeRateLimit(`ai-recs:ip:${ip}`, MAX_IP_REQUESTS, RATE_WINDOW_MS);

  if (!ipLimit.allowed) {
    res.setHeader("Retry-After", String(Math.max(ipLimit.retryAfterSeconds, 30)));
    return res.status(429).json({ error: "Too many requests. Try again shortly." });
  }

  // Auth — getUserFromRequest takes only the request, returns UserPayload | null
  const { db } = await connectToDatabase();
  const userPayload = await getUserFromRequest(req);
  if (!userPayload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = String(userPayload.id);

  // User-level rate limit check now that we have userId
  const userRateLimit = await consumeRateLimit(
    `ai-recs:user:${userId}`,
    MAX_USER_REQUESTS,
    RATE_WINDOW_MS,
  );
  if (!userRateLimit.allowed) {
    res.setHeader("Retry-After", String(Math.max(userRateLimit.retryAfterSeconds, 30)));
    return res.status(429).json({ error: "Too many requests. Try again shortly." });
  }

  try {
    // Load user signals from MongoDB
    const [historyDocs, likedDocs, feedbackDocs] = await Promise.all([
      db.collection("watch_history")
        .find({ user_id: userId })
        .sort({ watched_at: -1 })
        .limit(MAX_HISTORY_SEEDS)
        .toArray(),
      db.collection("liked_items")
        .find({ user_id: userId })
        .sort({ liked_at: -1 })
        .limit(MAX_LIKED_SEEDS)
        .toArray(),
      db.collection("feedback_items")
        .find({ user_id: userId, feedback_type: { $ne: "skip" } })
        .sort({ updated_at: -1 })
        .limit(20)
        .toArray(),
    ]);

    // Build weighted signals
    const signals: UserSignal[] = [];
    const seenIds = new Set<string>();

    for (const doc of historyDocs) {
      const key = `${doc.content_type}:${doc.content_id}`;
      seenIds.add(key);
      signals.push({
        content_id: doc.content_id,
        content_type: doc.content_type,
        title: doc.title || "",
        genres: Array.isArray(doc.genres) ? doc.genres : [],
        language: doc.language || "en",
        weight: 1.0,
      });
    }

    for (const doc of likedDocs) {
      const key = `${doc.content_type}:${doc.content_id}`;
      if (!seenIds.has(key)) {
        signals.push({
          content_id: doc.content_id,
          content_type: doc.content_type,
          title: doc.title || "",
          genres: [],
          language: "en",
          weight: 1.5,
        });
      }
    }

    for (const doc of feedbackDocs) {
      const key = `${doc.content_type}:${doc.content_id}`;
      if (!seenIds.has(key)) {
        const weight = doc.feedback_type === "must_watch" ? 1.35 : 1.1;
        signals.push({
          content_id: doc.content_id,
          content_type: doc.content_type,
          title: doc.title || "",
          genres: Array.isArray(doc.genres) ? doc.genres : [],
          language: doc.language || "en",
          weight,
        });
      }
    }

    // Check result cache
    const revisionHash = `${historyDocs.length}:${likedDocs.length}:${feedbackDocs.length}`;
    const resultCacheKey = `ai:recs:${userId}:${revisionHash}`;
    const cached = await getCachedResult(resultCacheKey);
    if (cached) {
      return res.status(200).json({ data: cached });
    }

    // Run AI pipeline
    const payload = await buildAIRecommendations(userId, signals, seenIds);

    // Cache result
    await setCachedResult(resultCacheKey, payload);

    return res.status(200).json({ data: payload });
  } catch (error) {
    console.error("AI recommendations error:", error);
    return res.status(200).json({ data: EMPTY_PAYLOAD });
  }
}
