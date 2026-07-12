import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { sanitizeSingleLineText } from "../../lib/input.js";
import {
  clearGoogleOneTapNonceCookie,
  createGoogleOneTapNonce,
  getGoogleOAuthClientId,
  getGoogleOneTapNonceFromRequest,
  setGoogleOneTapNonceCookie,
  verifyGoogleIdToken,
} from "../../lib/google-oauth.js";
import {
  buildAuthenticatedUserPayload,
  establishAuthenticatedUserSession,
  resolveUserFromGoogleProfile,
} from "../../lib/google-auth-session.js";
import { enforceRequestRateLimit, hashRateLimitValue } from "../../lib/request-rate-limit.js";
import { getClientIp } from "../../lib/rate-limit.js";

function isGoogleOneTapEnabled(): boolean {
  return process.env.GOOGLE_ONE_TAP_ENABLED?.trim().toLowerCase() === "true";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const enabled = isGoogleOneTapEnabled();
    const clientId = getGoogleOAuthClientId();
    const nonce = enabled && clientId ? createGoogleOneTapNonce() : null;
    if (nonce) {
      setGoogleOneTapNonceCookie(res, nonce);
    } else {
      clearGoogleOneTapNonceCookie(res);
    }
    return res.status(200).json({
      enabled: enabled && clientId.length > 0,
      client_id: enabled && clientId ? clientId : null,
      nonce,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!isGoogleOneTapEnabled()) {
      clearGoogleOneTapNonceCookie(res);
      return res.status(404).json({
        error: "Google One Tap is not enabled",
        code: "google_one_tap_disabled",
      });
    }

    const credential =
      sanitizeSingleLineText(req.body?.credential, 6_000, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    const clientId = getGoogleOAuthClientId();
    if (!clientId) {
      return res.status(503).json({ error: "Google sign-in is not configured" });
    }
    const nonce = getGoogleOneTapNonceFromRequest(req);
    if (!nonce) {
      return res.status(400).json({
        error: "Google sign-in could not be completed. Please try again.",
        code: "invalid_google_nonce",
      });
    }

    const clientIp = getClientIp(req);
    if (
      await enforceRequestRateLimit({
        req,
        res,
        route: "auth_google_one_tap",
        reason: "google_one_tap_limit",
        errorMessage: "Too many Google sign-in attempts. Please try again shortly.",
        rules: [
          {
            key: `auth:google-one-tap:ip:${clientIp}`,
            maxRequests: 18,
            windowMs: 10 * 60 * 1000,
            metadataKey: "ip",
          },
          {
            key: `auth:google-one-tap:credential:${hashRateLimitValue(credential)}`,
            maxRequests: 6,
            windowMs: 10 * 60 * 1000,
            metadataKey: "credential",
          },
        ],
      })
    ) {
      return;
    }

    const { profile, errorCode } = await verifyGoogleIdToken({
      credential,
      clientId,
      nonce,
    });
    clearGoogleOneTapNonceCookie(res);
    if (!profile || errorCode) {
      const statusCode = errorCode === "email_not_verified" ? 403 : 401;
      return res.status(statusCode).json({
        error:
          errorCode === "email_not_verified"
            ? "Your Google account email must be verified to continue."
            : "Google sign-in could not be completed. Please try again.",
        code: errorCode || "credential_verification_failed",
      });
    }

    const { db } = await connectToDatabase();
    const user = await resolveUserFromGoogleProfile(db, profile);
    await establishAuthenticatedUserSession(req, res, db, user);

    return res.status(200).json({
      user: buildAuthenticatedUserPayload(user),
      session: "cookie",
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message === "google_account_conflict"
        ? "google_account_conflict"
        : "google_one_tap_failed";

    clearGoogleOneTapNonceCookie(res);
    console.error("Google One Tap error:", error);
    return res.status(code === "google_account_conflict" ? 409 : 500).json({
      error:
        code === "google_account_conflict"
          ? "This email is already linked to a different Google account."
          : "Google sign-in could not be completed. Please try again.",
      code,
    });
  }
}
