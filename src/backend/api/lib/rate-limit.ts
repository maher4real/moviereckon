import type { VercelRequest } from "@vercel/node";
import { createHash } from "crypto";
import { getRedisKey, isRedisConfigured, runRedisCommand } from "./redis-rest.js";

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

function toRedisRateLimitKey(rawKey: string): string {
  const trimmed = rawKey.trim().slice(0, 600);
  const safePrefix = trimmed.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 48) || "key";
  const digest = createHash("sha256").update(trimmed).digest("hex").slice(0, 20);
  return getRedisKey(`rate-limit:${safePrefix}:${digest}`);
}

async function consumeDistributedRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const redisKey = toRedisRateLimitKey(key);
  const incrementResult = await runRedisCommand<number>(["INCR", redisKey]);

  if (!incrementResult.ok || incrementResult.result === null) {
    return null;
  }

  const count = Number(incrementResult.result);
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }

  if (count === 1) {
    await runRedisCommand(["PEXPIRE", redisKey, windowMs]);
  }

  if (count > maxRequests) {
    const ttlResult = await runRedisCommand<number>(["PTTL", redisKey]);
    const retryAfterMs = ttlResult.ok && ttlResult.result !== null ? Number(ttlResult.result) : windowMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(Math.max(retryAfterMs, 0) / 1000)),
      source: "global",
    };
  }

  return { allowed: true, retryAfterSeconds: 0, source: "global" };
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

  if (isRedisConfigured()) {
    const distributed = await consumeDistributedRateLimit(
      key,
      normalizedMaxRequests,
      normalizedWindowMs,
    );
    if (distributed) {
      return distributed;
    }
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
