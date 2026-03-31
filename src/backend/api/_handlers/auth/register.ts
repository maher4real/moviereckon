/**
 * POST /api/auth/register
 * Register a new user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
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
import {
  sanitizeEmailAddress,
  sanitizeSingleLineText,
} from "../../lib/input.js";
import {
  buildEmailVerificationUrl,
  buildPendingVerificationUpdate,
  buildVerifiedEmailUpdate,
  createEmailToken,
  isEmailVerificationDisabled,
} from "../../lib/email-auth.js";
import { getPasswordValidationError } from "../../lib/password-policy.js";
import { sendVerificationEmail } from "../../lib/email.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

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
  if (message.includes("users_email_unique") || message.includes(" email"))
    return "email";
  if (
    message.includes("users_username_unique") ||
    message.includes(" username")
  )
    return "username";
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = sanitizeEmailAddress(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const username =
      sanitizeSingleLineText(req.body?.username, 128, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";
    const captchaToken =
      sanitizeSingleLineText(req.body?.captcha_token, 4096, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";

    const clientIp = getClientIp(req);
    const ipRateLimit = await consumeRateLimit(
      `auth:register:ip:${clientIp}`,
      8,
      30 * 60 * 1000,
    );

    if (!ipRateLimit.allowed) {
      emitSecurityEvent({
        type: "rate_limit_blocked",
        outcome: "blocked",
        route: "auth_register",
        reason: "registration_attempt_limit",
        req,
        metadata: { source: ipRateLimit.source },
      });
      res.setHeader(
        "Retry-After",
        String(Math.max(ipRateLimit.retryAfterSeconds, 60)),
      );
      return res
        .status(429)
        .json({
          error: "Too many registration attempts. Please try again later.",
        });
    }

    if (!email || !password || !username) {
      return res
        .status(400)
        .json({ error: "Email, password, and username are required" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res
        .status(400)
        .json({ error: "Please provide a valid email address" });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        error:
          "Username must be 3-24 chars and only include letters, numbers, and underscores",
      });
    }

    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const emailVerificationDisabled = isEmailVerificationDisabled();
    const verificationDetails = emailVerificationDisabled
      ? null
      : createEmailToken("verify-email");

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
      return res
        .status(400)
        .json({ error: captchaResult.error || "CAPTCHA verification failed" });
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
          ...(emailVerificationDisabled
            ? buildVerifiedEmailUpdate(now)
            : buildPendingVerificationUpdate(
                verificationDetails!.tokenHash,
                verificationDetails!.expiresAt,
              )),
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

    const insertedUserId = result.insertedId;
    const userId = insertedUserId.toString();

    // Create user preferences
    await db.collection("user_preferences").insertOne({
      user_id: userId,
      preferred_languages: [],
      preferred_genres: [],
      created_at: now,
      updated_at: now,
    });

    if (!emailVerificationDisabled && verificationDetails) {
      const verificationUrl = buildEmailVerificationUrl(
        req,
        verificationDetails.rawToken,
        email,
      );

      try {
        await sendVerificationEmail({
          toEmail: email,
          username,
          verificationUrl,
        });
      } catch (error) {
        await db.collection("users").deleteOne({ _id: insertedUserId });
        await db.collection("user_preferences").deleteOne({ user_id: userId });
        console.error("Verification email send error:", error);
        return res.status(500).json({
          error: "Unable to send verification email right now. Please try again.",
        });
      }

      return res.status(201).json({
        requires_email_verification: true,
        message:
          "Account created. Check your email to verify your address before signing in.",
        user: null,
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
        emailVerified: true,
      },
      session: "cookie",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
