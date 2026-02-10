/**
 * GET/PUT /api/user/preferences
 * Manage user preferences
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";

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
      const { preferred_languages, preferred_genres } = req.body;

      const updates: any = { updated_at: new Date().toISOString() };
      if (preferred_languages !== undefined) updates.preferred_languages = preferred_languages;
      if (preferred_genres !== undefined) updates.preferred_genres = preferred_genres;

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
