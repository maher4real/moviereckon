import type { VercelRequest } from "@vercel/node";
import { createHash } from "crypto";
import { connectToDatabase } from "./mongodb.js";

type RateBucket = {
  count: number;
  resetAt: number;
  touchedAt: number;
};

const buckets = new Map<string, RateBucket>();
const MAX_BUCKETS = Math.max(5_000, Number(process.env.RATE_LIMIT_MAX_BUCKETS || 60_000));
const CLEANUP_EVERY_N_OPERATIONS = 250;
let operationCounter = 0;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  source: "global" | "local";
};

type RateLimitBucket = {
  _id: string;
  count: number;
  expires_at: Date;
  updated_at: Date;
};

export class RateLimitUnavailableError extends Error {
  readonly statusCode = 503;
  readonly retryAfterSeconds = 30;

  constructor() {
    super("Rate limiting is temporarily unavailable");
    this.name = "RateLimitUnavailableError";
  }
}

export function handleRateLimitUnavailable(
  error: unknown,
  response: { setHeader(name: string, value: string): unknown; status(code: number): { json(body: unknown): unknown } },
): boolean {
  if (!(error instanceof RateLimitUnavailableError)) return false;
  response.setHeader("Retry-After", String(error.retryAfterSeconds));
  response.status(error.statusCode).json({ error: error.message });
  return true;
}

export function getClientIp(req: VercelRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) {
    return realIp;
  }

  return "unknown";
}

function normalizeWindowMs(windowMs: number): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) return 60_000;
  return Math.max(1_000, Math.floor(windowMs));
}

function normalizeMaxRequests(maxRequests: number): number {
  if (!Number.isFinite(maxRequests) || maxRequests <= 0) return 1;
  return Math.max(1, Math.floor(maxRequests));
}

function getBucketId(key: string): string {
  return createHash("sha256").update(key.trim().slice(0, 600)).digest("hex");
}

async function consumeMongoRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection<RateLimitBucket>("rate_limit_buckets");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMs);
    const id = getBucketId(key);

    const reset = await collection.updateOne(
      { _id: id, expires_at: { $lte: now } },
      { $set: { count: 1, expires_at: expiresAt, updated_at: now } },
    );
    if (reset.matchedCount > 0) {
      return { allowed: true, retryAfterSeconds: 0, source: "global" };
    }

    let bucket = await collection.findOneAndUpdate(
      { _id: id, expires_at: { $gt: now } },
      { $inc: { count: 1 }, $set: { updated_at: now } },
      { returnDocument: "after" },
    );

    if (!bucket) {
      try {
        await collection.insertOne({ _id: id, count: 1, expires_at: expiresAt, updated_at: now });
        bucket = { _id: id, count: 1, expires_at: expiresAt, updated_at: now };
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
          throw error;
        }
        bucket = await collection.findOneAndUpdate(
          { _id: id, expires_at: { $gt: now } },
          { $inc: { count: 1 }, $set: { updated_at: now } },
          { returnDocument: "after" },
        );
      }
    }

    if (!bucket) throw new Error("rate_limit_bucket_race");
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.expires_at.getTime() - now.getTime()) / 1000));
    return {
      allowed: bucket.count <= maxRequests,
      retryAfterSeconds: bucket.count <= maxRequests ? 0 : retryAfterSeconds,
      source: "global",
    };
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) throw error;
    throw new RateLimitUnavailableError();
  }
}

function consumeLocalRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  operationCounter += 1;
  const now = Date.now();
  const normalizedKey = key.length > 240 ? key.slice(0, 240) : key;
  const existing = buckets.get(normalizedKey);

  if (
    buckets.size > MAX_BUCKETS ||
    operationCounter % CLEANUP_EVERY_N_OPERATIONS === 0
  ) {
    cleanupBuckets(now);
  }

  if (!existing || existing.resetAt <= now) {
    buckets.set(normalizedKey, { count: 1, resetAt: now + windowMs, touchedAt: now });
    trimBucketsIfNeeded();
    return { allowed: true, retryAfterSeconds: 0, source: "local" };
  }

  existing.count += 1;
  existing.touchedAt = now;
  // Keep recently touched entries near the end to support cheap oldest eviction.
  buckets.delete(normalizedKey);
  buckets.set(normalizedKey, existing);

  if (existing.count > maxRequests) {
    const retryAfterMs = Math.max(existing.resetAt - now, 0);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      source: "local",
    };
  }

  return { allowed: true, retryAfterSeconds: 0, source: "local" };
}

export async function consumeRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const normalizedMaxRequests = normalizeMaxRequests(maxRequests);
  const normalizedWindowMs = normalizeWindowMs(windowMs);

  if (process.env.NODE_ENV === "production") {
    return consumeMongoRateLimit(key, normalizedMaxRequests, normalizedWindowMs);
  }
  return consumeLocalRateLimit(key, normalizedMaxRequests, normalizedWindowMs);
}

function cleanupBuckets(now: number) {
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(bucketKey);
    }
  }
}

function trimBucketsIfNeeded() {
  if (buckets.size <= MAX_BUCKETS) return;
  const overflow = buckets.size - MAX_BUCKETS;
  let removed = 0;
  for (const bucketKey of buckets.keys()) {
    buckets.delete(bucketKey);
    removed += 1;
    if (removed >= overflow) break;
  }
}
