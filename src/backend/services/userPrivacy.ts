import "server-only";

import { ObjectId } from "mongodb";
import type { connectToDatabase } from "@/backend/api/lib/mongodb";
import {
  beginAccountDeletion,
  claimAccountDeletion,
  completeAccountDeletion,
  AccountDeletionInProgressError,
  releaseAccountDeletionLease,
  type AccountLifecycleRecord,
} from "@/backend/services/accountLifecycle";

type Database = Awaited<ReturnType<typeof connectToDatabase>>["db"];
type RawDocument = Record<string, unknown> & { _id?: unknown };
type ContentType = "movie" | "tv";

const FEEDBACK_TYPES = new Set([
  "give_it_a_go",
  "one_time_watch",
  "must_watch",
  "skip",
  "not_now",
]);

const USER_SCOPED_EXPORTS = [
  ["user_preferences", "preferences"],
  ["watchlist", "watchlist"],
  ["watch_history", "watch_history"],
  ["liked_items", "liked_items"],
  ["content_feedback", "content_feedback"],
  ["content_comments", "content_comments"],
  ["feedback_items", "feedback_items"],
  ["user_taste_profiles", "user_taste_profiles"],
  ["user_taste_controls", "user_taste_controls"],
  ["recommendation_sessions", "recommendation_sessions"],
] as const;

const USER_SCOPED_DELETE_COLLECTIONS = [
  "user_preferences",
  "watch_history",
  "liked_items",
  "watchlist",
  "content_comments",
  "feedback_items",
  "user_taste_profiles",
  "user_taste_controls",
  "refresh_tokens",
] as const;

const SENSITIVE_EXPORT_KEY = /password|token|secret|credential|authorization|cookie|lease/i;

export interface PersonalDataExport {
  schema_version: 1;
  exported_at: string;
  profile: Record<string, unknown>;
  data: Record<string, unknown[]>;
}

export interface AccountDeletionResult {
  deleted: true;
  lifecycle: AccountLifecycleRecord;
  deleted_counts: Record<string, number>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof ObjectId) return value.toHexString();
  return null;
}

function contentType(value: unknown): ContentType | null {
  return value === "movie" || value === "tv" ? value : null;
}

function contentId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeProfile(document: RawDocument | null, userId: string): Record<string, unknown> {
  if (!document) {
    return { id: userId, user_id: userId };
  }

  const id = asString(document._id) || userId;
  return {
    id,
    user_id: id,
    email: typeof document.email === "string" ? document.email : "",
    username:
      typeof document.username === "string"
        ? document.username
        : typeof document.name === "string"
          ? document.name
          : "",
    role: typeof document.role === "string" ? document.role : "user",
    avatar_url:
      typeof document.avatar_url === "string"
        ? document.avatar_url
        : typeof document.image === "string"
          ? document.image
          : null,
    created_at: document.created_at ?? document.createdAt ?? null,
    updated_at: document.updated_at ?? document.updatedAt ?? null,
    email_verified: document.email_verified ?? document.emailVerified ?? false,
  };
}

/** Convert Mongo/BSON values to JSON while removing credentials and secrets. */
export function sanitizeExportValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_EXPORT_KEY.test(key)) return undefined;
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toHexString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeExportValue(entry))
      .filter((entry) => entry !== undefined);
  }

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = sanitizeExportValue(entryValue, entryKey);
    if (sanitized !== undefined) output[entryKey] = sanitized;
  }
  return output;
}

async function readDocuments(
  db: Database,
  collectionName: string,
  filter: Record<string, unknown>,
): Promise<RawDocument[]> {
  const cursor = db.collection<RawDocument>(collectionName).find(filter);
  if (typeof cursor.toArray !== "function") return [];
  return (await cursor.toArray()) as RawDocument[];
}

async function readUserDocuments(
  db: Database,
  collectionName: string,
  userId: string,
): Promise<RawDocument[]> {
  return readDocuments(db, collectionName, { user_id: userId });
}

