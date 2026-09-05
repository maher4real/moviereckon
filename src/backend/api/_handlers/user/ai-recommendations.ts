/**
 * GET /api/user/ai-recommendations
 *
 * Smarter AI recommendation pipeline:
 *
 * Improvements over v1:
 *  - gpt-4.1-mini (smarter + cheaper than gpt-4o-mini)
 *  - 3x larger candidate pool (trending day+week, top-rated p1+p2, now-playing,
 *    Bollywood/Tamil/Telugu for language diversity, similar-to-top-liked)
 *  - Multi-anchor embedding: separate vectors for liked vs watched items,
 *    scored independently and blended by weight
 *  - Quality-adjusted final score: blends semantic similarity + vote confidence
 *  - Diversity enforcement: balanced language, genre, movie/TV mix
 *  - Richer taste profile passed to GPT for more specific explanations
 *  - Smarter cache key: uses latest activity timestamp, not just counts
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import {
  isOpenAIConfigured,
  embedTexts,
  cosineSimilarity,
  averageEmbeddings,
  generateExplanations,
  type UserTasteProfile,
} from "../../lib/openai.js";
import {
  getServerTrendingMovies,
  getServerTrendingTVShows,
  getServerTopRatedMovies,
  getServerPopularTVShows,
  getServerNowPlayingMovies,
  getServerBollywoodMovies,
  getServerGujaratiMovies,
  getServerTamilMovies,
  getServerTeluguMovies,
  getServerSimilarMovies,
  getServerSimilarTVShows,
} from "@/backend/services/tmdbServer";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_IP_REQUESTS = 30;
const MAX_USER_REQUESTS = 15;
const RATE_WINDOW_MS = 5 * 60 * 1000;


const MAX_HISTORY_SEEDS = 30;
const MAX_LIKED_SEEDS = 20;
const MAX_FEEDBACK_SEEDS = 15;
const MIN_VOTE_AVERAGE = 5.5;        // slightly looser = more candidates
const MAX_CANDIDATES = 300;          // bigger pool = more diverse picks
const TOP_N_FOR_EXPLANATIONS = 15;   // explanations for top 15
const FINAL_OUTPUT_LIMIT = 120;      // return up to 120 AI picks

// How many of the user's top-liked items to fetch TMDB-similar content for
const TOP_SEEDS_FOR_SIMILAR = 5;

// Final score blend: semantic similarity vs content quality
const SIMILARITY_WEIGHT = 0.7;
const QUALITY_WEIGHT = 0.3;

// Preference boost multipliers (tuned higher for user preferences)
const LANG_BOOST = 1.25;
const GENRE_BOOST = 1.15;

// Diversity caps in the final ranked output
const MAX_PER_LANGUAGE = 25;
const MAX_PER_GENRE = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContentType = "movie" | "tv";

interface UserSignal {
  content_id: number;
  content_type: ContentType;
  title: string;
  genres: number[];
  language: string;
  weight: number;
  source: "liked" | "watched" | "feedback";
  timestamp: string;
}

interface AICandidate {
  item: Movie | TVShow;
  type: ContentType;
  embedText: string;
  qualityScore: number; // 0–1 normalised from vote_average + vote_count
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

type LocalCacheEntry<T> = { value: T; expiresAt: number };
const embeddingCache = new Map<string, LocalCacheEntry<number[]>>();
const resultCache = new Map<string, LocalCacheEntry<AIRecommendationsPayload>>();
const EMBEDDING_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESULT_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_EMBEDDING_CACHE_ENTRIES = 2_000;
const MAX_RESULT_CACHE_ENTRIES = 500;

function setBoundedCacheEntry<T>(
  cache: Map<string, LocalCacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
  maxEntries: number,
) {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

// ---------------------------------------------------------------------------
// Genre / Language maps
// ---------------------------------------------------------------------------

const GENRE_NAMES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10768: "War & Politics",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  gu: "Gujarati",
  ko: "Korean",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
  tr: "Turkish",
  ml: "Malayalam",
  kn: "Kannada",
};

function genreNames(ids: number[]): string {
  return ids
    .map((id) => GENRE_NAMES[id] || "")
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Quality score: combines vote_average and vote_count confidence
// ---------------------------------------------------------------------------

function qualityScore(item: Movie | TVShow): number {
  const avg = item.vote_average || 0;
  const count = item.vote_count || 0;
  // Bayesian confidence: weight towards 6.0 mean for low vote counts
  const confidence = count / (count + 200);
  const bayesian = confidence * avg + (1 - confidence) * 6.0;
  return Math.min(bayesian / 10, 1); // normalise 0–1
}

// ---------------------------------------------------------------------------
// Rich embed text — more context means better vector representation
// ---------------------------------------------------------------------------

function candidateEmbedText(item: Movie | TVShow, type: ContentType): string {
  const title =
    type === "movie" ? (item as Movie).title : (item as TVShow).name;
  const overview = item.overview?.slice(0, 180) || "";
  const genres = genreNames(item.genre_ids || []);
  const year =
    (type === "movie"
      ? (item as Movie).release_date
      : (item as TVShow).first_air_date
    )?.slice(0, 4) || "";
  const lang = LANGUAGE_LABELS[item.original_language || ""] || "";
  const rating = item.vote_average ? `${item.vote_average.toFixed(1)}/10` : "";

  // More concise format: use | separators instead of full sentences
  return `${title}|${year}|${genres}|${lang}|Rating:${rating}|${overview}`.trim();
}

// ---------------------------------------------------------------------------
// Multi-anchor taste profile builder
// ---------------------------------------------------------------------------

interface TasteAnchors {
  likedVector: number[] | null;
  watchedVector: number[] | null;
  blendedVector: number[] | null;
  profile: UserTasteProfile;
}

async function buildTasteAnchors(signals: UserSignal[]): Promise<TasteAnchors> {
  const liked = signals.filter((s) => s.source === "liked");
  const watched = signals.filter((s) => s.source === "watched");
  const feedback = signals.filter((s) => s.source === "feedback");

  // Build genre frequency map across all signals
  const allSignals = [...liked, ...watched, ...feedback];
  const genreCount = new Map<number, number>();
  for (const s of allSignals) {
    for (const g of s.genres) {
      genreCount.set(g, (genreCount.get(g) || 0) + s.weight);
    }
  }
  const topGenres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => GENRE_NAMES[id])
    .filter(Boolean);

  // Language frequency
  const langCount = new Map<string, number>();
  for (const s of allSignals) {
    langCount.set(s.language, (langCount.get(s.language) || 0) + s.weight);
  }
  const topLanguages = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([lang]) => LANGUAGE_LABELS[lang] || lang);

  const likedTitles = liked.map((s) => s.title);
  const watchedTitles = watched.map((s) => s.title);
  const feedbackTitles = feedback.map((s) => s.title);

  // Build taste summary for GPT — more informative than the old version
  let tasteSummary = "";
  if (likedTitles.length) {
    tasteSummary += `Strong affinity for: ${likedTitles.slice(0, 5).join(", ")}. `;
  }
  if (topGenres.length) {
    tasteSummary += `Leans towards ${topGenres.slice(0, 3).join(", ")} content. `;
  }
  if (topLanguages.length > 1) {
    tasteSummary += `Watches in multiple languages: ${topLanguages.join(", ")}. `;
  }
  if (feedbackTitles.length) {
    tasteSummary += `Also rated positively: ${feedbackTitles.slice(0, 3).join(", ")}.`;
  }

  const profile: UserTasteProfile = {
    likedTitles,
    watchedTitles,
    positiveFeedbackTitles: feedbackTitles,
    topGenres,
    topLanguages,
    tasteSummary: tasteSummary || "Enjoys popular movies and TV shows",
  };

  // Build taste text for embedding (rich, covers all signals)
  const buildEmbedText = (items: UserSignal[]) => {
    if (!items.length) return null;
    const titles = items.map((s) => s.title).join(", ");
    const genres = topGenres.slice(0, 4).join(", ");
    const langs = topLanguages.slice(0, 3).join(", ");
    return `Viewer who enjoys: ${titles}. Favourite genres: ${genres}. Languages: ${langs}.`;
  };

  const textsToEmbed: string[] = [];
  const likedText = buildEmbedText(liked);
  const watchedText = buildEmbedText(watched);

  if (likedText) textsToEmbed.push(likedText);
  if (watchedText) textsToEmbed.push(watchedText);

  // Fallback: if no liked/watched, use all signals
  if (!textsToEmbed.length) {
    const fallback = buildEmbedText(allSignals);
    if (fallback) textsToEmbed.push(fallback);
  }

  if (!textsToEmbed.length) {
    return {
      likedVector: null,
      watchedVector: null,
      blendedVector: null,
      profile,
    };
  }

  const embeddings = await embedTexts(textsToEmbed);
  let idx = 0;
  const likedVector = likedText ? (embeddings[idx++] ?? null) : null;
  const watchedVector = watchedText ? (embeddings[idx++] ?? null) : null;

  // Blended vector: liked gets 2x weight vs watched
  const vectorsToBlend: number[][] = [];
  const blendWeights: number[] = [];
  if (likedVector) {
    vectorsToBlend.push(likedVector);
    blendWeights.push(2.0);
  }
  if (watchedVector) {
    vectorsToBlend.push(watchedVector);
    blendWeights.push(1.0);
  }

  const blendedVector = vectorsToBlend.length
    ? averageEmbeddings(vectorsToBlend, blendWeights)
    : null;

  return { likedVector, watchedVector, blendedVector, profile };
}

// ---------------------------------------------------------------------------
// Score a candidate against taste anchors (multi-anchor)
// ---------------------------------------------------------------------------

function scoreCandidate(
  candidateVector: number[],
  anchors: TasteAnchors,
  candidate: AICandidate,
): number {
  const scores: number[] = [];

  // Blended vector is the primary anchor
  if (anchors.blendedVector) {
    scores.push(cosineSimilarity(candidateVector, anchors.blendedVector) * 1.0);
  }
  // Liked vector gets a bonus pass (if different from blended)
  if (anchors.likedVector) {
    scores.push(cosineSimilarity(candidateVector, anchors.likedVector) * 1.2);
  }

  if (!scores.length) return 0;

  // Take the best of the anchor scores (max, not average) — rewards candidates
  // that strongly match ANY of the user's taste anchors
  const semanticScore = Math.max(...scores);

  // Blend semantic score with content quality
  const finalScore =
    semanticScore * SIMILARITY_WEIGHT + candidate.qualityScore * QUALITY_WEIGHT;

  return finalScore;
}

// ---------------------------------------------------------------------------
// Bounded process-local cache. Serverless instances do not share entries.
// ---------------------------------------------------------------------------

/**
 * Return unexpired embedding hits from current instance.
 */
