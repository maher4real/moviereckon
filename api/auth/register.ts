/**
 * POST /api/auth/register
 * Register a new user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../lib/mongodb";
import { hashPassword, generateTokens, UserPayload } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: "Email, password, and username are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const { db } = await connectToDatabase();

    // Check if user already exists
    const existingUser = await db.collection("users").findOne({ email: email.toLowerCase() });
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
      email: email.toLowerCase(),
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
    const userPayload: UserPayload = { id: userId, email: email.toLowerCase(), username };
    const tokens = generateTokens(userPayload);

    // Store refresh token
    await db.collection("refresh_tokens").insertOne({
      user_id: userId,
      token: tokens.refreshToken,
      created_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return res.status(201).json({
      user: {
        id: userId,
        email: email.toLowerCase(),
        username,
        avatar_url: null,
        created_at: now,
        updated_at: now,
      },
      ...tokens,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
