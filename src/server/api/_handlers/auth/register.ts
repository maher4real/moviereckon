/**
 * POST /api/auth/register
 * Register a new user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { hashPassword } from "../../lib/auth.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { verifyCaptchaToken } from "../../lib/captcha.js";
import { createEmailVerificationToken } from "../../lib/email-verification.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { getRequestOrigin } from "../../lib/google-oauth.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

function getVerificationBaseUrl(req: VercelRequest): string {
  const explicitBase = process.env.EMAIL_VERIFICATION_BASE_URL;
  if (typeof explicitBase === "string" && explicitBase.trim().length > 0) {
    return explicitBase.trim().replace(/\/$/, "");
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    throw new Error("Unable to determine request origin for verification email");
  }

  return origin.replace(/\/$/, "");
}

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
      if (existingUser.email_verified === false) {
        return res.status(400).json({
          error: "Email already registered but not verified. Please check your inbox.",
        });
      }
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
      email_verified: false,
      email_verified_at: null,
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

    const { rawToken } = await createEmailVerificationToken(db, {
      userId,
      email,
    });
    const verificationLink = `${getVerificationBaseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

    let previewUrl: string | null = null;
    try {
      const result = await sendVerificationEmail({
        toEmail: email,
        username,
        verificationUrl: verificationLink,
      });
      previewUrl = result.previewUrl;
    } catch (sendError) {
      // Roll back account creation if verification email cannot be sent.
      await db.collection("email_verification_tokens").deleteMany({ user_id: userId });
      await db.collection("user_preferences").deleteMany({ user_id: userId });
      await db.collection("users").deleteOne({ _id: result.insertedId });
      throw sendError;
    }

    return res.status(201).json(
      previewUrl
        ? {
            requires_email_verification: true,
            message: "Account created. Check your email to verify before signing in.",
            verification_preview_url: previewUrl,
          }
        : {
            requires_email_verification: true,
            message: "Account created. Check your email to verify before signing in.",
          },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
