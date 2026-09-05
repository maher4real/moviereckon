/**
 * Durable cursor based recommendation feed.
 *
 * The legacy recommendations handler remains available for older clients. This
 * handler owns a user scoped session and stores every generated page so a
 * repeated cursor is idempotent across server instances.
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import {
  AccountDeletedError,
  acquireAccountWriteFence,
  assertAccountWriteFence,
  type AccountWriteFence,
} from "@/backend/services/accountLifecycle";
import {
  discoverServerMovies,
  discoverServerTVShows,
} from "@/backend/services/tmdbServer";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import {
  getContentKey,
  getRecommendations,
  normalizeTmdbItem,
  type UnifiedContentItem,
} from "@/shared/lib/recommendation";
import {
  getLearnedTasteGenreWeight,
  getLearnedTasteLanguageWeight,
  getTasteGenreWeight,
  getTasteLanguageWeight,
  type TasteProfile,
} from "@/shared/lib/recommendation/taste";
import {
  loadRecommendationExclusions,
  loadRecommendationTaste,
} from "@/backend/services/recommendationTaste";
import * as recommendationTasteService from "@/backend/services/recommendationTaste";

type ContentType = "movie" | "tv";
type FeedState = "ready" | "retryable" | "exhausted";
type Database = Awaited<ReturnType<typeof connectToDatabase>>["db"];

interface FeedFilters {
  contentType: ContentType | "all";
  recommendationType: "all" | "trending" | "highrated" | "popular" | "newreleases";
  genreId: number | null;
  language: string | null;
  sort: "relevance" | "popularity" | "rating" | "release_date";
  direction: "asc" | "desc";
  exploration: "familiar" | "adventurous";
}

interface FeedExplanation {
  reasons: Array<{ label: string; evidence?: string }>;
  score: number;
  scoreBreakdown: {
    genre: number;
    keywords: number;
    people: number;
    year: number;
    runtime: number;
    quality: number;
    popularity: number;
    novelty: number;
    diversityPenalty: number;
    preference?: number;
    negativePenalty?: number;
  };
  seedTitle: string | null;
}

interface FeedResponse {
  items: (Movie | TVShow)[];
  explanationById: Record<string, FeedExplanation>;
  nextCursor: string | null;
  hasMore: boolean;
  state: FeedState;
  profileVersion: number;
  feedSessionId: string;
  isPersonalized: boolean;
}

interface CursorPayload {
  sessionId: string;
  page: number;
  pageSize: number;
  filtersHash: string;
  issuedAt: number;
}

interface SessionDoc {
  session_id: string;
  user_id: string;
  filters_hash: string;
  filters: FeedFilters;
  page_size: number;
  profile_version: number;
  ranking_version: string;
  next_page: number;
  source_state?: SourceState;
  candidate_buffer?: UnifiedContentItem[];
  generation_page?: number | null;
  generation_lease?: string | null;
  generation_lease_expires_at?: Date | null;
  revision?: number;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface BatchDoc {
  session_id: string;
  user_id?: string;
  page: number;
  profile_version: number;
  items: (Movie | TVShow)[];
  explanation_by_id: Record<string, FeedExplanation>;
  next_cursor: string | null;
  has_more: boolean;
  state: FeedState;
  source_state_after?: SourceState;
  candidate_buffer_after?: UnifiedContentItem[];
  expires_at: Date;
  created_at: Date;
  is_personalized?: boolean;
}

interface SourceState {
  movieTastePage: number;
  movieExplorePage: number;
  movieTasteTotalPages: number | null;
  movieExploreTotalPages: number | null;
  tvTastePage: number;
  tvExplorePage: number;
  tvTasteTotalPages: number | null;
  tvExploreTotalPages: number | null;
  movieTasteInterests?: TasteInterestState[];
  tvTasteInterests?: TasteInterestState[];
}

interface TasteInterestState {
  key: string;
  genreId?: number;
  language?: string;
  page: number;
  totalPages: number | null;
}

interface SourceResult {
  stream: SourceStream;
  type: ContentType;
  profileSource: boolean;
  interestKey?: string;
  page: number;
  totalPages: number | null;
  results: unknown[];
  failed: boolean;
}

type SourceStream = "movieTaste" | "movieExplore" | "tvTaste" | "tvExplore";

const CURSOR_VERSION = "recommendations-v2";
const RANKING_VERSION = "taste-v2";
const SESSION_TTL_MS = 45 * 60 * 1000;
const MAX_LIMIT = 48;
const MAX_SOURCE_PAGE = 500;
const MAX_REFILL_PAGES = 5;
const MAX_IP_REQUESTS = 70;
const MAX_USER_REQUESTS = 35;

function cursorSecret(): string {
  const secret =
    process.env.RECOMMENDATIONS_CURSOR_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("RECOMMENDATIONS_CURSOR_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signCursor(payload: string): string {
  return createHmac("sha256", cursorSecret()).update(payload).digest("base64url");
}

function encodeCursor(cursor: CursorPayload): string {
  const payload = encodeBase64Url(JSON.stringify({ v: CURSOR_VERSION, ...cursor }));
  return `${payload}.${signCursor(payload)}`;
}

function decodeCursor(raw: string | null): CursorPayload | null {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || signature.length !== 43) return null;
  const expected = signCursor(payload);
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const value = JSON.parse(decodeBase64Url(payload)) as Partial<CursorPayload> & { v?: string };
    if (
      value.v !== CURSOR_VERSION ||
      typeof value.sessionId !== "string" ||
      !/^[0-9a-f-]{16,80}$/i.test(value.sessionId) ||
      !Number.isInteger(value.page) ||
      Number(value.page) < 1 ||
      !Number.isInteger(value.pageSize) ||
      Number(value.pageSize) < 1 ||
      typeof value.filtersHash !== "string" ||
      !Number.isFinite(value.issuedAt)
    ) {
      return null;
    }
    return {
      sessionId: value.sessionId,
      page: Number(value.page),
      pageSize: Number(value.pageSize),
      filtersHash: value.filtersHash,
      issuedAt: Number(value.issuedAt),
    };
  } catch {
    return null;
  }
}

function positiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeLanguage(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(normalized) ? normalized : null;
}

function parseFilters(req: VercelRequest): FeedFilters {
  const url = new URL(req.url || "/api/user/recommendations/v2", `http://${req.headers.host || "localhost"}`);
  const type = url.searchParams.get("content_type");
  const recommendationType = url.searchParams.get("recommendation_type");
  const sort = url.searchParams.get("sort");
  const direction = url.searchParams.get("sort_order");
  return {
    contentType: type === "movie" || type === "tv" ? type : "all",
    recommendationType:
      recommendationType === "trending" ||
      recommendationType === "highrated" ||
      recommendationType === "popular" ||
      recommendationType === "newreleases"
        ? recommendationType
        : "all",
    genreId: positiveInteger(url.searchParams.get("genre")),
    language: normalizeLanguage(url.searchParams.get("language")),
    sort:
      sort === "popularity" || sort === "rating" || sort === "release_date"
        ? sort
        : "relevance",
    direction: direction === "asc" ? "asc" : "desc",
    exploration: url.searchParams.get("exploration") === "adventurous" ? "adventurous" : "familiar",
  };
}

function parseLimit(req: VercelRequest): number {
  const url = new URL(req.url || "/api/user/recommendations/v2", `http://${req.headers.host || "localhost"}`);
  const parsed = Number(url.searchParams.get("limit"));
  if (!Number.isInteger(parsed) || parsed <= 0) return 24;
  return Math.min(parsed, MAX_LIMIT);
}

function hashFilters(filters: FeedFilters, limit: number): string {
  const input = [
    filters.contentType,
    filters.recommendationType,
    filters.genreId || "all",
    filters.language || "all",
    filters.sort,
    filters.direction,
    filters.exploration,
    limit,
  ].join("|");
  return createHmac("sha256", CURSOR_VERSION).update(input).digest("hex").slice(0, 32);
}

function dateValue(item: UnifiedContentItem): number {
  const value = item.releaseDate ? Date.parse(item.releaseDate) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

const GENRE_LABELS: Record<number, string> = {
  12: "adventure", 14: "fantasy", 16: "animation", 18: "drama", 27: "horror",
  28: "action", 35: "comedy", 36: "history", 37: "western", 53: "thrillers",
  80: "crime", 99: "documentaries", 878: "science fiction", 9648: "mysteries",
  10402: "music", 10749: "romance", 10751: "family", 10752: "war",
  10759: "action and adventure", 10762: "kids", 10765: "science fiction and fantasy",
};

export function scoreCandidate(
  item: UnifiedContentItem,
  profile: TasteProfile,
  exploration: FeedFilters["exploration"] = "familiar",
): {
  score: number;
  explanation: FeedExplanation;
} {
  const genre = item.genreIds.reduce((total, genreId) => total + getTasteGenreWeight(profile, genreId), 0);
  const language = getTasteLanguageWeight(profile, item.originalLanguage);
  const negativeGenre = item.genreIds.reduce(
    (total, genreId) => total + (profile.negative.genres[String(genreId)] || 0),
    0,
  );
  const negativeLanguage = item.originalLanguage
    ? profile.negative.languages[item.originalLanguage] || 0
    : 0;
  // Affinity totals grow with activity volume. Saturate each feature before
  // blending so a prolific account cannot drown out metadata similarity or
  // exploration simply by repeating the same kind of event.
  const bounded = (value: number, scale: number): number =>
    value > 0 ? 1 - Math.exp(-value / scale) : 0;
  const boundedGenre = bounded(genre, 4);
  const boundedLanguage = bounded(language, 3);
  const boundedNegativeGenre = bounded(negativeGenre, 4);
  const boundedNegativeLanguage = bounded(negativeLanguage, 3);
  const quality = Math.max(0, Math.min(1, item.voteAverage / 10));
  const popularity = Math.max(0, Math.min(1, Math.log1p(item.popularity) / Math.log1p(500)));
  const profileMatch = boundedGenre * 0.46 + boundedLanguage * 0.24;
  const explorationBoost = exploration === "adventurous"
    ? quality * 0.18 + popularity * 0.08 + 0.18
    : quality * 0.1 + popularity * 0.04 + 0.04;
  const score = profileMatch + explorationBoost -
    (boundedNegativeGenre * 0.08 + boundedNegativeLanguage * 0.06);
  const reasons: Array<{ label: string; evidence?: string }> = [];
  const strongestGenre = item.genreIds
    .map((genreId) => ({ genreId, weight: getTasteGenreWeight(profile, genreId) }))
    .sort((left, right) => right.weight - left.weight)[0];
  if (strongestGenre && strongestGenre.weight >= 1) {
    const selected = profile.explicit.genres.includes(strongestGenre.genreId);
    const learned = getLearnedTasteGenreWeight(profile, strongestGenre.genreId);
    reasons.push({
      label: selected
        ? `Matches your selected ${GENRE_LABELS[strongestGenre.genreId] || "genre"}`
        : learned > 0
          ? `Matches your ${GENRE_LABELS[strongestGenre.genreId] || "genre"} affinity`
          : `Matches a preferred ${GENRE_LABELS[strongestGenre.genreId] || "genre"}`,
    });
    const evidence = profile.evidence.find((entry) =>
      entry.contentType === item.type && entry.signal !== "watchlist" &&
      entry.key !== item.key && profile.clusters.some((cluster) =>
        cluster.evidence.some((itemEvidence) => itemEvidence.key === entry.key) &&
        cluster.genreIds.includes(strongestGenre.genreId),
      ),
    );
    if (evidence) reasons[0]!.evidence = `from ${evidence.title}`;
  }
  if (language >= 1) {
    reasons.push({
      label: profile.explicit.languages.includes(item.originalLanguage || "")
        ? "Matches your selected language"
        : getLearnedTasteLanguageWeight(profile, item.originalLanguage) > 0
          ? "Matches a language you often enjoy"
          : "Matches a preferred language",
    });
  }
  if (negativeGenre > 0 || negativeLanguage > 0) {
    reasons.push({ label: "Contains a signal you previously rejected" });
  }
  if (reasons.length === 0) reasons.push({ label: "Exploration pick" });
  return {
    score,
    explanation: {
      reasons: reasons.slice(0, 3),
      score,
      scoreBreakdown: {
        genre: boundedGenre,
        keywords: 0,
        people: 0,
        year: 0,
        runtime: 0,
        quality,
        popularity,
        novelty: 0.1,
        diversityPenalty: 0,
        preference: boundedGenre + boundedLanguage,
        negativePenalty: boundedNegativeGenre + boundedNegativeLanguage,
      },
      seedTitle: null,
    },
  };
}

export interface TasteRankOptions {
  sort?: FeedFilters["sort"];
  direction?: FeedFilters["direction"];
  exploration?: FeedFilters["exploration"];
}

/**
 * Blend the shared metadata/similarity engine with the user's current taste
 * signals. Keeping this as a pure boundary makes it possible to verify that
 * a changed profile changes ordering without duplicating the ranking logic in
 * tests or UI code.
 */
