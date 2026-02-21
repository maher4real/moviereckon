/**
 * GET/PUT /api/user/preferences
 * Manage user preferences
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb";
import { getUserFromRequest } from "../../lib/auth";

function normalizeLanguages(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((language) => language.trim().toLowerCase())
    .filter((language) => /^[a-z]{2,10}(?:-[a-z]{2,10})?$/.test(language));

  return [...new Set(normalized)].slice(0, 10);
}

function normalizeGenres(value: unknown): number[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;

  const normalized = value
    .map((item) => Number(item))
    .filter((genreId) => Number.isInteger(genreId) && genreId > 0);

  return [...new Set(normalized)].slice(0, 20);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate user
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { db } = await connectToDatabase();

  try {
    // GET - Fetch preferences
    if (req.method === "GET") {
      let prefs = await db.collection("user_preferences").findOne({ user_id: user.id });

      if (!prefs) {
        // Create default preferences
        const now = new Date().toISOString();
        const result = await db.collection("user_preferences").insertOne({
          user_id: user.id,
          preferred_languages: [],
          preferred_genres: [],
          created_at: now,
          updated_at: now,
        });

        prefs = {
          _id: result.insertedId,
          user_id: user.id,
          preferred_languages: [],
          preferred_genres: [],
          created_at: now,
          updated_at: now,
        };
      }

      return res.status(200).json({
        data: {
          id: prefs._id.toString(),
          user_id: prefs.user_id,
          preferred_languages: prefs.preferred_languages || [],
          preferred_genres: prefs.preferred_genres || [],
          created_at: prefs.created_at,
          updated_at: prefs.updated_at,
        },
      });
    }

    // PUT - Update preferences
    if (req.method === "PUT") {
      const body = req.body || {};
      const preferredLanguages = normalizeLanguages(body.preferred_languages);
      const preferredGenres = normalizeGenres(body.preferred_genres);

      if (
        (body.preferred_languages !== undefined && preferredLanguages === null) ||
        (body.preferred_genres !== undefined && preferredGenres === null)
      ) {
        return res.status(400).json({ error: "Invalid preference payload format" });
      }

      if (preferredLanguages === null && preferredGenres === null) {
        return res.status(400).json({ error: "At least one preference field is required" });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (preferredLanguages !== null) updates.preferred_languages = preferredLanguages;
      if (preferredGenres !== null) updates.preferred_genres = preferredGenres;

      await db.collection("user_preferences").updateOne(
        { user_id: user.id },
        { $set: updates },
        { upsert: true }
      );

      const prefs = await db.collection("user_preferences").findOne({ user_id: user.id });

      return res.status(200).json({
        data: {
          id: prefs?._id.toString(),
          user_id: user.id,
          preferred_languages: prefs?.preferred_languages || [],
          preferred_genres: prefs?.preferred_genres || [],
          created_at: prefs?.created_at,
          updated_at: prefs?.updated_at,
        },
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Preferences error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