async function getManyEmbeddings(
  keys: string[],
): Promise<Map<string, number[]>> {
  const now = Date.now();
  const result = new Map<string, number[]>();
  for (const key of keys) {
    const entry = embeddingCache.get(key);
    if (!entry) continue;
    if (entry.expiresAt <= now) {
      embeddingCache.delete(key);
      continue;
    }
    result.set(key, entry.value);
  }
  return result;
}

async function setCachedEmbedding(
  key: string,
  vector: number[],
): Promise<void> {
  setBoundedCacheEntry(
    embeddingCache,
    key,
    vector,
    EMBEDDING_CACHE_TTL_MS,
    MAX_EMBEDDING_CACHE_ENTRIES,
  );
}

async function getCachedResult(
  key: string,
): Promise<AIRecommendationsPayload | null> {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    resultCache.delete(key);
    return null;
  }
  return entry.value;
}

async function setCachedResult(
  key: string,
  payload: AIRecommendationsPayload,
): Promise<void> {
  setBoundedCacheEntry(
    resultCache,
    key,
    payload,
    RESULT_CACHE_TTL_MS,
    MAX_RESULT_CACHE_ENTRIES,
  );
}

// ---------------------------------------------------------------------------
// Diversity filter — enforce language + genre caps in final output
// ---------------------------------------------------------------------------