export function rankCandidatesForTaste(
  candidates: UnifiedContentItem[],
  profile: TasteProfile,
  engineRanked: Array<{
    item: UnifiedContentItem;
    score: number;
    reasons: Array<{ label: string; evidence?: string }>;
    seedTitle: string | null;
  }> = [],
  options: TasteRankOptions = {},
): Array<{ item: UnifiedContentItem; score: number; explanation: FeedExplanation }> {
  const engineByKey = new Map(engineRanked.map((entry) => [entry.item.key, entry]));
  const direction = options.direction === "asc" ? -1 : 1;
  const ranked = candidates.map((item) => {
    const dynamic = scoreCandidate(item, profile, options.exploration);
    const engine = engineByKey.get(item.key);
    const engineScore = Number.isFinite(engine?.score) ? Number(engine?.score) : 0;
    const score = engine
      ? engineScore * 0.72 + dynamic.score * 0.28
      : dynamic.score;
    const reasons = [...dynamic.explanation.reasons];
    for (const reason of engine?.reasons || []) {
      if (!reasons.some((existing) => existing.label === reason.label)) reasons.push(reason);
    }
    return {
      item,
      score,
      explanation: {
        ...dynamic.explanation,
        reasons: reasons.slice(0, 3),
        score,
        seedTitle: engine?.seedTitle || dynamic.explanation.seedTitle,
      },
    };
  });
  return ranked.sort((left, right) => {
    if (options.sort === "popularity") {
      const difference = right.item.popularity - left.item.popularity;
      if (difference !== 0) return direction * difference;
    } else if (options.sort === "rating") {
      const difference = right.item.voteAverage - left.item.voteAverage;
      if (difference !== 0) return direction * difference;
    } else if (options.sort === "release_date") {
      const difference = dateValue(right.item) - dateValue(left.item);
      if (difference !== 0) return direction * difference;
    }
    const scoreDifference = right.score - left.score;
    if (scoreDifference !== 0) return direction * scoreDifference;
    const popularityDifference = right.item.popularity - left.item.popularity;
    if (popularityDifference !== 0) return direction * popularityDifference;
    return direction * left.item.key.localeCompare(right.item.key);
  });
}

