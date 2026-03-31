/**
 * POST /api/auth/login
 * Authenticate user and return JWT tokens
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import {
  comparePassword,
  generateDeviceId,
  generateRefreshSessionId,
  generateTokens,
  getDeviceIdFromRequest,
  getSessionFingerprintFromRequest,
  hashDeviceId,
  hashRefreshToken,
  normalizeUserRole,
  pruneRefreshTokensForUser,
  UserPayload,
} from "../../lib/auth.js";
import { setAuthCookies, setDeviceCookie } from "../../lib/cookies.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { verifyCaptchaToken } from "../../lib/captcha.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import {
  sanitizeEmailAddress,
  sanitizeSingleLineText,
} from "../../lib/input.js";
import { isEmailVerificationSatisfied } from "../../lib/email-auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = sanitizeEmailAddress(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const captchaToken =
      sanitizeSingleLineText(req.body?.captcha_token, 4096, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";

    const clientIp = getClientIp(req);
    const ipRateLimit = await consumeRateLimit(
      `auth:login:ip:${clientIp}`,
      25,
      15 * 60 * 1000,
    );
    const emailRateLimit = await consumeRateLimit(
      `auth:login:email:${email || "missing"}`,
      12,
      15 * 60 * 1000,
    );

    if (!ipRateLimit.allowed || !emailRateLimit.allowed) {
      emitSecurityEvent({
        type: "rate_limit_blocked",
        outcome: "blocked",
        route: "auth_login",
        reason: "login_attempt_limit",
        req,
        metadata: {
          ip_source: ipRateLimit.source,
          email_source: emailRateLimit.source,
        },
      });
      const retryAfter = Math.max(
        ipRateLimit.retryAfterSeconds,
        emailRateLimit.retryAfterSeconds,
        60,
      );
      res.setHeader("Retry-After", String(retryAfter));
      return res
        .status(429)
        .json({ error: "Too many login attempts. Please try again later." });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const captchaResult = await verifyCaptchaToken(req, captchaToken, "login");
    if (!captchaResult.ok) {
      emitSecurityEvent({
        type: "captcha_failed",
        outcome: "blocked",
        route: "auth_login",
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

    // Find user
    const user = await db.collection("users").findOne(
      { email },
      {
        projection: {
          email: 1,
          username: 1,
          role: 1,
          password_hash: 1,
          emailVerified: 1,
          email_verified: 1,
          avatar_url: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
    );
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Accounts created via OAuth may not have a local password hash.
    if (!user.password_hash || typeof user.password_hash !== "string") {
      return res
        .status(401)
        .json({
          error: "This account uses Google sign-in. Continue with Google.",
        });
    }

    // Check password
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!isEmailVerificationSatisfied(user)) {
      return res.status(403).json({
        error: "Please verify your email before signing in.",
        code: "email_not_verified",
      });
    }

    // Generate tokens
    const userPayload: UserPayload = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      role: normalizeUserRole(user.role),
    };
    const sessionId = generateRefreshSessionId();
    const tokens = generateTokens(userPayload, { refreshSessionId: sessionId });
    const sessionFingerprint = getSessionFingerprintFromRequest(req);
    const deviceId = getDeviceIdFromRequest(req) || generateDeviceId();

    // Store refresh token hash (not raw token)
    const now = new Date().toISOString();
    await db.collection("refresh_tokens").insertOne({
      user_id: user._id.toString(),
      session_id: sessionId,
      session_fingerprint: sessionFingerprint,
      device_id_hash: hashDeviceId(deviceId),
      token_hash: hashRefreshToken(tokens.refreshToken),
      // Legacy fallback (disabled for security):
      // token: tokens.refreshToken,
      created_at: now,
      last_used_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await pruneRefreshTokensForUser(db, user._id.toString());

    setDeviceCookie(res, deviceId);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        role: normalizeUserRole(user.role),
        avatar_url: user.avatar_url || null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        emailVerified: isEmailVerificationSatisfied(user),
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
