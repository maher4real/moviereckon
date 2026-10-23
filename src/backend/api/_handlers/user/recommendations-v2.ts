/**
 * Durable cursor based recommendation feed (route handler).
 *
 * This file owns the request lifecycle only. Ranking lives in
 * `@/shared/lib/recommendation/feedRanking`, signed cursors in
 * `recommendationCursor`, session/batch persistence in `recommendationSessions`
 * and TMDB retrieval in `recommendationSources`. The legacy handler remains
 * available only as a rollback path.
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { randomUUID } from "crypto";
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
  getRecommendations,
  normalizeTmdbItem,
  type UnifiedContentItem,
} from "@/shared/lib/recommendation";
import type { TasteProfile } from "@/shared/lib/recommendation/taste";
import { assignFranchiseKeys, limitPerFranchise } from "@/shared/lib/recommendation/franchise";
import { enrichFranchiseMetadata } from "@/backend/services/franchiseEnrichment";
import {
  balanceLanguageMix,
  hardFilter,
  passesQualityFloor,
  rankCandidatesForTaste,
  toDisplayItem,
} from "@/shared/lib/recommendation/feedRanking";
import type {
  ContentType,
  FeedExplanation,
  FeedResponse,
  FeedState,
} from "@/shared/lib/recommendation/feedTypes";
import {
  loadRecommendationExclusions,
  loadRecommendationTaste,
} from "@/backend/services/recommendationTaste";
import * as recommendationTasteService from "@/backend/services/recommendationTaste";
import {
  cursorSecret,
  decodeCursor,
  encodeCursor,
  hashFilters,
  parseFilters,
  parseLimit,
} from "@/backend/services/recommendationCursor";
import {
  acquireGenerationLease,
  isExpired,
  loadDeliveredCandidateKeys,
  readBatch,
  releaseGenerationLease,
  repairBatchCheckpoint,
} from "@/backend/services/recommendationSessions";
import {
  buildExploreInterests,
  buildTasteInterests,
  fetchSeedCandidates,
  fetchSource,
} from "@/backend/services/recommendationSources";
import type {
  BatchDoc,
  CursorPayload,
  Database,
  SessionDoc,
  SourceResult,
  SourceState,
  SourceStream,
  TasteInterestState,
} from "@/backend/services/recommendationFeedTypes";

// Public names other modules and tests import from this handler.
export {
  hardFilter,
  passesQualityFloor,
  rankCandidatesForTaste,
  scoreCandidate,
  type TasteRankOptions,
} from "@/shared/lib/recommendation/feedRanking";

const RANKING_VERSION = "taste-v2";
const SESSION_TTL_MS = 45 * 60 * 1000;
const MAX_SOURCE_PAGE = 500;
const MAX_REFILL_PAGES = 5;
const MAX_IP_REQUESTS = 70;
const MAX_USER_REQUESTS = 35;

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
    movieExploreInterests: storedSourceState?.movieExploreInterests?.map((interest) => ({ ...interest })) || buildExploreInterests(profile, filters),
    tvExploreInterests: storedSourceState?.tvExploreInterests?.map((interest) => ({ ...interest })) || buildExploreInterests(profile, filters),
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
    sourceState[`${stream}Interests`] || [];

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

  // Seeds add a few well-matched titles per page; they must not fill the page
  // by themselves or the regular taste/explore streams would never run.
  const seedCap = Math.max(4, Math.floor(limit / 3));
  const seedSources = await fetchSeedCandidates(profile, page, filters);
  const seedLists = seedSources.map((source) =>
    source.results
      .map((raw) => normalizeTmdbItem(raw, { typeHint: source.type, sourceTag: `seed:${source.seedKey}` }))
      .filter((item): item is UnifiedContentItem =>
        item !== null && hardFilter(item, filters, profile) && passesQualityFloor(item)),
  );
  let seedsAdded = 0;
  for (let index = 0; seedsAdded < seedCap && seedLists.some((list) => index < list.length); index += 1) {
    for (const list of seedLists) {
      const candidate = list[index];
      if (!candidate || seedsAdded >= seedCap) continue;
      if (excludedKeys.has(candidate.key) || candidateMap.has(candidate.key)) continue;
      candidateMap.set(candidate.key, candidate);
      seedsAdded += 1;
    }
  }

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
        if (!normalized || !hardFilter(normalized, filters, profile) || !passesQualityFloor(normalized)) return;
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
    negativeGenreIds: profile.explicit.dislikedGenres ?? [],
    seedWeights: Object.fromEntries(profile.evidence.map((evidence) => [evidence.key, Math.max(0.25, evidence.weight)])),
    maxCandidates: 500,
    diversificationTopN: Math.min(120, candidateMap.size),
  });
  const tasteRanked = rankCandidatesForTaste(
    [...candidateMap.values()],
    profile,
    engineRanked,
    { sort: filters.sort, direction: filters.direction, exploration: filters.exploration },
  );
  // Explicit sorts are promises to the viewer; only the default relevance feed
  // is regrouped by franchise and rebalanced across languages.
  const isRelevanceFeed = filters.sort === "relevance" && filters.direction !== "asc";
  let franchiseKeys = new Map<string, string>();
  let rankedForPage = tasteRanked;
  if (isRelevanceFeed) {
    const headSize = Math.min(tasteRanked.length, limit * 2 + 12);
    const enrichedHead = await enrichFranchiseMetadata(tasteRanked.slice(0, headSize).map(({ item }) => item));
    rankedForPage = tasteRanked.map((entry, index) =>
      index < headSize ? { ...entry, item: enrichedHead[index]! } : entry);
    franchiseKeys = assignFranchiseKeys(enrichedHead);
    rankedForPage = limitPerFranchise(rankedForPage, limit, franchiseKeys);
    if (!filters.language) rankedForPage = balanceLanguageMix(rankedForPage, limit);
  }
  const ranked = rankedForPage.slice(0, limit);
  const selectedKeys = new Set(ranked.map(({ item }) => item.key));
  const candidateBuffer = [...candidateMap.values()]
    .filter((item) => !selectedKeys.has(item.key))
    .slice(0, 500);
  const items = ranked.map(({ item }) => toDisplayItem(item));
  const explanationById: Record<string, FeedExplanation> = {};
  ranked.forEach(({ item, explanation }) => {
    const franchiseKey = franchiseKeys.get(item.key);
    explanationById[item.key] = franchiseKey ? { ...explanation, franchiseKey } : explanation;
  });
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
