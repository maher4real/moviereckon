import type { VercelRequest } from "@vercel/node";
import { createHash } from "crypto";
import { connectToDatabase } from "./mongodb.js";
import { getClientIp } from "./rate-limit.js";
import { getRedisKey, isRedisConfigured, runRedisCommand } from "./redis-rest.js";

type SecurityEventOutcome = "blocked" | "error" | "allowed";

export type SecurityEvent = {
  type: string;
  outcome: SecurityEventOutcome;
  route: string;
  userId?: string;
  reason?: string;
  req?: VercelRequest;
  metadata?: Record<string, unknown>;
};

interface SecurityEventAggregateDoc {
  _id: string;
  bucket_start: Date;
  event_field: string;
  type: string;
  outcome: string;
  route: string;
  count: number;
  created_at: Date;
  updated_at: Date;
}

interface SecurityEventDoc {
  _id?: string;
  type: string;
  outcome: string;
  route: string;
  user_id: string | null;
  reason: string | null;
  ip_hash: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

function isTelemetryEnabled(): boolean {
  return process.env.SECURITY_TELEMETRY_ENABLED !== "false";
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "_").slice(0, 80) || "unknown";
}

function getMinuteBucket(timestampMs: number): number {
  return Math.floor(timestampMs / 60_000) * 60_000;
}

function getRequestRoute(req: VercelRequest | undefined): string {
  if (!req?.url) return "unknown";
  try {
    const base = `http://${req.headers.host || "localhost"}`;
    return normalizeTag(new URL(req.url, base).pathname);
  } catch {
    return "unknown";
  }
}

function getIpHash(req: VercelRequest | undefined): string {
  if (!req) return "unknown";
  const ip = getClientIp(req);
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

async function writeRedisAggregate(
  bucketStartMs: number,
  field: string,
): Promise<boolean> {
  const key = getRedisKey(`security-events:agg:${bucketStartMs}`);
  const increment = await runRedisCommand(["HINCRBY", key, field, 1]);
  if (!increment.ok) return false;

  await runRedisCommand(["PEXPIRE", key, 7 * 24 * 60 * 60 * 1000]);
  return true;
}

async function writeMongoAggregate(
  bucketStartMs: number,
  field: string,
  event: SecurityEvent,
): Promise<void> {
  const { db } = await connectToDatabase();
  const aggregates = db.collection<SecurityEventAggregateDoc>("security_event_aggregates");
  const bucketStart = new Date(bucketStartMs);
  const documentId = `${bucketStartMs}:${field}`;
  const now = new Date();

  await aggregates.updateOne(
    { _id: documentId },
    {
      $inc: { count: 1 },
      $set: {
        bucket_start: bucketStart,
        event_field: field,
        type: normalizeTag(event.type),
        outcome: normalizeTag(event.outcome),
        route: normalizeTag(event.route || getRequestRoute(event.req)),
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true },
  );
}

async function writeMongoRawEvent(event: SecurityEvent): Promise<void> {
  if (process.env.SECURITY_TELEMETRY_CAPTURE_RAW !== "true") return;

  const { db } = await connectToDatabase();
  const eventsCollection = db.collection<SecurityEventDoc>("security_events");
  const route = normalizeTag(event.route || getRequestRoute(event.req));
  const now = new Date();
  await eventsCollection.insertOne({
    type: normalizeTag(event.type),
    outcome: normalizeTag(event.outcome),
    route,
    user_id: event.userId || null,
    reason: event.reason || null,
    ip_hash: getIpHash(event.req),
    metadata: event.metadata || {},
    created_at: now,
  });
}

export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  if (!isTelemetryEnabled()) return;

  const now = Date.now();
  const bucketStartMs = getMinuteBucket(now);
  const route = normalizeTag(event.route || getRequestRoute(event.req));
  const type = normalizeTag(event.type);
  const outcome = normalizeTag(event.outcome);
  const reason = normalizeTag(event.reason || "none");
  const field = `${type}|${outcome}|${route}|${reason}`;

  try {
    if (isRedisConfigured()) {
      const wroteRedis = await writeRedisAggregate(bucketStartMs, field);
      if (wroteRedis) {
        await writeMongoRawEvent(event);
        return;
      }
    }

    await writeMongoAggregate(bucketStartMs, field, { ...event, route });
    await writeMongoRawEvent({ ...event, route });
  } catch (error) {
    console.error("security telemetry write failed", error);
  }
}

export function emitSecurityEvent(event: SecurityEvent): void {
  void recordSecurityEvent(event);
}
