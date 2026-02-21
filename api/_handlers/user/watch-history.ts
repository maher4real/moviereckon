/**
 * GET/POST/DELETE /api/user/watch-history
 * Manage user watch history
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb";
import { getUserFromRequest } from "../../lib/auth";

type ContentType = "movie" | "tv";
type Database = Awaited<ReturnType<typeof connectToDatabase>>["db"];

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
      const history = await db
        .collection("watch_history")
        .find({ user_id: user.id })
        .sort({ watched_at: -1 })
        .toArray();

      return res.status(200).json({
        data: history.map((item) => ({
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
  const prefs = await db.collection("user_preferences").findOne({ user_id: userId });

  if (!prefs) {
    // Create preferences if they don't exist
    await db.collection("user_preferences").insertOne({
      user_id: userId,
      preferred_languages: language ? [language] : [],
      preferred_genres: genres || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (language && !prefs.preferred_languages?.includes(language)) {
    updates.preferred_languages = [language, ...(prefs.preferred_languages || [])].slice(0, 5);
  }

  if (genres?.length) {
    const newGenres = [...new Set([...(genres || []), ...(prefs.preferred_genres || [])])].slice(0, 10);
    updates.preferred_genres = newGenres;
  }

  if (Object.keys(updates).length > 1) {
    await db.collection("user_preferences").updateOne(
      { user_id: userId },
      { $set: updates }
    );
  }
}
