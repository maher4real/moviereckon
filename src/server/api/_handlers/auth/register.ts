/**
 * POST /api/auth/register
 * Register a new user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import {
  buildEmailVerificationUrl,
  createEmailVerificationToken,
} from "../../lib/email-verification.js";
import { sendVerificationEmail } from "../../lib/email.js";
import {
  generateDeviceId,
  getDefaultUserRoleForEmail,
  generateRefreshSessionId,
  generateTokens,
  getDeviceIdFromRequest,
  getSessionFingerprintFromRequest,
  hashDeviceId,
  hashPassword,
  hashRefreshToken,
  pruneRefreshTokensForUser,
  type UserPayload,
} from "../../lib/auth.js";
import { setAuthCookies, setDeviceCookie } from "../../lib/cookies.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { verifyCaptchaToken } from "../../lib/captcha.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "../../lib/input.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

const EMAIL_VERIFICATION_DISABLED = process.env.EMAIL_VERIFICATION_DISABLED === "true";
const FIREBASE_VERIFICATION_PROVIDER = "firebase";
const INTERNAL_VERIFICATION_PROVIDER = "internal";

function parseDuplicateField(error: unknown): "email" | "username" | null {
  if (!error || typeof error !== "object") return null;
  const duplicate = error as {
    code?: number;
    keyPattern?: Record<string, number>;
    message?: string;
  };
  if (duplicate.code !== 11000) return null;
  if (duplicate.keyPattern?.email) return "email";
  if (duplicate.keyPattern?.username) return "username";

  const message = String(duplicate.message || "").toLowerCase();
  if (message.includes("users_email_unique") || message.includes(" email")) return "email";
  if (message.includes("users_username_unique") || message.includes(" username")) return "username";
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = sanitizeEmailAddress(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const username = sanitizeSingleLineText(req.body?.username, 128, {
      fallback: "",
      collapseWhitespace: false,
    }) || "";
    const captchaToken =
      sanitizeSingleLineText(req.body?.captcha_token, 4096, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";
    const requestedVerificationProvider =
      sanitizeSingleLineText(req.body?.email_verification_provider, 32, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";
    const emailVerificationProvider =
      requestedVerificationProvider === FIREBASE_VERIFICATION_PROVIDER
        ? FIREBASE_VERIFICATION_PROVIDER
        : INTERNAL_VERIFICATION_PROVIDER;

    const clientIp = getClientIp(req);
    const ipRateLimit = await consumeRateLimit(`auth:register:ip:${clientIp}`, 8, 30 * 60 * 1000);

    if (!ipRateLimit.allowed) {
      emitSecurityEvent({
        type: "rate_limit_blocked",
        outcome: "blocked",
        route: "auth_register",
        reason: "registration_attempt_limit",
        req,
        metadata: { source: ipRateLimit.source },
      });
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
      emitSecurityEvent({
        type: "captcha_failed",
        outcome: "blocked",
        route: "auth_register",
        reason: captchaResult.reason || "captcha_verification_failed",
        req,
        metadata: {
          captcha_error_codes: captchaResult.errorCodes,
          captcha_response_action: captchaResult.responseAction,
          captcha_response_hostname: captchaResult.responseHostname,
        },
      });
      return res.status(400).json({ error: captchaResult.error || "CAPTCHA verification failed" });
    }

    const { db } = await connectToDatabase();
    const role = getDefaultUserRoleForEmail(email);

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const result = await (async () => {
      try {
        return await db.collection("users").insertOne({
          email,
          password_hash: passwordHash,
          username,
          role,
          avatar_url: null,
          email_verification_provider: EMAIL_VERIFICATION_DISABLED
            ? INTERNAL_VERIFICATION_PROVIDER
            : emailVerificationProvider,
          email_verified: EMAIL_VERIFICATION_DISABLED ? true : false,
          email_verified_at: EMAIL_VERIFICATION_DISABLED ? now : null,
          created_at: now,
          updated_at: now,
        });
      } catch (error) {
        const duplicateField = parseDuplicateField(error);
        if (duplicateField === "email") {
          res.status(400).json({ error: "Email already registered" });
          return null;
        }
        if (duplicateField === "username") {
          res.status(400).json({ error: "Username already taken" });
          return null;
        }
        throw error;
      }
    })();

    if (!result) return;

    const userId = result.insertedId.toString();

    // Create user preferences
    await db.collection("user_preferences").insertOne({
      user_id: userId,
      preferred_languages: [],
      preferred_genres: [],
      created_at: now,
      updated_at: now,
    });

    if (!EMAIL_VERIFICATION_DISABLED) {
      if (emailVerificationProvider === FIREBASE_VERIFICATION_PROVIDER) {
        return res.status(201).json({
          requires_email_verification: true,
          verification_provider: FIREBASE_VERIFICATION_PROVIDER,
          message: "Account created. Check your email to verify your address before signing in.",
          user: null,
          verification_preview_url: null,
        });
      }

      const { rawToken } = await createEmailVerificationToken(db, { userId, email });
      const verificationLink = buildEmailVerificationUrl(req, rawToken);

      let verificationPreviewUrl: string | null = null;

      try {
        const emailResult = await sendVerificationEmail({
          userId,
          toEmail: email,
          username,
          verificationUrl: verificationLink,
        });
        verificationPreviewUrl = emailResult.previewUrl;
      } catch (verificationError) {
        console.error("Verification email send error:", verificationError);
      }

      return res.status(201).json({
        requires_email_verification: true,
        verification_provider: INTERNAL_VERIFICATION_PROVIDER,
        message: "Account created. Check your email to verify your address before signing in.",
        user: null,
        verification_preview_url: verificationPreviewUrl,
      });
    }

    const userPayload: UserPayload = {
      id: userId,
      email,
      username,
      role,
    };
    const sessionId = generateRefreshSessionId();
    const tokens = generateTokens(userPayload, { refreshSessionId: sessionId });
    const sessionFingerprint = getSessionFingerprintFromRequest(req);
    const deviceId = getDeviceIdFromRequest(req) || generateDeviceId();

    await db.collection("refresh_tokens").insertOne({
      user_id: userId,
      session_id: sessionId,
      session_fingerprint: sessionFingerprint,
      device_id_hash: hashDeviceId(deviceId),
      token_hash: hashRefreshToken(tokens.refreshToken),
      created_at: now,
      last_used_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await pruneRefreshTokensForUser(db, userId);

    setDeviceCookie(res, deviceId);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.status(201).json({
      requires_email_verification: false,
      message: "Account created successfully.",
      user: {
        id: userId,
        email,
        username,
        role,
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
