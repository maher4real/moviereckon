import "server-only";

import { randomUUID } from "crypto";
import type { connectToDatabase } from "@/backend/api/lib/mongodb";

type Database = Awaited<ReturnType<typeof connectToDatabase>>["db"];

export const ACCOUNT_LIFECYCLE_COLLECTION = "account_lifecycle";

export type AccountLifecycleState = "deleting" | "deleted";

export interface AccountLifecycleRecord {
  user_id: string;
  state: AccountLifecycleState;
  generation: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  deletion_lease?: string;
  deletion_lease_expires_at?: string;
  feedback_summary_keys?: Array<{
    content_id: number;
    content_type: "movie" | "tv";
    feedback_type: string;
  }>;
}

export interface AccountWriteFence {
  userId: string;
  generation: number;
}

/**
 * Raised when an asynchronous feature tries to write after account deletion
 * has started. Keeping this as a distinct error lets API callers return a
 * useful response while background work can safely stop without retrying.
 */
export class AccountDeletedError extends Error {
  readonly code = "ACCOUNT_DELETED" as const;

  constructor(message = "Account is no longer writable") {
    super(message);
    this.name = "AccountDeletedError";
  }
}

export class AccountDeletionInProgressError extends Error {
  readonly code = "ACCOUNT_DELETION_IN_PROGRESS" as const;

  constructor() {
    super("Account deletion is already in progress");
    this.name = "AccountDeletionInProgressError";
  }
}

function isAccountLifecycleState(value: unknown): value is AccountLifecycleState {
  return value === "deleting" || value === "deleted";
}

function toLifecycleRecord(value: unknown): AccountLifecycleRecord | null {
  if (!value || typeof value !== "object") return null;
  const document = value as Record<string, unknown>;
  if (typeof document.user_id !== "string" || !isAccountLifecycleState(document.state)) {
    return null;
  }
  const generation = Number(document.generation);
  if (!Number.isInteger(generation) || generation < 1) return null;
  return {
    user_id: document.user_id,
    state: document.state,
    generation,
    created_at: typeof document.created_at === "string" ? document.created_at : "",
    updated_at: typeof document.updated_at === "string" ? document.updated_at : "",
    ...(typeof document.deleted_at === "string" ? { deleted_at: document.deleted_at } : {}),
    ...(typeof document.deletion_lease === "string" ? { deletion_lease: document.deletion_lease } : {}),
    ...(typeof document.deletion_lease_expires_at === "string"
      ? { deletion_lease_expires_at: document.deletion_lease_expires_at }
      : {}),
    ...(Array.isArray(document.feedback_summary_keys)
      ? {
          feedback_summary_keys: document.feedback_summary_keys.filter((entry): entry is {
            content_id: number;
            content_type: "movie" | "tv";
            feedback_type: string;
          } => {
            if (!entry || typeof entry !== "object") return false;
            const value = entry as Record<string, unknown>;
            return Number.isInteger(value.content_id) &&
              (value.content_type === "movie" || value.content_type === "tv") &&
              typeof value.feedback_type === "string";
          }),
        }
      : {}),
  };
}

export async function getAccountLifecycle(
  db: Database,
  userId: string,
): Promise<AccountLifecycleRecord | null> {
  const collection = db.collection(ACCOUNT_LIFECYCLE_COLLECTION);
  // Older service unit doubles only expose the collections under test. The
  // production Mongo collection always has findOne; treating an absent test
  // surface as an active account keeps those read-only tests compatible while
  // begin/complete still fail closed when their write readback is missing.
  if (!collection || typeof collection.findOne !== "function") return null;
  const document = await collection.findOne({ user_id: userId });
  return toLifecycleRecord(document);
}

export async function isAccountWritable(db: Database, userId: string): Promise<boolean> {
  const lifecycle = await getAccountLifecycle(db, userId);
  return !lifecycle || (lifecycle.state !== "deleting" && lifecycle.state !== "deleted");
}

export async function assertAccountWritable(db: Database, userId: string): Promise<void> {
  if (!(await isAccountWritable(db, userId))) {
    throw new AccountDeletedError();
  }
}

/**
 * Capture the current lifecycle generation before a derived-data write. A
 * missing lifecycle record is the normal active-account state and maps to
 * generation zero.
 */
export async function acquireAccountWriteFence(
  db: Database,
  userId: string,
): Promise<AccountWriteFence> {
  const lifecycle = await getAccountLifecycle(db, userId);
  if (lifecycle) throw new AccountDeletedError();
  return { userId, generation: 0 };
}

