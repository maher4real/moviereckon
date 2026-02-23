/**
 * POST /api/auth/register
 * Register a new user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import {
  generateTokens,
  hashPassword,
  hashRefreshToken,
  type UserPayload,
} from "../../lib/auth.js";
import { setAuthCookies } from "../../lib/cookies.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { verifyCaptchaToken } from "../../lib/captcha.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

// Temporarily disable email verification until mail delivery is stable.
const EMAIL_VERIFICATION_DISABLED = true;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const captchaToken = typeof req.body?.captcha_token === "string" ? req.body.captcha_token : "";

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

    const captchaResult = await verifyCaptchaToken(req, captchaToken, "signup");
    if (!captchaResult.ok) {
      return res.status(400).json({ error: captchaResult.error || "CAPTCHA verification failed" });
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
      email_verified: EMAIL_VERIFICATION_DISABLED ? true : false,
      email_verified_at: EMAIL_VERIFICATION_DISABLED ? now : null,
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

    // Email verification flow intentionally disabled for now.
    // const { rawToken } = await createEmailVerificationToken(db, { userId, email });
    // const verificationLink = `${getVerificationBaseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
    // await sendVerificationEmail({
    //   toEmail: email,
    //   username,
    //   verificationUrl: verificationLink,
    // });

    const userPayload: UserPayload = {
      id: userId,
      email,
      username,
    };
    const tokens = generateTokens(userPayload);

    await db.collection("refresh_tokens").insertOne({
      user_id: userId,
      token_hash: hashRefreshToken(tokens.refreshToken),
      created_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.status(201).json({
      requires_email_verification: false,
      message: "Account created successfully.",
      user: {
        id: userId,
        email,
        username,
        avatar_url: null,
        created_at: now,
        updated_at: now,
      },
      session: "cookie",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
