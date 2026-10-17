/** Persistent feed sessions: batches, delivery tracking, leases and replay. */
import { randomUUID } from "crypto";
import {
  AccountDeletedError,
  assertAccountWriteFence,
  type AccountWriteFence,
} from "@/backend/services/accountLifecycle";
import {
  loadRecommendationExclusions,
  loadRecommendationTaste,
} from "@/backend/services/recommendationTaste";
import * as recommendationTasteService from "@/backend/services/recommendationTaste";
import { getContentKey, type UnifiedContentItem } from "@/shared/lib/recommendation";
import type { ContentType, FeedExplanation, FeedResponse } from "@/shared/lib/recommendation/feedTypes";
import type { BatchDoc, Database, SessionDoc } from "./recommendationFeedTypes";

export function isExpired(value: Date | string | undefined): boolean {
  if (!value) return true;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

export async function loadDeliveredCandidateKeys(
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

export async function persistBatchMembership(
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

export async function repairBatchCheckpoint(
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

export async function acquireGenerationLease(
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

export async function releaseGenerationLease(
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

export async function readBatch(
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