function applyDiversity(
  scored: Array<{ candidate: AICandidate; score: number }>,
  limit: number,
): Array<{ candidate: AICandidate; score: number }> {
  const langCount = new Map<string, number>();
  const genreCount = new Map<number, number>();
  const result: Array<{ candidate: AICandidate; score: number }> = [];

  for (const entry of scored) {
    if (result.length >= limit) break;
    const item = entry.candidate.item;
    const lang = item.original_language || "en";
    const genres = item.genre_ids || [];

    const langOk = (langCount.get(lang) || 0) < MAX_PER_LANGUAGE;
    const genreOk =
      genres.length === 0 ||
      genres.some((g) => (genreCount.get(g) || 0) < MAX_PER_GENRE);

    if (langOk && genreOk) {
      langCount.set(lang, (langCount.get(lang) || 0) + 1);
      for (const g of genres) genreCount.set(g, (genreCount.get(g) || 0) + 1);
      result.push(entry);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

async function buildAIRecommendations(
  signals: UserSignal[],
  seenIds: Set<string>,
  topLikedIds: Array<{ id: number; type: ContentType }>,
  preferredLanguages: string[],
  preferredGenres: number[],
): Promise<AIRecommendationsPayload> {
  // 1. Fetch a much larger, more diverse candidate pool in parallel
  const [
    trendingMoviesDay,
    trendingMoviesWeek,
    trendingTVDay,
    trendingTVWeek,
    topRatedP1,
    topRatedP2,
    topRatedP3,
    nowPlayingP1,
    nowPlayingP2,
    popularTVP1,
    popularTVP2,
    bollywood,
    gujarati,
    tamil,
    telugu,
    ...similarResults
  ] = await Promise.allSettled([
    getServerTrendingMovies("day"),
    getServerTrendingMovies("week"),
    getServerTrendingTVShows("day"),
    getServerTrendingTVShows("week"),
    getServerTopRatedMovies(1),
    getServerTopRatedMovies(2),
    getServerTopRatedMovies(3),
    getServerNowPlayingMovies(1),
    getServerNowPlayingMovies(2),
    getServerPopularTVShows(1),
    getServerPopularTVShows(2),
    getServerBollywoodMovies(1),
    getServerGujaratiMovies(1),
    getServerTamilMovies(1),
    getServerTeluguMovies(1),
    // Fetch similar content for top liked/watched items — most personalised candidates
    ...topLikedIds
      .slice(0, TOP_SEEDS_FOR_SIMILAR)
      .map(({ id, type }) =>
        type === "movie"
          ? getServerSimilarMovies(id)
          : getServerSimilarTVShows(id),
      ),
  ]);

  const movieCandidates: AICandidate[] = [];
  const tvCandidates: AICandidate[] = [];

  const addMovies = (movies: Movie[]) => {
    for (const m of movies) {
      if (!seenIds.has(`movie:${m.id}`) && m.overview && m.vote_count > 10) {
        movieCandidates.push({
          item: m,
          type: "movie",
          embedText: candidateEmbedText(m, "movie"),
          qualityScore: qualityScore(m),
        });
      }
    }
  };

  const addTV = (shows: TVShow[]) => {
    for (const s of shows) {
      if (!seenIds.has(`tv:${s.id}`) && s.overview && s.vote_count > 10) {
        tvCandidates.push({
          item: s,
          type: "tv",
          embedText: candidateEmbedText(s, "tv"),
          qualityScore: qualityScore(s),
        });
      }
    }
  };

  // Arrays returned directly
  if (trendingMoviesDay.status === "fulfilled")
    addMovies(trendingMoviesDay.value || []);
  if (trendingMoviesWeek.status === "fulfilled")
    addMovies(trendingMoviesWeek.value || []);
  if (trendingTVDay.status === "fulfilled") addTV(trendingTVDay.value || []);
  if (trendingTVWeek.status === "fulfilled") addTV(trendingTVWeek.value || []);

  // TMDBResponse objects — need .results
  if (topRatedP1.status === "fulfilled")
    addMovies(topRatedP1.value.results || []);
  if (topRatedP2.status === "fulfilled")
    addMovies(topRatedP2.value.results || []);
  if (topRatedP3.status === "fulfilled")
    addMovies(topRatedP3.value.results || []);
  if (nowPlayingP1.status === "fulfilled")
    addMovies(nowPlayingP1.value.results || []);
  if (nowPlayingP2.status === "fulfilled")
    addMovies(nowPlayingP2.value.results || []);
  if (popularTVP1.status === "fulfilled")
    addTV(popularTVP1.value.results || []);
  if (popularTVP2.status === "fulfilled")
    addTV(popularTVP2.value.results || []);
  if (bollywood.status === "fulfilled")
    addMovies(bollywood.value.results || []);
  if (gujarati.status === "fulfilled") addMovies(gujarati.value.results || []);
  if (tamil.status === "fulfilled") addMovies(tamil.value.results || []);
  if (telugu.status === "fulfilled") addMovies(telugu.value.results || []);

  // Similar-to-top-liked results (mixed movie/tv based on topLikedIds order)
  for (let i = 0; i < similarResults.length; i++) {
    const res = similarResults[i];
    if (res.status !== "fulfilled") continue;
    const seedType = topLikedIds[i]?.type;
    if (seedType === "movie") {
      addMovies((res.value as { results?: Movie[] }).results || []);
    } else {
      addTV((res.value as { results?: TVShow[] }).results || []);
    }
  }

  // Deduplicate
  const seenCandidateIds = new Set<string>();
  const allCandidates: AICandidate[] = [];
  for (const c of [...movieCandidates, ...tvCandidates]) {
    const id = (c.item as Movie).id ?? (c.item as TVShow).id;
    const key = `${c.type}:${id}`;
    if (!seenCandidateIds.has(key)) {
      seenCandidateIds.add(key);
      allCandidates.push(c);
    }
  }

  // Pre-filter: drop candidates below quality threshold BEFORE embedding
  // This saves significant API costs and improves speed
  const preFiltered = allCandidates.filter(
    (c) => c.item.vote_average >= MIN_VOTE_AVERAGE,
  );
  const candidates = preFiltered.slice(0, MAX_CANDIDATES);
  if (!candidates.length) return EMPTY_PAYLOAD;

  // 2. Build multi-anchor taste vectors
  const anchors = await buildTasteAnchors(signals);
  if (!anchors.blendedVector && !anchors.likedVector) return EMPTY_PAYLOAD;

  // 3. Embed candidates — single MGET round trip for cache hits, then batch embed misses
  const cacheKeys = candidates.map((c) => {
    const id = (c.item as Movie).id ?? (c.item as TVShow).id;
    return `ai:embed:v2:${c.type}:${id}`;
  });

  const cachedMap = await getManyEmbeddings(cacheKeys);
  const vectorsById = new Map<string, number[]>(cachedMap);

  const toEmbed: { key: string; text: string }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const key = cacheKeys[i];
    if (!vectorsById.has(key)) {
      toEmbed.push({ key, text: candidates[i].embedText });
    }
  }

  if (toEmbed.length > 0) {
    // Optimized batch size: smaller batches = lower latency per request
    const BATCH_SIZE = 200;
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE);
      const embeddings = await embedTexts(batch.map((b) => b.text));
      for (let j = 0; j < batch.length; j++) {
        const vector = embeddings[j];
        if (vector) {
          vectorsById.set(batch[j].key, vector);
          // Fire-and-forget: cache embeddings without waiting
          void setCachedEmbedding(batch[j].key, vector);
        }
      }
    }
  }

  // 4. Score all candidates; apply preference boosts
  const scored: Array<{ candidate: AICandidate; score: number }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const vector = vectorsById.get(cacheKeys[i]);
    if (!vector) continue;
    let score = scoreCandidate(vector, anchors, c);

    // Apply preference boosts early for better ranking
    if (
      preferredLanguages.length &&
      preferredLanguages.includes(c.item.original_language || "")
    ) {
      score *= LANG_BOOST;
    }
    if (
      preferredGenres.length &&
      c.item.genre_ids?.some((g) => preferredGenres.includes(g))
    ) {
      score *= GENRE_BOOST;
    }

    scored.push({ candidate: c, score });
  }

  // Sort by score in descending order
  scored.sort((a, b) => b.score - a.score);

  // 5. Apply diversity enforcement to ensure balanced output
  const diverse = applyDiversity(scored, FINAL_OUTPUT_LIMIT);

  // Only get explanations for top N items (reduces tokens significantly)
  const top = diverse.slice(0, TOP_N_FOR_EXPLANATIONS);

  // 6. gpt-4.1-mini explanations with rich taste profile
  const explanationInputs = top.map(({ candidate }) => {
    const id = (candidate.item as Movie).id ?? (candidate.item as TVShow).id;
    const title =
      candidate.type === "movie"
        ? (candidate.item as Movie).title
        : (candidate.item as TVShow).name;
    const year =
      (candidate.type === "movie"
        ? (candidate.item as Movie).release_date
        : (candidate.item as TVShow).first_air_date
      )?.slice(0, 4) || "";
    return {
      id,
      type: candidate.type,
      title,
      overview: candidate.item.overview?.slice(0, 120) || "",
      genres: genreNames(candidate.item.genre_ids || []),
      year,
    };
  });

  const rawExplanations = await generateExplanations(
    anchors.profile,
    explanationInputs,
  ).catch((): Record<string, string> => ({}));

  // 7. Build final payload
  const explanationById: Record<string, { label: string; text: string }> = {};
  const rankedItems: (Movie | TVShow)[] = [];

  for (const { candidate } of top) {
    const id = (candidate.item as Movie).id ?? (candidate.item as TVShow).id;
    const rawKey = `${id}:${candidate.type}`;
    const clientKey = `${candidate.type}:${id}`;
    const rawText = rawExplanations[rawKey] || "";

    rankedItems.push(candidate.item);
    explanationById[clientKey] = {
      label: "AI Pick",
      text: rawText || "Matched to your taste profile.",
    };
  }

  // Pad with remaining diverse items (no explanation badge)
  for (const { candidate } of diverse.slice(TOP_N_FOR_EXPLANATIONS)) {
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
): Promise<void> {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isOpenAIConfigured()) {
    return res.status(503).json({ error: "AI recommendations not configured" });
  }

  const ip = getClientIp(req);
  const ipLimit = await consumeRateLimit(
    `ai-recs:ip:${ip}`,
    MAX_IP_REQUESTS,
    RATE_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    res.setHeader(
      "Retry-After",
      String(Math.max(ipLimit.retryAfterSeconds, 30)),
    );
    return res
      .status(429)
      .json({ error: "Too many requests. Try again shortly." });
  }

  const { db } = await connectToDatabase();
  const userPayload = await getUserFromRequest(req);
  if (!userPayload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = String(userPayload.id);

  const userRateLimit = await consumeRateLimit(
    `ai-recs:user:${userId}`,
    MAX_USER_REQUESTS,
    RATE_WINDOW_MS,
  );
  if (!userRateLimit.allowed) {
    res.setHeader(
      "Retry-After",
      String(Math.max(userRateLimit.retryAfterSeconds, 30)),
    );
    return res
      .status(429)
      .json({ error: "Too many requests. Try again shortly." });
  }

  try {
    const [historyDocs, likedDocs, feedbackDocs, prefsDoc] = await Promise.all([
      db
        .collection("watch_history")
        .find({ user_id: userId })
        .sort({ watched_at: -1 })
        .limit(MAX_HISTORY_SEEDS)
        .toArray(),
      db
        .collection("liked_items")
        .find({ user_id: userId })
        .sort({ liked_at: -1 })
        .limit(MAX_LIKED_SEEDS)
        .toArray(),
      db
        .collection("feedback_items")
        .find({ user_id: userId, feedback_type: { $ne: "skip" } })
        .sort({ updated_at: -1 })
        .limit(MAX_FEEDBACK_SEEDS)
        .toArray(),
      db.collection("user_preferences").findOne({ user_id: userId }),
    ]);

    const preferredLanguages: string[] = Array.isArray(
      prefsDoc?.preferred_languages,
    )
      ? (prefsDoc.preferred_languages as string[])
      : [];
    const preferredGenres: number[] = Array.isArray(prefsDoc?.preferred_genres)
      ? (prefsDoc.preferred_genres as number[])
      : [];

    // Build weighted signals — liked > feedback > watched
    const signals: UserSignal[] = [];
    const seenIds = new Set<string>();

    // Recency decay for watched items (more recent = higher weight)
    const now = Date.now();
    for (const doc of historyDocs) {
      const key = `${doc.content_type}:${doc.content_id}`;
      seenIds.add(key);
      const daysAgo =
        (now - new Date(doc.watched_at || 0).getTime()) / 86_400_000;
      const recency = Math.max(0.7, 1 - daysAgo / 90); // decay over 90 days
      signals.push({
        content_id: doc.content_id,
        content_type: doc.content_type,
        title: doc.title || "",
        genres: Array.isArray(doc.genres) ? doc.genres : [],
        language: doc.language || "en",
        weight: recency,
        source: "watched",
        timestamp: doc.watched_at || "",
      });
    }

    for (const doc of likedDocs) {
      const key = `${doc.content_type}:${doc.content_id}`;
      if (!seenIds.has(key)) seenIds.add(key);
      signals.push({
        content_id: doc.content_id,
        content_type: doc.content_type,
        title: doc.title || "",
        genres: Array.isArray(doc.genres) ? doc.genres : [],
        language: doc.language || "en",
        weight: 1.8, // liked = strongest signal
        source: "liked",
        timestamp: doc.liked_at || "",
      });
    }

    for (const doc of feedbackDocs) {
      const key = `${doc.content_type}:${doc.content_id}`;
      if (!seenIds.has(key)) seenIds.add(key);
      const weight =
        doc.feedback_type === "must_watch"
          ? 1.5
          : doc.feedback_type === "give_it_a_go"
            ? 1.2
            : 1.0;
      signals.push({
        content_id: doc.content_id,
        content_type: doc.content_type,
        title: doc.title || "",
        genres: Array.isArray(doc.genres) ? doc.genres : [],
        language: doc.language || "en",
        weight,
        source: "feedback",
        timestamp: doc.updated_at || "",
      });
    }

    // Top liked/watched IDs to fetch TMDB-similar content for
    const topLikedIds = [
      ...likedDocs.slice(0, 2).map((d) => ({
        id: d.content_id as number,
        type: d.content_type as ContentType,
      })),
      ...historyDocs.slice(0, 1).map((d) => ({
        id: d.content_id as number,
        type: d.content_type as ContentType,
      })),
    ];

    // Smarter cache key: include latest timestamps, not just counts
    const latestWatch = historyDocs[0]?.watched_at || "";
    const latestLike = likedDocs[0]?.liked_at || "";
    const prefsFingerprint =
      [...preferredLanguages].sort().join(",") +
      "|" +
      [...preferredGenres].sort().join(",");
    const resultCacheKey = `ai:recs:v3:${userId}:${historyDocs.length}:${likedDocs.length}:${latestWatch}:${latestLike}:${prefsFingerprint}`;

    const cached = await getCachedResult(resultCacheKey);
    if (cached) {
      return res.status(200).json({ data: cached });
    }

    const payload = await buildAIRecommendations(
      signals,
      seenIds,
      topLikedIds,
      preferredLanguages,
      preferredGenres,
    );
    await setCachedResult(resultCacheKey, payload);

    return res.status(200).json({ data: payload });
  } catch (error) {
    console.error("AI recommendations error:", error);
    return res.status(200).json({ data: EMPTY_PAYLOAD });
  }
}
