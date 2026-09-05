/**
 * GET/POST/DELETE/PATCH /api/user/watchlist
 * Manage user watchlist (bucket list of movies/series)
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { sanitizeSingleLineText } from "../../lib/input.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";
import { markTasteProfileStale } from "@/backend/services/recommendationTaste";

type ContentType = "movie" | "tv";
export type WatchlistStatus = "saved" | "watching" | "completed" | "dropped";

interface WatchlistDoc {
  _id?: ObjectId;
  user_id: string;
  content_id: number;
  content_type: ContentType;
  title: string;
  poster_path: string | null;
  genres?: number[];
  language?: string;
  added_at: string;
  position: number;
  watched: boolean;
  status?: WatchlistStatus;
}

function normalizeStatus(value: unknown, watched = false): WatchlistStatus {
  if (value === "saved" || value === "watching" || value === "completed" || value === "dropped") {
    return value;
  }
  return watched ? "completed" : "saved";
}

function itemResponse(item: WatchlistDoc) {
  const status = normalizeStatus(item.status, item.watched);
  return {
    id: item._id!.toString(),
    user_id: item.user_id,
    content_id: item.content_id,
    content_type: item.content_type,
    title: item.title,
    poster_path: item.poster_path,
    genres: item.genres || [],
    language: item.language || "en",
    added_at: item.added_at,
    position: item.position,
    status,
    // Keep the old field in responses for clients that have not migrated yet.
    watched: status === "completed",
  };
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

function normalizeGenres(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((entry) => Number.isInteger(entry) && entry > 0))].slice(0, 24);
}

function normalizeLanguage(value: unknown): string | null {
  const normalized = normalizeOptionalString(value, 8)?.toLowerCase();
  return normalized && /^[a-z]{2,3}$/.test(normalized) ? normalized : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const method = (req.method || "GET").toUpperCase();
  const methodLimits: Record<string, { maxRequests: number; windowMs: number }> = {
    GET: { maxRequests: 120, windowMs: 5 * 60 * 1000 },
    POST: { maxRequests: 100, windowMs: 10 * 60 * 1000 },
    DELETE: { maxRequests: 100, windowMs: 10 * 60 * 1000 },
    PATCH: { maxRequests: 150, windowMs: 10 * 60 * 1000 },
  };
  const methodLimit = methodLimits[method];
  if (
    methodLimit &&
    (await enforceRequestRateLimit({
      req,
      res,
      route: "user_watchlist",
      reason: "watchlist_limit",
      errorMessage: "Too many watchlist requests. Please try again shortly.",
      metadata: { method },
      rules: [
        {
          key: `user:watchlist:user:${user.id}:${method}`,
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
  const col = db.collection<WatchlistDoc>("watchlist");
  const invalidateTaste = () => markTasteProfileStale(db, user.id).catch((error) => {
    console.error("Failed to mark taste profile stale:", error);
  });

  try {
    if (method === "GET") {
      const items = await col
        .find(
          { user_id: user.id },
          {
            projection: {
              user_id: 1,
              content_id: 1,
              content_type: 1,
              title: 1,
              poster_path: 1,
              genres: 1,
              language: 1,
              added_at: 1,
              position: 1,
              watched: 1,
              status: 1,
            },
          },
        )
        .sort({ position: 1, added_at: 1 })
        .toArray();

      return res.status(200).json({
        data: items.map(itemResponse),
      });
    }

    if (method === "POST") {
      const body = req.body || {};
      const contentId = normalizeContentId(body.content_id);
      const contentType = normalizeContentType(body.content_type);
      const title = normalizeRequiredString(body.title, 220);
      const posterPath = normalizeOptionalString(body.poster_path, 300);
      const itemGenres = normalizeGenres(body.genres);
      const itemLanguage = normalizeLanguage(body.language);

      if (!contentId || !contentType || !title) {
        return res.status(400).json({ error: "content_id, content_type, and title are required" });
      }

      const filter = { user_id: user.id, content_id: contentId, content_type: contentType };

      // Toggle: remove if already in watchlist
      const removed = await col.deleteOne(filter);
      if (removed.deletedCount === 1) {
        await invalidateTaste();
        return res.status(200).json({ message: "Removed from watchlist", action: "removed", data: null });
      }

      const lastItem = await col
        .find({ user_id: user.id }, { projection: { position: 1 } })
        .sort({ position: -1 })
        .limit(1)
        .toArray();
      const position = lastItem.length > 0 ? lastItem[0].position + 1 : 0;

      const now = new Date().toISOString();
      const result = await col.insertOne({
        ...filter,
        title,
        poster_path: posterPath,
        genres: itemGenres,
        ...(itemLanguage ? { language: itemLanguage } : {}),
        added_at: now,
        position,
        watched: false,
        status: "saved",
      });
      await invalidateTaste();

      return res.status(201).json({
        message: "Added to watchlist",
        action: "added",
        data: {
          id: result.insertedId.toString(),
          user_id: user.id,
          content_id: contentId,
          content_type: contentType,
          title,
          poster_path: posterPath,
          genres: itemGenres,
          language: itemLanguage || "en",
          added_at: now,
          position,
          status: "saved" as const,
          watched: false,
        },
      });
    }

    if (method === "DELETE") {
      const body = req.body || {};
      const contentId = normalizeContentId(body.content_id);
      const contentType = normalizeContentType(body.content_type);

      if (!contentId || !contentType) {
        return res.status(400).json({ error: "content_id and content_type are required" });
      }

      await col.deleteOne({ user_id: user.id, content_id: contentId, content_type: contentType });
      await invalidateTaste();
      return res.status(200).json({ message: "Removed from watchlist" });
    }

    if (method === "PATCH") {
      const body = req.body || {};
      const action = body.action as string;

      if (action === "reorder") {
        const order = body.order as Array<{ id: string; position: number }>;
        if (!Array.isArray(order) || order.length === 0) {
          return res.status(400).json({ error: "order array required" });
        }

        const bulkOps = order
          .filter((o) => o.id && ObjectId.isValid(o.id) && typeof o.position === "number")
          .map((o) => ({
            updateOne: {
              filter: { _id: new ObjectId(o.id), user_id: user.id },
              update: { $set: { position: o.position } },
            },
          }));

        if (bulkOps.length > 0) {
          await col.bulkWrite(bulkOps);
          await invalidateTaste();
        }
        return res.status(200).json({ message: "Reordered" });
      }

      if (action === "mark_watched") {
        const contentId = normalizeContentId(body.content_id);
        const contentType = normalizeContentType(body.content_type);
        const watched = typeof body.watched === "boolean" ? body.watched : true;

        if (!contentId || !contentType) {
          return res.status(400).json({ error: "content_id and content_type are required" });
        }

        await col.updateOne(
          { user_id: user.id, content_id: contentId, content_type: contentType },
          { $set: { watched, status: watched ? "completed" : "saved" } },
        );
        await invalidateTaste();
        return res.status(200).json({ message: watched ? "Marked as watched" : "Marked as unwatched" });
      }

      if (action === "set_status") {
        const contentId = normalizeContentId(body.content_id);
        const contentType = normalizeContentType(body.content_type);
        const status = normalizeStatus(body.status, false);
        const isValidStatus = body.status === "saved" || body.status === "watching" ||
          body.status === "completed" || body.status === "dropped";

        if (!contentId || !contentType || !isValidStatus) {
          return res.status(400).json({
            error: "content_id, content_type, and a valid status are required",
          });
        }

        const updated = await col.findOneAndUpdate(
          { user_id: user.id, content_id: contentId, content_type: contentType },
          { $set: { status, watched: status === "completed" } },
          { returnDocument: "after" },
        );
        if (!updated) {
          return res.status(404).json({ error: "Watchlist item not found" });
        }
        await invalidateTaste();
        return res.status(200).json({
          message: "Watchlist status updated",
          data: itemResponse(updated as WatchlistDoc),
        });
      }

      return res.status(400).json({ error: "Unknown patch action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Watchlist error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
