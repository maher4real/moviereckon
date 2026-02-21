/**
 * POST /api/auth/register
 * Register a new user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb";
import {
  hashPassword,
  generateTokens,
  hashRefreshToken,
  UserPayload,
} from "../../lib/auth";
import { setAuthCookies } from "../../lib/cookies";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";

    const clientIp = getClientIp(req);
    const ipRateLimit = consumeRateLimit(`auth:register:ip:${clientIp}`, 8, 30 * 60 * 1000);

    if (!ipRateLimit.allowed) {
      res.setHeader("Retry-After", String(Math.max(ipRateLimit.retryAfterSeconds, 60)));
      return res.status(429).json({ error: "Too many registration attempts. Please try again later." });
    }

    if (!email || !password || !username) {
      return res.status(400).json({ error: "Email, password, and username are required" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        error: "Username must be 3-24 chars and only include letters, numbers, and underscores",
      });
    }

    if (password.length < 10) {
      return res.status(400).json({ error: "Password must be at least 10 characters" });
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasUpper || !hasLower || !hasNumber) {
      return res.status(400).json({
        error: "Password must include uppercase, lowercase, and numeric characters",
      });
    }

    const { db } = await connectToDatabase();

    // Check if user already exists
    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Check if username is taken
    const existingUsername = await db.collection("users").findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    const result = await db.collection("users").insertOne({
      email,
      password_hash: passwordHash,
      username,
      avatar_url: null,
      created_at: now,
      updated_at: now,
    });

    const userId = result.insertedId.toString();

    // Create user preferences
    await db.collection("user_preferences").insertOne({
      user_id: userId,
      preferred_languages: [],
      preferred_genres: [],
      created_at: now,
      updated_at: now,
    });

    // Generate tokens
    const userPayload: UserPayload = { id: userId, email, username };
    const tokens = generateTokens(userPayload);

    // Store refresh token hash (not raw token)
    await db.collection("refresh_tokens").insertOne({
      user_id: userId,
      token_hash: hashRefreshToken(tokens.refreshToken),
      // Legacy fallback (disabled for security):
      // token: tokens.refreshToken,
      created_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.status(201).json({
      user: {
        id: userId,
        email,
        username,
        avatar_url: null,
        created_at: now,
        updated_at: now,
      },
      session: "cookie",
      // Legacy fallback response (disabled for security):
      // ...tokens,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
