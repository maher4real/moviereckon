/**
 * GET/POST/DELETE /api/user/watch-history
 * Manage user watch history
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb";
import { extractTokenFromHeader, verifyAccessToken } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate user
  const token = extractTokenFromHeader(req.headers.authorization as string | null);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = verifyAccessToken(token);
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
      const { content_id, content_type, title, poster_path, genres, language } = req.body;

      if (!content_id || !content_type || !title) {
        return res.status(400).json({ error: "content_id, content_type, and title are required" });
      }

      const now = new Date().toISOString();

      // Upsert - update if exists, insert if not
      const result = await db.collection("watch_history").findOneAndUpdate(
        {
          user_id: user.id,
          content_id,
          content_type,
        },
        {
          $set: {
            title,
            poster_path: poster_path || null,
            genres: genres || [],
            language: language || "en",
            watched_at: now,
          },
          $setOnInsert: {
            user_id: user.id,
            content_id,
            content_type,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      const item = result;

      // Update user preferences based on this watch
      if (language || genres?.length) {
        await updateUserPreferences(db, user.id, language, genres);
      }

      return res.status(200).json({
        data: {
          id: item?._id?.toString(),
          user_id: user.id,
          content_id,
          content_type,
          title,
          poster_path: poster_path || null,
          genres: genres || [],
          language: language || "en",
          watched_at: now,
        },
      });
    }

    // DELETE - Remove from watch history
    if (req.method === "DELETE") {
      const { content_id, content_type } = req.body;

      if (!content_id || !content_type) {
        return res.status(400).json({ error: "content_id and content_type are required" });
      }

      await db.collection("watch_history").deleteOne({
        user_id: user.id,
        content_id,
        content_type,
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
  db: any,
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

  const updates: any = { updated_at: new Date().toISOString() };

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
