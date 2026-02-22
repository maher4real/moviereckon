/**
 * GET /api/auth/google-start
 * Redirect browser to Google OAuth consent screen
 */
import { randomBytes } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildAuthErrorRedirectPath,
  buildGoogleAuthorizationUrl,
  getGoogleCallbackUrl,
  getGoogleOAuthConfig,
  normalizeReturnToPath,
  setGoogleOAuthStateCookie,
} from "../../lib/google-oauth.js";

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
