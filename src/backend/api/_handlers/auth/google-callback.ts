/**
 * GET /api/auth/google-callback
 * Handle Google OAuth callback, create/login user, and issue app session cookies.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getCookieValue } from "../../lib/cookies.js";
import {
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  buildAuthErrorRedirectPath,
  clearGoogleOAuthStateCookie,
  fetchGoogleProfile,
  getGoogleCallbackUrl,
  getGoogleOAuthConfig,
  normalizeReturnToPath,
  parseGoogleOAuthState,
} from "../../lib/google-oauth.js";
import { enforceRequestRateLimit, hashRateLimitValue } from "../../lib/request-rate-limit.js";
import { getClientIp } from "../../lib/rate-limit.js";
import {
  establishAuthenticatedUserSession,
  resolveUserFromGoogleProfile,
} from "../../lib/google-auth-session.js";

function redirect(res: VercelResponse, location: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  return res.status(302).end();
}

function redirectToOAuthError(res: VercelResponse, errorCode: string) {
  clearGoogleOAuthStateCookie(res);
  return redirect(res, buildAuthErrorRedirectPath(errorCode));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const clientIp = getClientIp(req);
  const rules = [
    {
      key: `auth:google-callback:ip:${clientIp}`,
      maxRequests: 24,
      windowMs: 10 * 60 * 1000,
      metadataKey: "ip",
    },
  ];
  if (stateParam) {
    rules.push({
      key: `auth:google-callback:state:${hashRateLimitValue(stateParam)}`,
      maxRequests: 8,
      windowMs: 10 * 60 * 1000,
      metadataKey: "state",
    });
  }

  if (
    await enforceRequestRateLimit({
      req,
      res,
      route: "auth_google_callback",
      reason: "google_oauth_callback_limit",
      errorMessage: "Too many sign-in attempts. Please try again shortly.",
      rules,
      onBlocked: () => {
        redirectToOAuthError(res, "too_many_requests");
      },
    })
  ) {
    return;
  }

  const stateCookieRaw = getCookieValue(req.headers.cookie, GOOGLE_OAUTH_STATE_COOKIE_NAME);
  const parsedState = parseGoogleOAuthState(stateCookieRaw);

  if (oauthError) {
    return redirectToOAuthError(res, oauthError);
  }

  if (!code || !stateParam || !parsedState || stateParam !== parsedState.nonce) {
    return redirectToOAuthError(res, "invalid_oauth_state");
  }

  try {
    const { clientId, clientSecret } = getGoogleOAuthConfig();
    const callbackUrl = getGoogleCallbackUrl(req);
    const { profile, errorCode } = await fetchGoogleProfile({
      code,
      clientId,
      clientSecret,
      redirectUri: callbackUrl,
    });

    if (!profile || errorCode) {
      return redirectToOAuthError(res, errorCode || "google_profile_fetch_failed");
    }

    const { db } = await connectToDatabase();
    const user = await resolveUserFromGoogleProfile(db, profile);
    await establishAuthenticatedUserSession(req, res, db, user);
    clearGoogleOAuthStateCookie(res);

    const returnTo = normalizeReturnToPath(req, parsedState.returnTo);
    return redirect(res, returnTo);
  } catch (error) {
    const codeFromError =
      error instanceof Error && error.message === "google_account_conflict"
        ? "google_account_conflict"
        : "google_callback_failed";

    console.error("Google OAuth callback error:", error);
    return redirectToOAuthError(res, codeFromError);
  }
}
