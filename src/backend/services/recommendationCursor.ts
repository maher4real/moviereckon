/** Signed cursors and request parsing for the durable recommendation feed. */
import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest } from "@/backend/api/lib/http";
import type { FeedFilters } from "@/shared/lib/recommendation/feedTypes";
import type { CursorPayload } from "./recommendationFeedTypes";

export const CURSOR_VERSION = "recommendations-v2";
export const MAX_LIMIT = 48;

export function cursorSecret(): string {
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

export function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signCursor(payload: string): string {
  return createHmac("sha256", cursorSecret()).update(payload).digest("base64url");
}

export function encodeCursor(cursor: CursorPayload): string {
  const payload = encodeBase64Url(JSON.stringify({ v: CURSOR_VERSION, ...cursor }));
  return `${payload}.${signCursor(payload)}`;
}

export function decodeCursor(raw: string | null): CursorPayload | null {
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

export function positiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeLanguage(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(normalized) ? normalized : null;
}

export function parseFilters(req: VercelRequest): FeedFilters {
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

export function parseLimit(req: VercelRequest): number {
  const url = new URL(req.url || "/api/user/recommendations/v2", `http://${req.headers.host || "localhost"}`);
  const parsed = Number(url.searchParams.get("limit"));
  if (!Number.isInteger(parsed) || parsed <= 0) return 24;
  return Math.min(parsed, MAX_LIMIT);
}

export function hashFilters(filters: FeedFilters, limit: number): string {
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

