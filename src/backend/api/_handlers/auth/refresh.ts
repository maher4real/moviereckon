/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import {
  generateDeviceId,
  generateRefreshSessionId,
  getDeviceIdFromRequest,
  verifyRefreshToken,
  generateTokens,
  getSessionFingerprintFromRequest,
  hashDeviceId,
  hashRefreshToken,
  isVersionedSessionFingerprint,
  normalizeUserRole,
  UserPayload,
} from "../../lib/auth.js";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  clearAuthCookies,
  getCookieValue,
  setAuthCookies,
  setDeviceCookie,
} from "../../lib/cookies.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import { isEmailVerificationSatisfied } from "../../lib/email-auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const clientIp = getClientIp(req);
    const ipRateLimit = await consumeRateLimit(
      `auth:refresh:ip:${clientIp}`,
      40,
      15 * 60 * 1000,
    );

    if (!ipRateLimit.allowed) {
      emitSecurityEvent({
        type: "rate_limit_blocked",
        outcome: "blocked",
        route: "auth_refresh",
        reason: "refresh_attempt_limit",
        req,
        metadata: { source: ipRateLimit.source },
      });
      res.setHeader(
        "Retry-After",
        String(Math.max(ipRateLimit.retryAfterSeconds, 60)),
      );
      return res
        .status(429)
        .json({ error: "Too many refresh requests. Please try again later." });
    }

    const cookieRefreshToken =
      getCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE_NAME) || "";
    const refreshToken = cookieRefreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res
        .status(401)
        .json({ error: "Invalid or expired refresh token" });
    }

    const { db } = await connectToDatabase();

    // Check if refresh token exists in database
    const storedToken = await db.collection("refresh_tokens").findOne(
      {
        user_id: payload.id,
        token_hash: hashRefreshToken(refreshToken),
        // Legacy fallback (disabled for security):
        // token: refreshToken,
      },
      {
        projection: {
          _id: 1,
          expires_at: 1,
          session_id: 1,
          session_fingerprint: 1,
          device_id_hash: 1,
        },
      },
    );

    if (!storedToken) {
      return res
        .status(401)
        .json({ error: "Refresh token not found or revoked" });
    }

    // Check if token is expired
    if (new Date(storedToken.expires_at) < new Date()) {
      await db.collection("refresh_tokens").deleteOne({ _id: storedToken._id });
      return res.status(401).json({ error: "Refresh token expired" });
    }

    const currentSessionFingerprint = getSessionFingerprintFromRequest(req);
    const requestDeviceId = getDeviceIdFromRequest(req);
    const requestDeviceHash = requestDeviceId
      ? hashDeviceId(requestDeviceId)
      : null;
    const storedDeviceHash =
      typeof storedToken.device_id_hash === "string" &&
      storedToken.device_id_hash.length > 0
        ? storedToken.device_id_hash
        : null;
    const storedSessionFingerprint =
      typeof storedToken.session_fingerprint === "string" &&
      storedToken.session_fingerprint.length > 0
        ? storedToken.session_fingerprint
        : null;
    const strictSessionBinding =
      process.env.SESSION_BINDING_STRICT === "true" ||
      process.env.NODE_ENV === "production";
    const deviceIdToPersist = requestDeviceId || generateDeviceId();

    if (strictSessionBinding && storedDeviceHash) {
      if (!requestDeviceHash || requestDeviceHash !== storedDeviceHash) {
        emitSecurityEvent({
          type: "refresh_session_mismatch",
          outcome: "blocked",
          route: "auth_refresh",
          reason: "device_binding_mismatch",
          req,
          userId: payload.id,
        });
        await db
          .collection("refresh_tokens")
          .deleteOne({ _id: storedToken._id });
        return res.status(401).json({ error: "Refresh token device mismatch" });
      }
    } else if (
      strictSessionBinding &&
      isVersionedSessionFingerprint(storedSessionFingerprint) &&
      storedSessionFingerprint !== currentSessionFingerprint
    ) {
      emitSecurityEvent({
        type: "refresh_session_mismatch",
        outcome: "blocked",
        route: "auth_refresh",
        reason: "session_fingerprint_mismatch",
        req,
        userId: payload.id,
      });
      await db.collection("refresh_tokens").deleteOne({ _id: storedToken._id });
      return res.status(401).json({ error: "Refresh token session mismatch" });
    }

    if (
      strictSessionBinding &&
      storedDeviceHash &&
      storedSessionFingerprint &&
      storedSessionFingerprint !== currentSessionFingerprint
    ) {
      emitSecurityEvent({
        type: "refresh_session_context_changed",
        outcome: "allowed",
        route: "auth_refresh",
        reason: "device_match_with_context_change",
        req,
        userId: payload.id,
      });
    }

    // Get user
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(payload.id) },
      {
        projection: {
          email: 1,
          username: 1,
          role: 1,
          emailVerified: 1,
          email_verified: 1,
          avatar_url: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
    );
    if (!user) {
      await db.collection("refresh_tokens").deleteOne({ _id: storedToken._id });
      clearAuthCookies(res);
      return res.status(401).json({ error: "User not found" });
    }

    if (!isEmailVerificationSatisfied(user)) {
      await db.collection("refresh_tokens").deleteOne({ _id: storedToken._id });
      clearAuthCookies(res);
      return res.status(401).json({ error: "Email verification required" });
    }

    // Generate new tokens
    const userPayload: UserPayload = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      role: normalizeUserRole(user.role),
    };
    const refreshSessionId =
      (typeof storedToken.session_id === "string" &&
      storedToken.session_id.length > 0
        ? storedToken.session_id
        : payload.sid) || generateRefreshSessionId();
    const tokens = generateTokens(userPayload, { refreshSessionId });

    const now = new Date().toISOString();
    await db.collection("refresh_tokens").updateOne(
      { _id: storedToken._id },
      {
        $set: {
          session_id: refreshSessionId,
          session_fingerprint: currentSessionFingerprint,
          device_id_hash: hashDeviceId(deviceIdToPersist),
          token_hash: hashRefreshToken(tokens.refreshToken),
          created_at: now,
          last_used_at: now,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    );

    setDeviceCookie(res, deviceIdToPersist);
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
    console.error("Refresh token error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
