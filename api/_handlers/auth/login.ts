/**
 * POST /api/auth/login
 * Authenticate user and return JWT tokens
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb";
import {
  comparePassword,
  generateTokens,
  hashRefreshToken,
  UserPayload,
} from "../../lib/auth";
import { setAuthCookies } from "../../lib/cookies";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    const clientIp = getClientIp(req);
    const ipRateLimit = consumeRateLimit(`auth:login:ip:${clientIp}`, 25, 15 * 60 * 1000);
    const emailRateLimit = consumeRateLimit(
      `auth:login:email:${email || "missing"}`,
      12,
      15 * 60 * 1000,
    );

    if (!ipRateLimit.allowed || !emailRateLimit.allowed) {
      const retryAfter = Math.max(ipRateLimit.retryAfterSeconds, emailRateLimit.retryAfterSeconds, 60);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many login attempts. Please try again later." });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { db } = await connectToDatabase();

    // Find user
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check password
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate tokens
    const userPayload: UserPayload = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
    };
    const tokens = generateTokens(userPayload);

    // Store refresh token hash (not raw token)
    const now = new Date().toISOString();
    await db.collection("refresh_tokens").insertOne({
      user_id: user._id.toString(),
      token_hash: hashRefreshToken(tokens.refreshToken),
      // Legacy fallback (disabled for security):
      // token: tokens.refreshToken,
      created_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

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
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
