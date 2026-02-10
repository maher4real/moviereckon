/**
 * GET/PUT /api/user/profile
 * Manage user profile
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  if (!USERNAME_REGEX.test(username)) return null;
  return username;
}

function normalizeAvatarUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (!normalized || normalized.length > 500) return undefined;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate user
  const userPayload = await getUserFromRequest(req);
  if (!userPayload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { db } = await connectToDatabase();

  try {
    // GET - Fetch profile
    if (req.method === "GET") {
      const user = await db.collection("users").findOne({ _id: new ObjectId(userPayload.id) });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        data: {
          id: user._id.toString(),
          user_id: user._id.toString(),
          email: user.email,
          username: user.username,
          avatar_url: user.avatar_url || null,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      });
    }

    // PUT - Update profile
    if (req.method === "PUT") {
      const body = req.body || {};
      const usernameProvided = body.username !== undefined;
      const avatarProvided = body.avatar_url !== undefined;
      const username = usernameProvided ? normalizeUsername(body.username) : undefined;
      const avatarUrl = normalizeAvatarUrl(body.avatar_url);

      if (usernameProvided && username === null) {
        return res.status(400).json({
          error: "Username must be 3-24 chars and only include letters, numbers, and underscores",
        });
      }

      if (avatarProvided && avatarUrl === undefined) {
        return res.status(400).json({ error: "avatar_url must be a valid http(s) URL or null" });
      }

      if (!usernameProvided && !avatarProvided) {
        return res.status(400).json({ error: "No profile fields provided" });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (usernameProvided) updates.username = username;
      if (avatarProvided) updates.avatar_url = avatarUrl;

      // Check if username is taken (if changing)
      if (usernameProvided && username) {
        const existing = await db.collection("users").findOne({
          username,
          _id: { $ne: new ObjectId(userPayload.id) },
        });
        if (existing) {
          return res.status(400).json({ error: "Username already taken" });
        }
      }

      await db.collection("users").updateOne(
        { _id: new ObjectId(userPayload.id) },
        { $set: updates }
      );

      const user = await db.collection("users").findOne({ _id: new ObjectId(userPayload.id) });

      return res.status(200).json({
        data: {
          id: user?._id.toString(),
          user_id: user?._id.toString(),
          email: user?.email,
          username: user?.username,
          avatar_url: user?.avatar_url || null,
          created_at: user?.created_at,
          updated_at: user?.updated_at,
        },
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Profile error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
