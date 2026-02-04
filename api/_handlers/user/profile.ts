/**
 * GET/PUT /api/user/profile
 * Manage user profile
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { extractTokenFromHeader, verifyAccessToken } from "../../lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate user
  const token = extractTokenFromHeader(req.headers.authorization as string | null);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userPayload = verifyAccessToken(token);
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
      const { username, avatar_url } = req.body;

      const updates: any = { updated_at: new Date().toISOString() };
      if (username !== undefined) updates.username = username;
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;

      // Check if username is taken (if changing)
      if (username) {
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
