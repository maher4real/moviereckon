/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb";
import { verifyRefreshToken, generateTokens, UserPayload } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const { db } = await connectToDatabase();

    // Check if refresh token exists in database
    const storedToken = await db.collection("refresh_tokens").findOne({
      user_id: payload.id,
      token: refreshToken,
    });

    if (!storedToken) {
      return res.status(401).json({ error: "Refresh token not found or revoked" });
    }

    // Check if token is expired
    if (new Date(storedToken.expires_at) < new Date()) {
      await db.collection("refresh_tokens").deleteOne({ _id: storedToken._id });
      return res.status(401).json({ error: "Refresh token expired" });
    }

    // Get user
    const user = await db.collection("users").findOne({ _id: new ObjectId(payload.id) });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Generate new tokens
    const userPayload: UserPayload = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
    };
    const tokens = generateTokens(userPayload);

    // Delete old refresh token and store new one
    await db.collection("refresh_tokens").deleteOne({ _id: storedToken._id });
    
    const now = new Date().toISOString();
    await db.collection("refresh_tokens").insertOne({
      user_id: user._id.toString(),
      token: tokens.refreshToken,
      created_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        avatar_url: user.avatar_url || null,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      ...tokens,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