function userObjectIdFilter(userId: string): Record<string, unknown> {
  if (ObjectId.isValid(userId)) {
    return { _id: new ObjectId(userId) };
  }
  return { id: userId };
}

export async function exportUserData(db: Database, userId: string): Promise<PersonalDataExport> {
  const user = await db.collection<RawDocument>("users").findOne(
    userObjectIdFilter(userId),
  );

  const scopedDocuments = await Promise.all(
    USER_SCOPED_EXPORTS.map(async ([collectionName, outputName]) => {
      const documents = await readUserDocuments(db, collectionName, userId);
      return [outputName, documents.map((document) => sanitizeExportValue(document))] as const;
    }),
  );

  const sessions = scopedDocuments.find(([name]) => name === "recommendation_sessions")?.[1] || [];
  const sessionIds = sessions
    .map((session) => (session && typeof session === "object" ? (session as Record<string, unknown>).session_id : null))
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const [batches, deliveries, accounts] = await Promise.all([
    sessionIds.length > 0
      ? readDocuments(db, "recommendation_batches", {
          $or: [{ session_id: { $in: sessionIds } }, { user_id: userId }],
        })
      : readDocuments(db, "recommendation_batches", { user_id: userId }),
    sessionIds.length > 0
      ? readDocuments(db, "recommendation_deliveries", {
          $or: [{ session_id: { $in: sessionIds } }, { user_id: userId }],
        })
      : readDocuments(db, "recommendation_deliveries", { user_id: userId }),
    readDocuments(db, "accounts", { userId: userId }),
  ]);

  const data: Record<string, unknown[]> = Object.fromEntries(scopedDocuments);
  data.recommendation_batches = batches.map((document) => sanitizeExportValue(document));
  data.recommendation_deliveries = deliveries.map((document) => sanitizeExportValue(document));
  data.auth_accounts = accounts.map((document) => sanitizeExportValue(document));

  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    profile: safeProfile(user, userId),
    data,
  };
}

interface FeedbackSummaryKey {
  content_id: number;
  content_type: ContentType;
  feedback_type: string;
}

function feedbackSummaryKey(document: RawDocument): FeedbackSummaryKey | null {
  const content_id = contentId(document.content_id);
  const content_type = contentType(document.content_type);
  const feedback_type = typeof document.feedback_type === "string" ? document.feedback_type : null;
  if (!content_id || !content_type || !feedback_type || !FEEDBACK_TYPES.has(feedback_type)) return null;
  return { content_id, content_type, feedback_type };
}

async function rebuildFeedbackSummary(
  db: Database,
  key: Pick<FeedbackSummaryKey, "content_id" | "content_type">,
  now: string,
): Promise<void> {
  const counts: Record<string, number> = {};
  const collection = db.collection<RawDocument>("content_feedback");
  const cursor = collection.find({ content_id: key.content_id, content_type: key.content_type });
  const rows = typeof cursor.toArray === "function" ? await cursor.toArray() : [];
  for (const row of rows) {
    const feedbackType = typeof row.feedback_type === "string" ? row.feedback_type : null;
    if (!feedbackType || !FEEDBACK_TYPES.has(feedbackType)) continue;
    counts[feedbackType] = (counts[feedbackType] || 0) + 1;
  }
  const totalVotes = Object.values(counts).reduce((sum, value) => sum + value, 0);
  await db.collection("content_feedback_summary").updateOne(
    { content_id: key.content_id, content_type: key.content_type },
    { $set: { counts, total_votes: totalVotes, updated_at: now } },
  );
}

async function deleteMany(
  db: Database,
  deletedCounts: Record<string, number>,
  collectionName: string,
  filter: Record<string, unknown>,
  countKey = collectionName,
): Promise<void> {
  const result = await db.collection(collectionName).deleteMany(filter);
  deletedCounts[countKey] = (deletedCounts[countKey] || 0) + Number(result.deletedCount || 0);
}

