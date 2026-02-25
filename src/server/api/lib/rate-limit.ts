import type { VercelRequest } from "@vercel/node";

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

export function consumeRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
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
    return { allowed: true, retryAfterSeconds: 0 };
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
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
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
