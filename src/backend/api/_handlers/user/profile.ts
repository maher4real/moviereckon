/**
 * GET/PUT /api/user/profile
 * Manage user profile
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest, normalizeUserRole } from "../../lib/auth.js";
import { deleteManagedAvatarBlob } from "../../lib/blob.js";
import { sanitizeSingleLineText } from "../../lib/input.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
const DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const MAX_AVATAR_URL_LENGTH = 500;
const MAX_AVATAR_DATA_URL_LENGTH = 260_000;
const PROFILE_PROJECTION = {
  email: 1,
  username: 1,
  role: 1,
  avatar_url: 1,
  created_at: 1,
  updated_at: 1,
} as const;

function isDuplicateUsernameError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const duplicate = error as {
    code?: number;
    keyPattern?: Record<string, number>;
    message?: string;
  };
  if (duplicate.code !== 11000) return false;
  if (duplicate.keyPattern?.username) return true;
  const message = String(duplicate.message || "").toLowerCase();
  return message.includes("users_username_unique") || message.includes("username");
}

function normalizeUsername(value: unknown): string | null {
  const username = sanitizeSingleLineText(value, 128, { collapseWhitespace: false });
  if (!username) return null;
  if (!USERNAME_REGEX.test(username)) return null;
  return username;
}

function normalizeAvatarUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const normalized = sanitizeSingleLineText(value, Number.MAX_SAFE_INTEGER, {
    collapseWhitespace: false,
  });
  if (!normalized) return null;

  if (normalized.startsWith("data:image/")) {
    if (normalized.length > MAX_AVATAR_DATA_URL_LENGTH) return undefined;
    if (!DATA_IMAGE_REGEX.test(normalized)) return undefined;
    return normalized;
  }

  if (normalized.length > MAX_AVATAR_URL_LENGTH) return undefined;

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

  const method = (req.method || "GET").toUpperCase();
  const methodLimits: Record<string, { maxRequests: number; windowMs: number }> = {
    GET: { maxRequests: 60, windowMs: 5 * 60 * 1000 },
    PUT: { maxRequests: 18, windowMs: 10 * 60 * 1000 },
  };
  const methodLimit = methodLimits[method];
  if (
    methodLimit &&
    (await enforceRequestRateLimit({
      req,
      res,
      route: "user_profile",
      reason: "profile_limit",
      errorMessage: "Too many profile requests. Please try again shortly.",
      metadata: { method },
      rules: [
        {
          key: `user:profile:user:${userPayload.id}:${method}`,
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
    // GET - Fetch profile
    if (req.method === "GET") {
      const user = await db.collection("users").findOne(
        { _id: new ObjectId(userPayload.id) },
        { projection: PROFILE_PROJECTION }
      );

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        data: {
          id: user._id.toString(),
          user_id: user._id.toString(),
          email: user.email,
          username: user.username,
          role: normalizeUserRole(user.role),
          avatar_url: user.avatar_url || null,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      });
    }

    // PUT - Update profile
    if (req.method === "PUT") {
      const existingUser = await db.collection("users").findOne(
        { _id: new ObjectId(userPayload.id) },
        { projection: { avatar_url: 1 } }
      );

      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

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
        return res.status(400).json({
          error:
            "avatar_url must be a valid http(s) URL, a base64 data:image URL under ~260KB, or null",
        });
      }

      if (!usernameProvided && !avatarProvided) {
        return res.status(400).json({ error: "No profile fields provided" });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (usernameProvided) updates.username = username;
      if (avatarProvided) updates.avatar_url = avatarUrl;

      try {
        await db.collection("users").updateOne(
          { _id: new ObjectId(userPayload.id) },
          { $set: updates }
        );
      } catch (error) {
        if (isDuplicateUsernameError(error)) {
          return res.status(400).json({ error: "Username already taken" });
        }
        throw error;
      }

      if (
        avatarProvided &&
        typeof existingUser.avatar_url === "string" &&
        existingUser.avatar_url !== avatarUrl
      ) {
        void deleteManagedAvatarBlob(existingUser.avatar_url).catch((error) => {
          console.error("Previous avatar cleanup failed:", error);
        });
      }

      const user = await db.collection("users").findOne(
        { _id: new ObjectId(userPayload.id) },
        { projection: PROFILE_PROJECTION }
      );

      return res.status(200).json({
        data: {
          id: user?._id.toString(),
          user_id: user?._id.toString(),
          email: user?.email,
          username: user?.username,
          role: normalizeUserRole(user?.role),
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
