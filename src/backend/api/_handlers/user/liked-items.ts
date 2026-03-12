/**
 * GET/POST/DELETE /api/user/liked-items
 * Manage user liked items
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { sanitizeSingleLineText } from "../../lib/input.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";

type ContentType = "movie" | "tv";
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 400;

interface LikedItemDoc {
  _id?: ObjectId;
  user_id: string;
  content_id: number;
  content_type: ContentType;
  title: string;
  poster_path: string | null;
  liked_at: string;
}

function normalizeContentType(value: unknown): ContentType | null {
  if (value === "movie" || value === "tv") return value;
  return null;
}

function normalizeContentId(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

function normalizeRequiredString(value: unknown, maxLength: number): string | null {
  return sanitizeSingleLineText(value, maxLength);
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return sanitizeSingleLineText(value, maxLength);
}

function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function parseLimit(raw: string | undefined): number {
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(numeric, MAX_PAGE_SIZE);
}

function decodeCursor(raw: string | undefined): { likedAt: string; id: ObjectId } | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf("|");
  if (separator <= 0 || separator >= raw.length - 1) return null;

  const likedAt = raw.slice(0, separator);
  const idRaw = raw.slice(separator + 1);
  if (!likedAt || !ObjectId.isValid(idRaw)) return null;

  return { likedAt, id: new ObjectId(idRaw) };
}

function encodeCursor(item: { liked_at: string; _id: ObjectId }): string {
  return `${item.liked_at}|${item._id.toString()}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: number }).code === 11000;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate user
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const method = (req.method || "GET").toUpperCase();
  const methodLimits: Record<string, { maxRequests: number; windowMs: number }> = {
    GET: { maxRequests: 120, windowMs: 5 * 60 * 1000 },
    POST: { maxRequests: 140, windowMs: 10 * 60 * 1000 },
    DELETE: { maxRequests: 140, windowMs: 10 * 60 * 1000 },
  };
  const methodLimit = methodLimits[method];
  if (
    methodLimit &&
    (await enforceRequestRateLimit({
      req,
      res,
      route: "user_liked_items",
      reason: "liked_items_limit",
      errorMessage: "Too many liked item requests. Please try again shortly.",
      metadata: { method },
      rules: [
        {
          key: `user:liked-items:user:${user.id}:${method}`,
          maxRequests: methodLimit.maxRequests,
          windowMs: methodLimit.windowMs,
          metadataKey: "user",
        },
      ],
    }))
  ) {
    return;
  }

  const { db } = await connectToDatabase();
  const likedItemsCollection = db.collection<LikedItemDoc>("liked_items");

  try {
    // GET - Fetch liked items
    if (req.method === "GET") {
      const limitRaw = getQueryParam(req, "limit");
      const limit = parseLimit(limitRaw);
      const cursor = decodeCursor(getQueryParam(req, "cursor"));
      const usePagination = Boolean(limitRaw || cursor);
      const filter: Record<string, unknown> = { user_id: user.id };
      if (cursor) {
        filter.$or = [
          { liked_at: { $lt: cursor.likedAt } },
          { liked_at: cursor.likedAt, _id: { $lt: cursor.id } },
        ];
      }

      let query = likedItemsCollection
        .find(filter, {
          projection: {
            user_id: 1,
            content_id: 1,
            content_type: 1,
            title: 1,
            poster_path: 1,
            liked_at: 1,
          },
        })
        .sort({ liked_at: -1, _id: -1 });
      if (usePagination) {
        query = query.limit(limit + 1);
      }

      const liked = await query.toArray();
      const hasMore = usePagination ? liked.length > limit : false;
      const pageItems = usePagination && hasMore ? liked.slice(0, limit) : liked;
      const lastItem = pageItems[pageItems.length - 1];

      const payload: Record<string, unknown> = {
        data: pageItems.map((item) => ({
          id: item._id.toString(),
          user_id: item.user_id,
          content_id: item.content_id,
          content_type: item.content_type,
          title: item.title,
          poster_path: item.poster_path,
          liked_at: item.liked_at,
        })),
      };

      if (usePagination) {
        payload.page = {
          limit,
          has_more: hasMore,
          next_cursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
        };
      }

      return res.status(200).json(payload);
    }

    // POST - Toggle like (add if not exists, remove if exists)
    if (req.method === "POST") {
      const body = req.body || {};
      const contentId = normalizeContentId(body.content_id);
      const contentType = normalizeContentType(body.content_type);
      const title = normalizeRequiredString(body.title, 220);
      const posterPath = normalizeOptionalString(body.poster_path, 300);

      if (!contentId || !contentType || !title) {
        return res.status(400).json({ error: "content_id, content_type, and title are required" });
      }

      const filter = {
        user_id: user.id,
        content_id: contentId,
        content_type: contentType,
      };
      const collection = likedItemsCollection;

      // Toggle off first. With a unique index in place, this avoids a read-before-write race.
      const removed = await collection.deleteOne(filter);
      if (removed.deletedCount === 1) {
        return res.status(200).json({ message: "Unliked", action: "removed", data: null });
      }

      // Like - add
      const now = new Date().toISOString();
      try {
        const result = await collection.insertOne({
          ...filter,
          title,
          poster_path: posterPath,
          liked_at: now,
        });

        return res.status(201).json({
          message: "Liked",
          action: "added",
          data: {
            id: result.insertedId.toString(),
            user_id: user.id,
            content_id: contentId,
            content_type: contentType,
            title,
            poster_path: posterPath,
            liked_at: now,
          },
        });
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        // Concurrent toggle edge-case: if another request inserted first, treat as removed when possible.
        const retryRemove = await collection.deleteOne(filter);
        if (retryRemove.deletedCount === 1) {
          return res.status(200).json({ message: "Unliked", action: "removed", data: null });
        }

        const existing = await collection.findOne(filter, {
          projection: {
            user_id: 1,
            content_id: 1,
            content_type: 1,
            title: 1,
            poster_path: 1,
            liked_at: 1,
          },
        });

        if (existing) {
          return res.status(200).json({
            message: "Liked",
            action: "added",
            data: {
              id: existing._id.toString(),
              user_id: existing.user_id,
              content_id: existing.content_id,
              content_type: existing.content_type,
              title: existing.title,
              poster_path: existing.poster_path || null,
              liked_at: existing.liked_at,
            },
          });
        }

        return res.status(200).json({ message: "Unliked", action: "removed", data: null });
      }
    }

    // DELETE - Remove like
    if (req.method === "DELETE") {
      const body = req.body || {};
      const contentId = normalizeContentId(body.content_id);
      const contentType = normalizeContentType(body.content_type);

      if (!contentId || !contentType) {
        return res.status(400).json({ error: "content_id and content_type are required" });
      }

      await likedItemsCollection.deleteOne({
        user_id: user.id,
        content_id: contentId,
        content_type: contentType,
      });

      return res.status(200).json({ message: "Unliked" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Liked items error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