async function deleteFeedbackDocuments(
  db: Database,
  deletedCounts: Record<string, number>,
  userId: string,
  feedbackDocuments: RawDocument[],
  summaryKeys: FeedbackSummaryKey[],
): Promise<void> {
  let deleted = 0;
  for (const feedback of feedbackDocuments) {
    const contentId = contentIdFromDocument(feedback);
    const type = contentType(feedback.content_type);
    const filter: Record<string, unknown> = feedback._id
      ? { _id: feedback._id, user_id: userId }
      : {
          user_id: userId,
          ...(contentId ? { content_id: contentId } : {}),
          ...(type ? { content_type: type } : {}),
        };
    const result = await db.collection("content_feedback").deleteOne(filter);
    if (result.deletedCount !== 1) continue;
    deleted += 1;
  }
  // Recompute each affected aggregate only after all source rows have been
  // removed. The keys are retained on the deleting tombstone until completion,
  // so a retry after an interrupted summary write can finish exactly once.
  for (const key of summaryKeys) {
    await rebuildFeedbackSummary(db, key, new Date().toISOString());
  }
  deletedCounts.content_feedback = (deletedCounts.content_feedback || 0) + deleted;
}

function contentIdFromDocument(document: RawDocument): number | null {
  return contentId(document.content_id);
}

async function cleanupAccountResidue(
  db: Database,
  userId: string,
  deletedCounts: Record<string, number>,
): Promise<void> {
  const sessions = await readUserDocuments(db, "recommendation_sessions", userId);
  const sessionIds = sessions
    .map((session) => asString(session.session_id))
    .filter((value): value is string => Boolean(value));
  const artifactFilter = sessionIds.length > 0
    ? { $or: [{ session_id: { $in: sessionIds } }, { user_id: userId }] }
    : { user_id: userId };
  await deleteMany(db, deletedCounts, "recommendation_batches", artifactFilter);
  await deleteMany(db, deletedCounts, "recommendation_deliveries", artifactFilter);
  await deleteMany(db, deletedCounts, "recommendation_sessions", { user_id: userId });
  await deleteMany(db, deletedCounts, "content_feedback", { user_id: userId });
  for (const collectionName of USER_SCOPED_DELETE_COLLECTIONS) {
    await deleteMany(db, deletedCounts, collectionName, { user_id: userId });
  }
}

/**
 * Delete every user-owned document, retaining only the lifecycle tombstone.
 * The tombstone is written first and last-write guards use it to stop delayed
 * recommendation jobs from recreating derived taste/session data.
 */
