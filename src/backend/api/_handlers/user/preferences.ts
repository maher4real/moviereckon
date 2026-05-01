/**
 * GET/PUT /api/user/preferences
 * Manage user preferences
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { sanitizeLanguageCode } from "../../lib/input.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";

function normalizeLanguages(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((language) => sanitizeLanguageCode(language))
    .filter((language): language is string => Boolean(language));

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

  const method = (req.method || "GET").toUpperCase();
  const methodLimits: Record<
    string,
    { maxRequests: number; windowMs: number }
  > = {
    GET: { maxRequests: 60, windowMs: 5 * 60 * 1000 },
    PUT: { maxRequests: 24, windowMs: 10 * 60 * 1000 },
  };
  const methodLimit = methodLimits[method];
  if (
    methodLimit &&
    (await enforceRequestRateLimit({
      req,
      res,
      route: "user_preferences",
      reason: "preferences_limit",
      errorMessage: "Too many preference requests. Please try again shortly.",
      metadata: { method },
      rules: [
        {
          key: `user:preferences:user:${user.id}:${method}`,
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

  try {
    // GET - Fetch preferences (atomic creation on first access)
    if (req.method === "GET") {
      const now = new Date().toISOString();

      // Use findOneAndUpdate with upsert to atomically create if missing
      const result = await db.collection("user_preferences").findOneAndUpdate(
        { user_id: user.id },
        {
          $setOnInsert: {
            user_id: user.id,
            preferred_languages: [],
            preferred_genres: [],
            inferred_languages: [],
            inferred_genres: [],
            created_at: now,
            updated_at: now,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        },
      );

      const prefs = (result as any)?.value ?? result;
      if (!prefs) {
        return res
          .status(500)
          .json({ error: "Failed to fetch user preferences" });
      }

      return res.status(200).json({
        data: {
          id: prefs._id.toString(),
          user_id: prefs.user_id,
          preferred_languages: prefs.preferred_languages || [],
          preferred_genres: prefs.preferred_genres || [],
          inferred_languages: prefs.inferred_languages || [],
          inferred_genres: prefs.inferred_genres || [],
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
        (body.preferred_languages !== undefined &&
          preferredLanguages === null) ||
        (body.preferred_genres !== undefined && preferredGenres === null)
      ) {
        return res
          .status(400)
          .json({ error: "Invalid preference payload format" });
      }

      if (preferredLanguages === null && preferredGenres === null) {
        return res
          .status(400)
          .json({ error: "At least one preference field is required" });
      }

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updated_at: now };
      const insertDefaults: Record<string, unknown> = {
        user_id: user.id,
        inferred_languages: [],
        inferred_genres: [],
        created_at: now,
      };
      if (preferredLanguages !== null)
        updates.preferred_languages = preferredLanguages;
      else insertDefaults.preferred_languages = [];
      if (preferredGenres !== null) updates.preferred_genres = preferredGenres;
      else insertDefaults.preferred_genres = [];

      await db.collection("user_preferences").updateOne(
        { user_id: user.id },
        {
          $set: updates,
          $setOnInsert: insertDefaults,
        },
        { upsert: true },
      );

      const prefs = await db
        .collection("user_preferences")
        .findOne({ user_id: user.id });

      return res.status(200).json({
        data: {
          id: prefs?._id.toString(),
          user_id: user.id,
          preferred_languages: prefs?.preferred_languages || [],
          preferred_genres: prefs?.preferred_genres || [],
          inferred_languages: prefs?.inferred_languages || [],
          inferred_genres: prefs?.inferred_genres || [],
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
