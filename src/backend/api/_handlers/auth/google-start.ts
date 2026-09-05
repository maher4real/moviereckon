/**
 * GET /api/auth/google-start
 * Redirect browser to Google OAuth consent screen
 */
import { randomBytes } from "crypto";
import type { VercelRequest, VercelResponse } from "../../lib/http";
import {
  buildAuthErrorRedirectPath,
  buildGoogleAuthorizationUrl,
  getGoogleCallbackUrl,
  getGoogleOAuthConfig,
  normalizeReturnToPath,
  setGoogleOAuthStateCookie,
} from "../../lib/google-oauth.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";
import { getClientIp } from "../../lib/rate-limit.js";

function redirect(res: VercelResponse, location: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  return res.status(302).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const clientIp = getClientIp(req);
    if (
      await enforceRequestRateLimit({
        req,
        res,
        route: "auth_google_start",
        reason: "google_oauth_start_limit",
        errorMessage: "Too many sign-in attempts. Please try again shortly.",
        rules: [
          {
            key: `auth:google-start:ip:${clientIp}`,
            maxRequests: 24,
            windowMs: 10 * 60 * 1000,
            metadataKey: "ip",
          },
        ],
        onBlocked: () => {
          redirect(res, buildAuthErrorRedirectPath("too_many_requests"));
        },
      })
    ) {
      return;
    }

    const { clientId } = getGoogleOAuthConfig();
    const callbackUrl = getGoogleCallbackUrl(req);
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const returnTo = normalizeReturnToPath(req, url.searchParams.get("returnTo"));
    const nonce = randomBytes(24).toString("hex");

    setGoogleOAuthStateCookie(res, {
      nonce,
      returnTo,
      createdAt: Date.now(),
    });

    const googleUrl = buildGoogleAuthorizationUrl({
      clientId,
      redirectUri: callbackUrl,
      state: nonce,
    });

    return redirect(res, googleUrl);
  } catch (error) {
    console.error("Google OAuth start error:", error);
    return redirect(res, buildAuthErrorRedirectPath("google_oauth_unavailable"));
  }
}