export async function deleteUserAccount(
  db: Database,
  userId: string,
): Promise<AccountDeletionResult> {
  const started = await beginAccountDeletion(db, userId);
  if (started.state === "deleted") {
    const deletedCounts: Record<string, number> = {};
    // Terminal tombstones are still reconciled. This handles a worker crash
    // after the account row was removed and keeps retries independent of auth.
    await cleanupAccountResidue(db, userId, deletedCounts);
    return { deleted: true, lifecycle: started, deleted_counts: deletedCounts };
  }

  const claim = await claimAccountDeletion(db, userId);
  if (!claim.acquired || !claim.lease) {
    throw new AccountDeletionInProgressError();
  }
  const lifecycle = claim.lifecycle;
  if (lifecycle.state === "deleted") {
    const deletedCounts: Record<string, number> = {};
    await cleanupAccountResidue(db, userId, deletedCounts);
    return { deleted: true, lifecycle, deleted_counts: deletedCounts };
  }

  try {
    const [user, feedbackDocuments, recommendationSessions] = await Promise.all([
      db.collection<RawDocument>("users").findOne(userObjectIdFilter(userId), {
        projection: { email: 1 },
      }),
      readUserDocuments(db, "content_feedback", userId),
      readUserDocuments(db, "recommendation_sessions", userId),
    ]);

    const deletedCounts: Record<string, number> = {};
    const summaryKeys = [
      ...new Map(
        [
          ...(lifecycle.feedback_summary_keys || []),
          ...feedbackDocuments.map(feedbackSummaryKey).filter((key): key is FeedbackSummaryKey => Boolean(key)),
        ].map((key) => [`${key.content_type}:${key.content_id}`, key] as const),
      ).values(),
    ];
    await db.collection("account_lifecycle").updateOne(
      { user_id: userId, state: "deleting", deletion_lease: claim.lease },
      { $set: { feedback_summary_keys: summaryKeys, updated_at: new Date().toISOString() } },
    );

    const sessionIds = recommendationSessions
      .map((session) => asString(session.session_id))
      .filter((value): value is string => Boolean(value));

    if (sessionIds.length > 0) {
      await deleteMany(db, deletedCounts, "recommendation_batches", {
        $or: [{ session_id: { $in: sessionIds } }, { user_id: userId }],
      });
      await deleteMany(db, deletedCounts, "recommendation_deliveries", {
        $or: [{ session_id: { $in: sessionIds } }, { user_id: userId }],
      });
    }

    await deleteFeedbackDocuments(db, deletedCounts, userId, feedbackDocuments, summaryKeys);

    for (const collectionName of USER_SCOPED_DELETE_COLLECTIONS) {
      await deleteMany(db, deletedCounts, collectionName, { user_id: userId });
    }
    await deleteMany(db, deletedCounts, "recommendation_sessions", { user_id: userId });

    // Keep the tombstone in `deleting` state until this final sweep succeeds. A
    // recommendation request that passed its first read can still finish while
    // deletion is in progress; the sweep removes that late write, while its
    // post-write fence handles writes that occur after this sweep. If the sweep
    // fails, a later deletion retry can safely resume under the same tombstone.
    const lateSessions = await readUserDocuments(db, "recommendation_sessions", userId);
    const lateSessionIds = [
      ...new Set([
        ...sessionIds,
        ...lateSessions
          .map((session) => asString(session.session_id))
          .filter((value): value is string => Boolean(value)),
      ]),
    ];
    if (lateSessionIds.length > 0) {
      await deleteMany(db, deletedCounts, "recommendation_batches", {
        $or: [{ session_id: { $in: lateSessionIds } }, { user_id: userId }],
      });
      await deleteMany(db, deletedCounts, "recommendation_deliveries", {
        $or: [{ session_id: { $in: lateSessionIds } }, { user_id: userId }],
      });
    }
    await deleteMany(db, deletedCounts, "recommendation_sessions", { user_id: userId });
    await deleteMany(db, deletedCounts, "content_feedback", { user_id: userId });
    for (const collectionName of USER_SCOPED_DELETE_COLLECTIONS) {
      await deleteMany(db, deletedCounts, collectionName, { user_id: userId });
    }

    // Better Auth is configured with usePlural:true. The user_id variants keep
    // deletion complete for legacy records created before that migration. These
    // are intentionally after the sweep so an operational failure leaves an
    // authenticated account available for a retry.
    await deleteMany(db, deletedCounts, "accounts", { userId });
    await deleteMany(db, deletedCounts, "accounts", { user_id: userId });
    await deleteMany(db, deletedCounts, "sessions", { userId });
    await deleteMany(db, deletedCounts, "sessions", { user_id: userId });
    await deleteMany(db, deletedCounts, "account", { userId });
    await deleteMany(db, deletedCounts, "session", { userId });

    const email = user && typeof user.email === "string" ? user.email : null;
    if (email) {
      await deleteMany(db, deletedCounts, "verifications", { identifier: email });
    }
    await deleteMany(db, deletedCounts, "verifications", { userId });
    await deleteMany(db, deletedCounts, "verification", { userId });

    const userResult = await db.collection("users").deleteOne(userObjectIdFilter(userId));
    deletedCounts.users = Number(userResult.deletedCount || 0);
    if (userResult.deletedCount === 0 && ObjectId.isValid(userId)) {
      await deleteMany(db, deletedCounts, "users", { id: userId });
    }

    const completedLifecycle = await completeAccountDeletion(db, userId, claim.lease);
    return { deleted: true, lifecycle: completedLifecycle, deleted_counts: deletedCounts };
  } catch (error) {
    await releaseAccountDeletionLease(db, userId, claim.lease).catch(() => undefined);
    throw error;
  }
}
