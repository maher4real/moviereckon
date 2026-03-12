/**
 * GET /api/auth/google-callback
 * Handle Google OAuth callback, create/login user, and issue app session cookies.
 */
import { randomBytes } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Db } from "mongodb";
import { connectToDatabase } from "../../lib/mongodb.js";
import {
  generateDeviceId,
  getDefaultUserRoleForEmail,
  generateRefreshSessionId,
  generateTokens,
  getDeviceIdFromRequest,
  getSessionFingerprintFromRequest,
  hashDeviceId,
  hashRefreshToken,
  normalizeUserRole,
  pruneRefreshTokensForUser,
  type UserPayload,
} from "../../lib/auth.js";
import { getCookieValue, setAuthCookies, setDeviceCookie } from "../../lib/cookies.js";
import {
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  buildAuthErrorRedirectPath,
  clearGoogleOAuthStateCookie,
  fetchGoogleProfile,
  getGoogleCallbackUrl,
  getGoogleOAuthConfig,
  normalizeReturnToPath,
  parseGoogleOAuthState,
  type GoogleProfile,
} from "../../lib/google-oauth.js";

const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

function redirect(res: VercelResponse, location: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  return res.status(302).end();
}

function redirectToOAuthError(res: VercelResponse, errorCode: string) {
  clearGoogleOAuthStateCookie(res);
  return redirect(res, buildAuthErrorRedirectPath(errorCode));
}

function toUsernameSeed(value: string): string {
  let normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) normalized = "user";
  if (normalized.length < 3) normalized = normalized.padEnd(3, "x");
  if (normalized.length > 24) normalized = normalized.slice(0, 24);

  if (!USERNAME_REGEX.test(normalized)) {
    normalized = "user";
  }

  return normalized;
}

async function generateUniqueUsername(db: Db, profile: GoogleProfile): Promise<string> {
  const users = db.collection("users");
  const seedSource = profile.name || profile.given_name || profile.email.split("@")[0] || "user";
  const base = toUsernameSeed(seedSource);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const suffix = attempt === 0 ? "" : `_${Math.floor(Math.random() * 9000) + 1000}`;
    const maxBaseLength = 24 - suffix.length;
    const candidateBase = maxBaseLength > 0 ? base.slice(0, maxBaseLength) : "user";
    const candidate = `${candidateBase}${suffix}`;

    const exists = await users.findOne({ username: candidate }, { projection: { _id: 1 } });
    if (!exists) {
      return candidate;
    }
  }

  const randomFallback = `user_${randomBytes(4).toString("hex")}`.slice(0, 24);
  return randomFallback;
}

async function resolveUserFromGoogleProfile(db: Db, profile: GoogleProfile) {
  const users = db.collection("users");
  const now = new Date().toISOString();
  const defaultRole = getDefaultUserRoleForEmail(profile.email);

  let user = await users.findOne({ google_sub: profile.sub });

  if (user && (user.email_verified !== true || !user.role)) {
    const role = normalizeUserRole(user.role || defaultRole);
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          email_verified: true,
          email_verified_at: now,
          role,
          updated_at: now,
        },
      },
    );
    user = await users.findOne({ _id: user._id });
  }

  if (!user) {
    const userByEmail = await users.findOne({ email: profile.email });
    if (userByEmail) {
      if (userByEmail.google_sub && userByEmail.google_sub !== profile.sub) {
        throw new Error("google_account_conflict");
      }

      const updates: Record<string, unknown> = {
        updated_at: now,
      };

      if (!userByEmail.google_sub) {
        updates.google_sub = profile.sub;
      }

      if (!userByEmail.avatar_url && profile.picture) {
        updates.avatar_url = profile.picture;
      }

      if (userByEmail.email_verified !== true) {
        updates.email_verified = true;
        updates.email_verified_at = now;
      }

      if (!userByEmail.username || typeof userByEmail.username !== "string") {
        updates.username = await generateUniqueUsername(db, profile);
      }
      if (!userByEmail.role) {
        updates.role = defaultRole;
      }

      if (Object.keys(updates).length > 0) {
        await users.updateOne(
          { _id: userByEmail._id },
          { $set: updates },
        );
      }

      user = await users.findOne({ _id: userByEmail._id });
    }
  }

  if (!user) {
    const username = await generateUniqueUsername(db, profile);
    const result = await users.insertOne({
      email: profile.email,
      password_hash: null,
      username,
      role: defaultRole,
      avatar_url: profile.picture || null,
      google_sub: profile.sub,
      email_verified: true,
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    });

    const userId = result.insertedId.toString();

    await db.collection("user_preferences").insertOne({
      user_id: userId,
      preferred_languages: [],
      preferred_genres: [],
      created_at: now,
      updated_at: now,
    });

    user = await users.findOne({ _id: result.insertedId });
  }

  if (!user) {
    throw new Error("google_user_upsert_failed");
  }

  return user;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

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

    const now = new Date().toISOString();
    await db.collection("refresh_tokens").insertOne({
      user_id: user._id.toString(),
      session_id: sessionId,
      session_fingerprint: sessionFingerprint,
      device_id_hash: hashDeviceId(deviceId),
      token_hash: hashRefreshToken(tokens.refreshToken),
      created_at: now,
      last_used_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await pruneRefreshTokensForUser(db, user._id.toString());

    clearGoogleOAuthStateCookie(res);
    setDeviceCookie(res, deviceId);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

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
