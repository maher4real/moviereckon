/**
 * GET/POST/DELETE /api/user/watch-history
 * Manage user watch history
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";

type ContentType = "movie" | "tv";
type Database = Awaited<ReturnType<typeof connectToDatabase>>["db"];
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 400;

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
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeGenres(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();
  for (const genreId of value) {
    const parsed = Number(genreId);
    if (Number.isInteger(parsed) && parsed > 0) unique.add(parsed);
    if (unique.size >= 20) break;
  }
  return [...unique];
}

function normalizeLanguage(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{2,10}(?:-[a-z]{2,10})?$/.test(normalized)) return null;
  return normalized;
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

function decodeCursor(raw: string | undefined): { watchedAt: string; id: ObjectId } | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf("|");
  if (separator <= 0 || separator >= raw.length - 1) return null;

  const watchedAt = raw.slice(0, separator);
  const idRaw = raw.slice(separator + 1);
  if (!watchedAt || !ObjectId.isValid(idRaw)) return null;

  return { watchedAt, id: new ObjectId(idRaw) };
}

function encodeCursor(item: { watched_at: string; _id: ObjectId }): string {
  return `${item.watched_at}|${item._id.toString()}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate user
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { db } = await connectToDatabase();

  try {
    // GET - Fetch watch history
    if (req.method === "GET") {
      const limit = parseLimit(getQueryParam(req, "limit"));
      const cursor = decodeCursor(getQueryParam(req, "cursor"));
      const filter: Record<string, unknown> = { user_id: user.id };

      if (cursor) {
        filter.$or = [
          { watched_at: { $lt: cursor.watchedAt } },
          { watched_at: cursor.watchedAt, _id: { $lt: cursor.id } },
        ];
      }

      const history = await db
        .collection("watch_history")
        .find(filter, {
          projection: {
            user_id: 1,
            content_id: 1,
            content_type: 1,
            title: 1,
            poster_path: 1,
            genres: 1,
            language: 1,
            watched_at: 1,
          },
        })
        .sort({ watched_at: -1, _id: -1 })
        .limit(limit + 1)
        .toArray();
      const hasMore = history.length > limit;
      const pageItems = hasMore ? history.slice(0, limit) : history;
      const lastItem = pageItems[pageItems.length - 1];

      return res.status(200).json({
        data: pageItems.map((item) => ({
          id: item._id.toString(),
          user_id: item.user_id,
          content_id: item.content_id,
          content_type: item.content_type,
          title: item.title,
          poster_path: item.poster_path,
          genres: item.genres || [],
          language: item.language || "en",
          watched_at: item.watched_at,
        })),
        page: {
          limit,
          has_more: hasMore,
          next_cursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
        },
      });
    }

    // POST - Add to watch history (upsert)
    if (req.method === "POST") {
      const body = req.body || {};
      const contentId = normalizeContentId(body.content_id);
      const contentType = normalizeContentType(body.content_type);
      const title = normalizeRequiredString(body.title, 220);
      const posterPath = normalizeOptionalString(body.poster_path, 300);
      const genres = normalizeGenres(body.genres);
      const language = normalizeLanguage(body.language);
      const persistedLanguage = language || "en";

      if (!contentId || !contentType || !title) {
        return res.status(400).json({ error: "content_id, content_type, and title are required" });
      }

      const now = new Date().toISOString();

      // Upsert - update if exists, insert if not
      const result = await db.collection("watch_history").findOneAndUpdate(
        {
          user_id: user.id,
          content_id: contentId,
          content_type: contentType,
        },
        {
          $set: {
            title,
            poster_path: posterPath,
            genres,
            language: persistedLanguage,
            watched_at: now,
          },
          $setOnInsert: {
            user_id: user.id,
            content_id: contentId,
            content_type: contentType,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      const item = result;

      // Update user preferences based on this watch
      if (language || genres.length > 0) {
        await updateUserPreferences(db, user.id, language ?? undefined, genres);
      }

      return res.status(200).json({
        data: {
          id: item?._id?.toString(),
          user_id: user.id,
          content_id: contentId,
          content_type: contentType,
          title,
          poster_path: posterPath,
          genres,
          language: persistedLanguage,
          watched_at: now,
        },
      });
    }

    // DELETE - Remove from watch history
    if (req.method === "DELETE") {
      const body = req.body || {};
      const contentId = normalizeContentId(body.content_id);
      const contentType = normalizeContentType(body.content_type);

      if (!contentId || !contentType) {
        return res.status(400).json({ error: "content_id and content_type are required" });
      }

      await db.collection("watch_history").deleteOne({
        user_id: user.id,
        content_id: contentId,
        content_type: contentType,
      });

      return res.status(200).json({ message: "Removed from watch history" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Watch history error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Helper to update user preferences
async function updateUserPreferences(
  db: Database,
  userId: string,
  language?: string,
  genres?: number[]
) {
  const now = new Date().toISOString();
  const incomingLanguages = language ? [language] : [];
  const incomingGenres = (genres || []).slice(0, 20);

  await db.collection("user_preferences").updateOne(
    { user_id: userId },
    [
      {
        $set: {
          user_id: userId,
          preferred_languages: {
            $slice: [
              {
                $setUnion: [
                  incomingLanguages,
                  { $ifNull: ["$preferred_languages", []] },
                ],
              },
              5,
            ],
          },
          preferred_genres: {
            $slice: [
              {
                $setUnion: [incomingGenres, { $ifNull: ["$preferred_genres", []] }],
              },
              10,
            ],
          },
          created_at: { $ifNull: ["$created_at", now] },
          updated_at: now,
        },
      },
    ],
    { upsert: true }
  );
}