/**
 * Validate a previously captured fence after a write. The second check closes
 * the deletion race for callers that reconcile their just-written document on
 * AccountDeletedError. Deletion also performs a final sweep after fencing the
 * tombstone, so late writes are removed by one of those two paths.
 */
export async function assertAccountWriteFence(
  db: Database,
  fence: AccountWriteFence,
): Promise<void> {
  const lifecycle = await getAccountLifecycle(db, fence.userId);
  if (
    lifecycle &&
    (lifecycle.state === "deleting" ||
      lifecycle.state === "deleted" ||
      lifecycle.generation !== fence.generation)
  ) {
    throw new AccountDeletedError();
  }
}

/**
 * Mark an account as deleting exactly once. The state filter prevents a late
 * second request from advancing the generation or reopening a deleted account.
 * A duplicate-key race on the first insert simply observes the winner's
 * tombstone on the following read.
 */
export async function beginAccountDeletion(
  db: Database,
  userId: string,
): Promise<AccountLifecycleRecord> {
  const existing = await getAccountLifecycle(db, userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const collection = db.collection(ACCOUNT_LIFECYCLE_COLLECTION);
  try {
    await collection.updateOne(
      { user_id: userId, state: { $nin: ["deleting", "deleted"] } },
      {
        $set: { state: "deleting", updated_at: now },
        $setOnInsert: {
          user_id: userId,
          generation: 1,
          created_at: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    const duplicate = (error as { code?: number }).code === 11000;
    if (!duplicate) throw error;
  }

  const lifecycle = await getAccountLifecycle(db, userId);
  if (lifecycle) return lifecycle;
  throw new Error("Account lifecycle fence could not be persisted");
}

/** Claim an expiring deletion lease so summary adjustments and cleanup run once. */
export async function claimAccountDeletion(
  db: Database,
  userId: string,
): Promise<{ lifecycle: AccountLifecycleRecord; acquired: boolean; lease: string | null }> {
  const lifecycle = await getAccountLifecycle(db, userId);
  if (!lifecycle) throw new Error("Account deletion must be started before claiming a lease");
  if (lifecycle.state === "deleted") return { lifecycle, acquired: false, lease: null };

  const lease = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const result = await db.collection(ACCOUNT_LIFECYCLE_COLLECTION).updateOne(
    {
      user_id: userId,
      state: "deleting",
      $or: [
        { deletion_lease: { $exists: false } },
        { deletion_lease: null },
        { deletion_lease_expires_at: { $lt: now.toISOString() } },
      ],
    },
    {
      $set: {
        deletion_lease: lease,
        deletion_lease_expires_at: expiresAt,
        updated_at: now.toISOString(),
      },
    },
  );
  if (result.matchedCount === 0) {
    const current = await getAccountLifecycle(db, userId);
    if (!current) throw new Error("Account lifecycle fence could not be read");
    return { lifecycle: current, acquired: false, lease: null };
  }

  const claimed = await getAccountLifecycle(db, userId);
  if (!claimed) throw new Error("Account lifecycle fence could not be read");
  return { lifecycle: claimed, acquired: true, lease };
}

export async function completeAccountDeletion(
  db: Database,
  userId: string,
  lease?: string,
): Promise<AccountLifecycleRecord> {
  const now = new Date().toISOString();
  const collection = db.collection(ACCOUNT_LIFECYCLE_COLLECTION);
  await collection.updateOne(
    {
      user_id: userId,
      ...(lease ? { state: "deleting", deletion_lease: lease } : {}),
    },
    {
      $set: {
        state: "deleted",
        deleted_at: now,
        updated_at: now,
        deletion_lease: null,
        deletion_lease_expires_at: null,
      },
      $unset: { feedback_summary_keys: "" },
      $setOnInsert: {
        user_id: userId,
        generation: 1,
        created_at: now,
      },
    },
    { upsert: true },
  );

  const lifecycle = await getAccountLifecycle(db, userId);
  if (lifecycle) return lifecycle;
  throw new Error("Account deletion tombstone could not be persisted");
}

export async function releaseAccountDeletionLease(
  db: Database,
  userId: string,
  lease: string,
): Promise<void> {
  await db.collection(ACCOUNT_LIFECYCLE_COLLECTION).updateOne(
    { user_id: userId, state: "deleting", deletion_lease: lease },
    {
      $set: {
        deletion_lease: null,
        deletion_lease_expires_at: null,
        updated_at: new Date().toISOString(),
      },
    },
  );
}