function toDisplayItem(item: UnifiedContentItem): Movie | TVShow {
  const raw = item.raw;
  if (raw && typeof raw === "object") return raw as Movie | TVShow;
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

function hardFilter(item: UnifiedContentItem, filters: FeedFilters): boolean {
  if (filters.contentType !== "all" && item.type !== filters.contentType) return false;
  if (filters.genreId && !item.genreIds.includes(filters.genreId)) return false;
  if (filters.language && item.originalLanguage !== filters.language) return false;
  const releaseTimestamp = item.releaseDate ? Date.parse(item.releaseDate) : Number.NaN;
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  switch (filters.recommendationType) {
    case "trending":
      if (item.popularity <= 50) return false;
      break;
    case "highrated":
      if (item.voteAverage < 8) return false;
      break;
    case "popular":
      if (item.popularity < 100) return false;
      break;
    case "newreleases":
      if (!Number.isFinite(releaseTimestamp) || releaseTimestamp <= recentCutoff || releaseTimestamp > Date.now()) return false;
      break;
  }
  return true;
}

function buildTasteInterests(profile: TasteProfile, type: ContentType): TasteInterestState[] {
  const interests: TasteInterestState[] = [];
  const seen = new Set<string>();
  const add = (genreId?: number, language?: string) => {
    const normalizedLanguage = language?.trim().toLowerCase();
    const key = `${genreId || "any"}|${normalizedLanguage || "any"}`;
    if (seen.has(key)) return;
    seen.add(key);
    interests.push({
      key,
      ...(genreId ? { genreId } : {}),
      ...(normalizedLanguage ? { language: normalizedLanguage } : {}),
      page: 1,
      totalPages: null,
    });
  };

  // Learned clusters carry the language observed with that genre. Keep that
  // association intact instead of combining unrelated top genre/language
  // values (for example Hindi comedy with English horror).
  for (const cluster of [...profile.clusters].sort((left, right) => right.weight - left.weight)) {
    if (cluster.contentType !== type && cluster.contentType !== "mixed") continue;
    const genreId = cluster.genreIds[0];
    const languages = [...new Set(cluster.evidence.map((entry) => entry.language).filter(Boolean))] as string[];
    if (genreId && languages.length > 0) {
      languages.slice(0, 3).forEach((value) => add(genreId, value));
    } else if (genreId) {
      add(genreId);
    }
    if (interests.length >= 16) break;
  }

  // Explicit choices are soft retrieval signals when no learned cluster has
  // paired them with activity. They remain separate one-dimensional queries.
  for (const genreId of profile.explicit.genres) {
    if (interests.length >= 16) break;
    add(genreId);
  }
  for (const language of profile.explicit.languages) {
    if (interests.length >= 16) break;
    add(undefined, language);
  }
  const learnedLanguages = Object.entries(profile.learned?.languages || profile.inferred.languages || {})
    .sort(([, left], [, right]) => right - left)
    .map(([value]) => value);
  for (const language of learnedLanguages) {
    if (interests.length >= 16) break;
    add(undefined, language);
  }
  return interests;
}

async function fetchSource(
  type: ContentType,
  page: number,
  filters: FeedFilters,
  profile: TasteProfile,
  profileSource: boolean,
  stream: SourceStream,
  interest?: TasteInterestState,
): Promise<SourceResult> {
  try {
    const params = {
      page: interest?.page || page,
      with_genres: filters.genreId
        ? String(filters.genreId)
        : profileSource && interest?.genreId
          ? String(interest.genreId)
          : undefined,
      with_original_language: filters.language
        ? filters.language
        : profileSource && interest?.language
          ? interest.language
          : undefined,
        sort_by:
        filters.sort === "rating"
          ? `vote_average.${filters.direction}`
          : filters.sort === "release_date"
            ? type === "movie" ? `primary_release_date.${filters.direction}` : `first_air_date.${filters.direction}`
            : `popularity.${filters.direction}`,
      "vote_count.gte": filters.sort === "rating" ? 40 : undefined,
    };
    const response = type === "movie"
      ? await discoverServerMovies(params)
      : await discoverServerTVShows(params);
    return {
      stream,
      type,
      profileSource,
      ...(interest ? { interestKey: interest.key } : {}),
      page,
      // A TMDB page count belongs to one exact genre/language query. When we
      // cycle through several interests, keep the count unknown so one query
      // cannot prematurely exhaust another.
      totalPages: Number.isFinite(response.total_pages) ? response.total_pages : null,
      results: Array.isArray(response.results) ? response.results : [],
      failed: false,
    };
  } catch {
    return { stream, type, profileSource, page, totalPages: null, results: [], failed: true };
  }
}

function isExpired(value: Date | string | undefined): boolean {
  if (!value) return true;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

async function loadDeliveredCandidateKeys(
  db: Database,
  sessionId: string,
  candidates: UnifiedContentItem[],
): Promise<Set<string>> {
  const keys = [...new Set(candidates.map((item) => item.key))];
  if (keys.length === 0) return new Set();
  const cursor = db.collection("recommendation_deliveries").find(
    { session_id: sessionId, content_key: { $in: keys } },
    { projection: { content_key: 1 } },
  );
  if (typeof cursor.toArray !== "function") return new Set();
  const rows = await cursor.toArray() as Array<Record<string, unknown>>;
  return new Set(rows.map((row) => String(row.content_key)));
}

async function persistBatchMembership(
  db: Database,
  session: SessionDoc,
  batch: BatchDoc,
): Promise<void> {
  for (const item of batch.items) {
    const type: ContentType = "title" in item ? "movie" : "tv";
    const contentKey = getContentKey(type, item.id);
    try {
      await db.collection("recommendation_deliveries").updateOne(
        { session_id: session.session_id, content_key: contentKey },
        {
          $setOnInsert: {
            session_id: session.session_id,
            user_id: session.user_id,
            content_key: contentKey,
            page: batch.page,
            expires_at: batch.expires_at,
            created_at: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      const duplicate = (error as { code?: number; codeName?: string }).code === 11000 ||
        (error as { codeName?: string }).codeName === "DuplicateKey";
      if (!duplicate) throw error;
      // A retry or concurrent request may have inserted the same membership.
    }
  }
}

async function repairBatchCheckpoint(
  db: Database,
  session: SessionDoc,
  batch: BatchDoc,
  leaseToken?: string,
): Promise<void> {
  await persistBatchMembership(db, session, batch);
  if ((session.next_page || 1) !== batch.page) return;
  const checkpointLeaseFilter = leaseToken
    ? { generation_lease: leaseToken }
    : {
        $or: [
          { generation_lease: { $exists: false } },
          { generation_lease: null },
          { generation_lease_expires_at: { $lt: new Date() } },
        ],
      };
  await db.collection<SessionDoc>("recommendation_sessions").updateOne(
    {
      session_id: session.session_id,
      user_id: session.user_id,
      next_page: batch.page,
      ...checkpointLeaseFilter,
    },
    {
      $set: {
        next_page: Math.max(session.next_page || 1, batch.page + 1),
        ...(batch.source_state_after ? { source_state: batch.source_state_after } : {}),
        ...(batch.candidate_buffer_after ? { candidate_buffer: batch.candidate_buffer_after } : {}),
        updated_at: new Date(),
        generation_page: null,
        generation_lease: null,
        generation_lease_expires_at: null,
      },
    },
  );
}

async function acquireGenerationLease(
  db: Database,
  session: SessionDoc,
  page: number,
): Promise<string | null> {
  const token = randomUUID();
  const now = new Date();
  const result = await db.collection<SessionDoc>("recommendation_sessions").updateOne(
    {
      session_id: session.session_id,
      user_id: session.user_id,
      next_page: page,
      $or: [
        { generation_lease: { $exists: false } },
        { generation_lease: null },
        { generation_lease_expires_at: { $lt: now } },
      ],
    },
    {
      $set: {
        generation_page: page,
        generation_lease: token,
        generation_lease_expires_at: new Date(now.getTime() + 15_000),
      },
      $inc: { revision: 1 },
    },
  );
  return result.matchedCount > 0 ? token : null;
}

async function releaseGenerationLease(
  db: Database,
  session: SessionDoc,
  page: number,
  token: string,
): Promise<void> {
  await db.collection<SessionDoc>("recommendation_sessions").updateOne(
    { session_id: session.session_id, user_id: session.user_id, next_page: page, generation_lease: token },
    { $set: { generation_page: null, generation_lease: null, generation_lease_expires_at: null } },
  );
}

async function readBatch(
  db: Database,
  session: SessionDoc,
  page: number,
  taste: Awaited<ReturnType<typeof loadRecommendationTaste>>,
  fence?: AccountWriteFence,
): Promise<FeedResponse | null> {
  const batch = await db.collection<BatchDoc>("recommendation_batches").findOne({
    session_id: session.session_id,
    page,
  });
  if (!batch || isExpired(batch.expires_at)) return null;
  if (fence) await assertAccountWriteFence(db, fence);
  try {
    await repairBatchCheckpoint(db, session, batch);
    if (fence) await assertAccountWriteFence(db, fence);
  } catch (error) {
    if (error instanceof AccountDeletedError) {
      await db.collection("recommendation_deliveries").deleteMany({ session_id: session.session_id }).catch(() => undefined);
      await db.collection("recommendation_batches").deleteMany({ session_id: session.session_id }).catch(() => undefined);
      await db.collection("recommendation_sessions").deleteOne({ session_id: session.session_id, user_id: session.user_id }).catch(() => undefined);
    }
    throw error;
  }
  const batchKeys = batch.items.map((item) => ({
    type: ("title" in item ? "movie" : "tv") as ContentType,
    id: item.id,
  }));
  const currentExcluded = new Set([
    ...taste.excludedKeys,
    ...(taste.suppressedKeys || new Set<string>()),
    ...await loadRecommendationExclusions(db, session.user_id, batchKeys),
    ...(typeof recommendationTasteService.loadRecommendationSuppressions === "function"
      ? await recommendationTasteService.loadRecommendationSuppressions(db, session.user_id, batchKeys)
      : new Set<string>()),
  ]);
  const currentItems = batch.items.filter((item) => {
    const type: ContentType = "title" in item ? "movie" : "tv";
    return !currentExcluded.has(getContentKey(type, item.id));
  });
  const explanationById: Record<string, FeedExplanation> = {};
  currentItems.forEach((item) => {
    const type: ContentType = "title" in item ? "movie" : "tv";
    const key = getContentKey(type, item.id);
    if (batch.explanation_by_id[key]) explanationById[key] = batch.explanation_by_id[key];
  });
  return {
    items: currentItems,
    explanationById,
    nextCursor: batch.next_cursor,
    hasMore: batch.has_more,
    state: currentItems.length > 0 ? batch.state : batch.has_more ? "ready" : "exhausted",
    profileVersion: batch.profile_version,
    feedSessionId: session.session_id,
    isPersonalized: batch.is_personalized === true,
  };
}

async function generatePage(
  db: Database,
  session: SessionDoc,
  profile: TasteProfile,
  excludedKeys: Set<string>,
  page: number,
  limit: number,
  leaseToken: string,
  fence: AccountWriteFence,
): Promise<{ response: FeedResponse; batch: BatchDoc } | { retryable: true }> {
  const filters = session.filters;
  const storedSourceState = session.source_state as Partial<SourceState> & {
    moviePage?: number;
    tvPage?: number;
    movieTotalPages?: number | null;
    tvTotalPages?: number | null;
  } | undefined;
  const sourceState: SourceState = {
    movieTastePage: Math.max(1, storedSourceState?.movieTastePage || storedSourceState?.moviePage || page),
    movieExplorePage: Math.max(1, storedSourceState?.movieExplorePage || storedSourceState?.moviePage || page),
    movieTasteTotalPages: storedSourceState?.movieTasteTotalPages ?? storedSourceState?.movieTotalPages ?? null,
    movieExploreTotalPages: storedSourceState?.movieExploreTotalPages ?? storedSourceState?.movieTotalPages ?? null,
    tvTastePage: Math.max(1, storedSourceState?.tvTastePage || storedSourceState?.tvPage || page),
    tvExplorePage: Math.max(1, storedSourceState?.tvExplorePage || storedSourceState?.tvPage || page),
    tvTasteTotalPages: storedSourceState?.tvTasteTotalPages ?? storedSourceState?.tvTotalPages ?? null,
    tvExploreTotalPages: storedSourceState?.tvExploreTotalPages ?? storedSourceState?.tvTotalPages ?? null,
    movieTasteInterests: storedSourceState?.movieTasteInterests?.map((interest) => ({ ...interest })) || buildTasteInterests(profile, "movie"),
    tvTasteInterests: storedSourceState?.tvTasteInterests?.map((interest) => ({ ...interest })) || buildTasteInterests(profile, "tv"),
  };
  const candidateMap = new Map<string, UnifiedContentItem>();
  for (const item of session.candidate_buffer || []) {
    if (!excludedKeys.has(item.key)) candidateMap.set(item.key, item);
  }
  let hadFailure = false;
  let attempts = 0;

  const streams: Array<{ key: SourceStream; type: ContentType; profileSource: boolean }> = [
    { key: "movieTaste", type: "movie", profileSource: true },
    { key: "movieExplore", type: "movie", profileSource: false },
    { key: "tvTaste", type: "tv", profileSource: true },
    { key: "tvExplore", type: "tv", profileSource: false },
  ];
  const hasTasteSource = profile.evidence.length > 0 ||
    profile.explicit.genres.length > 0 || profile.explicit.languages.length > 0;
  const enabledStreams = streams.filter(({ type, profileSource }) =>
    (filters.contentType === "all" || filters.contentType === type) &&
    (!profileSource || hasTasteSource),
  );
  const streamPage = (stream: SourceStream): number => sourceState[`${stream}Page`];
  const streamTotalPages = (stream: SourceStream): number | null => sourceState[`${stream}TotalPages`];
  const streamInterests = (stream: SourceStream): TasteInterestState[] =>
    stream === "movieTaste"
      ? sourceState.movieTasteInterests || []
      : stream === "tvTaste"
        ? sourceState.tvTasteInterests || []
        : [];

  const interestCanContinue = (interest: TasteInterestState): boolean =>
    interest.page <= MAX_SOURCE_PAGE && (interest.totalPages === null || interest.page <= interest.totalPages);

  const sourceCanContinue = (stream: SourceStream): boolean => {
    const interests = streamInterests(stream);
    if (interests.length > 0) return interests.some(interestCanContinue);
    const currentPage = streamPage(stream);
    const totalPages = streamTotalPages(stream);
    return currentPage <= MAX_SOURCE_PAGE && (totalPages === null || currentPage <= totalPages);
  };
  const advanceSource = (source: SourceResult): void => {
    if (source.interestKey) {
      const interests = streamInterests(source.stream);
      const interest = interests.find((entry) => entry.key === source.interestKey);
      if (interest) {
        interest.page = source.page >= MAX_SOURCE_PAGE ||
          (source.totalPages !== null && source.page >= source.totalPages)
          ? MAX_SOURCE_PAGE + 1
          : source.page + 1;
        if (source.totalPages !== null) interest.totalPages = source.totalPages;
      }
      return;
    }
    const nextPage = source.page >= MAX_SOURCE_PAGE ||
      (source.totalPages !== null && source.page >= source.totalPages)
      ? MAX_SOURCE_PAGE + 1
      : source.page + 1;
    sourceState[`${source.stream}Page`] = nextPage;
    sourceState[`${source.stream}TotalPages`] = source.totalPages ?? sourceState[`${source.stream}TotalPages`];
  };

  while (attempts < MAX_REFILL_PAGES && candidateMap.size < limit) {
    attempts += 1;
    const requested = await Promise.all(
      enabledStreams
        .flatMap(({ key, type, profileSource }) => {
          if (!sourceCanContinue(key)) return [];
          const interests = streamInterests(key).filter(interestCanContinue);
          if (interests.length > 0) {
            return interests.map((interest) =>
              fetchSource(type, interest.page, filters, profile, profileSource, key, interest),
            );
          }
          return [fetchSource(type, streamPage(key), filters, profile, profileSource, key)];
        }),
    );
    requested.forEach((source) => {
      hadFailure ||= source.failed;
      if (source.failed) return;
      advanceSource(source);
      source.results.forEach((raw) => {
        const normalized = normalizeTmdbItem(raw, {
          typeHint: source.type,
          sourceTag: `discover:${source.stream}:${source.interestKey || "all"}:p${source.page}`,
        });
        if (!normalized || !hardFilter(normalized, filters)) return;
        if (excludedKeys.has(normalized.key) || candidateMap.has(normalized.key)) return;
        candidateMap.set(normalized.key, normalized);
      });
    });
    if (candidateMap.size >= limit) break;
    if (enabledStreams.every(({ key }) => !sourceCanContinue(key))) break;
  }

  if (candidateMap.size === 0 && hadFailure) return { retryable: true };
  const candidateExclusions = await loadRecommendationExclusions(
    db,
    session.user_id,
    [...candidateMap.values()].map((item) => ({ type: item.type, id: item.id })),
  );
  candidateExclusions.forEach((key) => candidateMap.delete(key));
  const candidateSuppressions = typeof recommendationTasteService.loadRecommendationSuppressions === "function"
    ? await recommendationTasteService.loadRecommendationSuppressions(
        db,
        session.user_id,
        [...candidateMap.values()].map((item) => ({ type: item.type, id: item.id })),
      )
    : new Set<string>();
  candidateSuppressions.forEach((key) => candidateMap.delete(key));
  const deliveredCandidateKeys = await loadDeliveredCandidateKeys(
    db,
    session.session_id,
    [...candidateMap.values()],
  );
  deliveredCandidateKeys.forEach((key) => candidateMap.delete(key));
  const seeds = profile.evidence.map((evidence) => {
    const clusterGenres = profile.clusters
      .filter((cluster) => cluster.evidence.some((entry) => entry.key === evidence.key))
      .flatMap((cluster) => cluster.genreIds);
    const evidenceId = Number(evidence.key.split("_")[1]);
    if (!Number.isInteger(evidenceId) || evidenceId <= 0) return null;
    return normalizeTmdbItem(
      {
        id: evidenceId,
        title: evidence.contentType === "movie" ? evidence.title : undefined,
        name: evidence.contentType === "tv" ? evidence.title : undefined,
        genre_ids: [...new Set([...(evidence.genreIds || []), ...clusterGenres])],
        original_language: evidence.language,
        vote_average: 0,
        vote_count: 0,
        popularity: 0,
        _content_type: evidence.contentType,
      },
      { typeHint: evidence.contentType, sourceTag: "taste-evidence", useCache: false },
    );
  }).filter((seed): seed is UnifiedContentItem => seed !== null);
  const engineRanked = getRecommendations(seeds, [...candidateMap.values()], {
    seenIds: excludedKeys,
    preferredGenres: profile.explicit.genres,
    preferredLanguages: profile.explicit.languages,
    seedWeights: Object.fromEntries(profile.evidence.map((evidence) => [evidence.key, Math.max(0.25, evidence.weight)])),
    maxCandidates: 500,
    diversificationTopN: Math.min(120, candidateMap.size),
  });
  const ranked = rankCandidatesForTaste(
    [...candidateMap.values()],
    profile,
    engineRanked,
    { sort: filters.sort, direction: filters.direction, exploration: filters.exploration },
  ).slice(0, limit);
  const selectedKeys = new Set(ranked.map(({ item }) => item.key));
  const candidateBuffer = [...candidateMap.values()]
    .filter((item) => !selectedKeys.has(item.key))
    .slice(0, 500);
  const items = ranked.map(({ item }) => toDisplayItem(item));
  const explanationById: Record<string, FeedExplanation> = {};
  ranked.forEach(({ item, explanation }) => { explanationById[item.key] = explanation; });
  const hasMore = candidateBuffer.length > 0 ||
    enabledStreams.some(({ key }) => sourceCanContinue(key)) || hadFailure;
  const state: FeedState = items.length > 0 ? "ready" : hadFailure ? "retryable" : "exhausted";
  const nextCursor = hasMore
    ? encodeCursor({ sessionId: session.session_id, page: page + 1, pageSize: session.page_size, filtersHash: session.filters_hash, issuedAt: Date.now() })
    : null;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const batch: BatchDoc = {
    session_id: session.session_id,
    user_id: session.user_id,
    page,
    profile_version: profile.version,
    items,
    explanation_by_id: explanationById,
    next_cursor: nextCursor,
    has_more: hasMore,
    state,
    source_state_after: sourceState,
    candidate_buffer_after: candidateBuffer,
    expires_at: expiresAt,
    created_at: new Date(),
    is_personalized: profile.evidence.length > 0 || profile.explicit.genres.length > 0 || profile.explicit.languages.length > 0,
  };

  try {
    await assertAccountWriteFence(db, fence);
    await db.collection<BatchDoc>("recommendation_batches").updateOne(
      { session_id: session.session_id, page },
      { $setOnInsert: batch },
      { upsert: true },
    );
    const persisted = await db.collection<BatchDoc>("recommendation_batches").findOne({ session_id: session.session_id, page });
    const persistedBatch = persisted || batch;
    await repairBatchCheckpoint(db, session, persistedBatch, leaseToken);
    await assertAccountWriteFence(db, fence);
    const response: FeedResponse = {
      items: persistedBatch.items,
      explanationById: persistedBatch.explanation_by_id,
      nextCursor: persistedBatch.next_cursor,
      hasMore: persistedBatch.has_more,
      state: persistedBatch.state,
      profileVersion: persistedBatch.profile_version,
      feedSessionId: session.session_id,
      isPersonalized: persistedBatch.is_personalized === true,
    };
    return { response, batch: persistedBatch };
  } catch (error) {
    if (error instanceof AccountDeletedError) {
      await db.collection("recommendation_deliveries").deleteMany({ session_id: session.session_id }).catch(() => undefined);
      await db.collection("recommendation_batches").deleteMany({ session_id: session.session_id }).catch(() => undefined);
      await db.collection("recommendation_sessions").deleteOne({ session_id: session.session_id, user_id: session.user_id }).catch(() => undefined);
    }
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  res.setHeader("Vary", "Cookie, Authorization");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Invalid or expired token" });
  const clientIp = getClientIp(req);
  const [ipLimit, userLimit] = await Promise.all([
    consumeRateLimit(`recommendations-v2:ip:${clientIp}`, MAX_IP_REQUESTS, 5 * 60 * 1000),
    consumeRateLimit(`recommendations-v2:user:${user.id}`, MAX_USER_REQUESTS, 5 * 60 * 1000),
  ]);
  if (!ipLimit.allowed || !userLimit.allowed) {
    res.setHeader("Retry-After", String(Math.max(ipLimit.retryAfterSeconds, userLimit.retryAfterSeconds, 30)));
    return res.status(429).json({ error: "Too many recommendation requests. Please try again shortly." });
  }

  try {
    const { db } = await connectToDatabase();
    const accountFence = await acquireAccountWriteFence(db, user.id);
    const requestUrl = new URL(req.url || "/api/user/recommendations/v2", `http://${req.headers.host || "localhost"}`);
    const isProfileRequest = requestUrl.pathname.endsWith("/profile") || requestUrl.searchParams.get("profile") === "1";
    const filters = parseFilters(req);
    const limit = parseLimit(req);
    const filtersHash = hashFilters(filters, limit);
    const url = requestUrl;
    const rawCursor = url.searchParams.get("cursor");
    const taste = await loadRecommendationTaste(db, user.id, { includeExclusions: false });
    await assertAccountWriteFence(db, accountFence);
    if (isProfileRequest) {
      return res.status(200).json({ data: taste.profile });
    }
    try {
      cursorSecret();
    } catch {
      return res.status(503).json({ error: "Recommendation cursor signing is not configured", code: "CURSOR_SECRET_MISSING" });
    }
    let cursor: CursorPayload | null = null;
    try {
      cursor = decodeCursor(rawCursor);
    } catch (error) {
      return res.status(503).json({ error: "Recommendation cursor signing is not configured", code: "CURSOR_SECRET_MISSING" });
    }
    if (rawCursor && !cursor) {
      return res.status(400).json({ error: "Invalid recommendation cursor", code: "INVALID_CURSOR" });
    }
    let session: SessionDoc | null = null;
    let page = 1;

    if (cursor) {
      if (cursor.filtersHash !== filtersHash) {
        return res.status(409).json({ error: "Cursor does not match the requested filters", code: "CURSOR_FILTER_MISMATCH" });
      }
      session = await db.collection<SessionDoc>("recommendation_sessions").findOne({ session_id: cursor.sessionId, user_id: user.id });
      if (!session || isExpired(session.expires_at)) {
        return res.status(410).json({ error: "Recommendation session expired", code: "SESSION_EXPIRED", data: { state: "retryable" } });
      }
      if (cursor.pageSize !== session.page_size) {
        return res.status(409).json({ error: "Cursor does not match the requested page size", code: "CURSOR_PAGE_SIZE_MISMATCH" });
      }
      page = cursor.page;
      const replay = await readBatch(db, session, page, taste, accountFence);
      if (replay) return res.status(200).json({ data: replay });
    } else {
      const now = new Date();
      session = {
        session_id: randomUUID(),
        user_id: user.id,
        filters_hash: filtersHash,
        filters,
        page_size: limit,
        profile_version: taste.profile.version,
        ranking_version: RANKING_VERSION,
        next_page: 1,
        source_state: {
          movieTastePage: 1,
          movieExplorePage: 1,
          movieTasteTotalPages: null,
          movieExploreTotalPages: null,
          tvTastePage: 1,
          tvExplorePage: 1,
          tvTasteTotalPages: null,
          tvExploreTotalPages: null,
        },
        expires_at: new Date(now.getTime() + SESSION_TTL_MS),
        created_at: now,
        updated_at: now,
      };
      await assertAccountWriteFence(db, accountFence);
      await db.collection<SessionDoc>("recommendation_sessions").insertOne(session);
      await assertAccountWriteFence(db, accountFence);
    }

    const excludedKeys = new Set(taste.excludedKeys);
    await assertAccountWriteFence(db, accountFence);
    const leaseToken = await acquireGenerationLease(db, session, page);
    if (!leaseToken) {
      const inFlightBatch = await readBatch(db, session, page, taste, accountFence);
      if (inFlightBatch) return res.status(200).json({ data: inFlightBatch });
      return res.status(503).json({
        error: "Recommendation page is being generated",
        data: {
          items: [],
          explanationById: {},
          nextCursor: cursor ? url.searchParams.get("cursor") : null,
          hasMore: true,
          state: "retryable",
          profileVersion: taste.profile.version,
          feedSessionId: session.session_id,
          isPersonalized: taste.profile.evidence.length > 0 || taste.profile.explicit.genres.length > 0 || taste.profile.explicit.languages.length > 0,
        } satisfies FeedResponse,
      });
    }
    const generated = await generatePage(db, session, taste.profile, excludedKeys, page, limit, leaseToken, accountFence).catch(async (error) => {
      await releaseGenerationLease(db, session!, page, leaseToken);
      throw error;
    });
    if ("retryable" in generated) {
      await releaseGenerationLease(db, session, page, leaseToken);
      return res.status(503).json({
        error: "Recommendation sources are temporarily unavailable",
        data: {
          items: [],
          explanationById: {},
          nextCursor: cursor ? url.searchParams.get("cursor") : null,
          hasMore: true,
          state: "retryable",
          profileVersion: taste.profile.version,
          feedSessionId: session.session_id,
          isPersonalized: taste.profile.evidence.length > 0 || taste.profile.explicit.genres.length > 0 || taste.profile.explicit.languages.length > 0,
        } satisfies FeedResponse,
      });
    }
    return res.status(200).json({ data: generated.response });
  } catch (error) {
    if (error instanceof AccountDeletedError) {
      return res.status(410).json({ error: error.message, code: error.code });
    }
    console.error("Recommendations v2 handler error:", error);
    return res.status(500).json({ error: "Internal server error", code: "RECOMMENDATIONS_V2_ERROR" });
  }
}
