/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import {
  verifyRefreshToken,
  generateTokens,
  hashRefreshToken,
  UserPayload,
} from "../../lib/auth.js";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  getCookieValue,
  setAuthCookies,
} from "../../lib/cookies.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const clientIp = getClientIp(req);
    const ipRateLimit = consumeRateLimit(`auth:refresh:ip:${clientIp}`, 40, 15 * 60 * 1000);

    if (!ipRateLimit.allowed) {
      res.setHeader("Retry-After", String(Math.max(ipRateLimit.retryAfterSeconds, 60)));
      return res.status(429).json({ error: "Too many refresh requests. Please try again later." });
    }

    const bodyRefreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    const cookieRefreshToken = getCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE_NAME) || "";

    const refreshToken = bodyRefreshToken || cookieRefreshToken;
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
      token_hash: hashRefreshToken(refreshToken),
      // Legacy fallback (disabled for security):
      // token: refreshToken,
    }, { projection: { _id: 1, expires_at: 1 } });

    if (!storedToken) {
      return res.status(401).json({ error: "Refresh token not found or revoked" });
    }

    // Check if token is expired
    if (new Date(storedToken.expires_at) < new Date()) {
      await db.collection("refresh_tokens").deleteOne({ _id: storedToken._id });
      return res.status(401).json({ error: "Refresh token expired" });
    }

    // Get user
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(payload.id) },
      {
        projection: {
          email: 1,
          username: 1,
          avatar_url: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
    );
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

    const now = new Date().toISOString();
    await db.collection("refresh_tokens").updateOne(
      { _id: storedToken._id },
      {
        $set: {
          token_hash: hashRefreshToken(tokens.refreshToken),
          created_at: now,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    );

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        avatar_url: user.avatar_url || null,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      session: "cookie",
      // Legacy fallback response (disabled for security):
      // ...tokens,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
