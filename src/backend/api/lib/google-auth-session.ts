import { randomBytes } from "crypto";
import type { VercelRequest, VercelResponse } from "./http";
import type { Db } from "mongodb";
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
} from "./auth.js";
import { setAuthCookies, setDeviceCookie } from "./cookies.js";
import {
  buildVerificationTokenUnset,
  buildVerifiedEmailUpdate,
  isUserEmailVerified,
} from "./email-auth.js";
import type { GoogleProfile } from "./google-oauth.js";

const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

type GoogleAuthUserDoc = {
  _id: { toString(): string };
  avatar_url?: string | null;
  created_at: string;
  email: string;
  emailVerified?: boolean;
  email_verified?: boolean;
  role?: unknown;
  updated_at: string;
  username: string;
};

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

  return `user_${randomBytes(4).toString("hex")}`.slice(0, 24);
}

export async function resolveUserFromGoogleProfile(
  db: Db,
  profile: GoogleProfile,
): Promise<GoogleAuthUserDoc> {
  const users = db.collection("users");
  const now = new Date().toISOString();
  const defaultRole = getDefaultUserRoleForEmail(profile.email);

  let user = await users.findOne({ google_sub: profile.sub });

  if (user && (!isUserEmailVerified(user) || !user.role)) {
    const role = normalizeUserRole(user.role || defaultRole);
    const updateDoc: {
      $set: Record<string, unknown>;
      $unset?: Record<string, string>;
    } = {
      $set: {
        ...buildVerifiedEmailUpdate(now),
        role,
        updated_at: now,
      },
    };
    if (!isUserEmailVerified(user)) {
      updateDoc.$unset = buildVerificationTokenUnset();
    }
    await users.updateOne(
      { _id: user._id },
      updateDoc,
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
      let shouldUnsetVerificationTokens = false;

      if (!userByEmail.google_sub) {
        updates.google_sub = profile.sub;
      }

      if (!userByEmail.avatar_url && profile.picture) {
        updates.avatar_url = profile.picture;
      }

      if (!isUserEmailVerified(userByEmail)) {
        Object.assign(updates, buildVerifiedEmailUpdate(now));
        shouldUnsetVerificationTokens = true;
      }

      if (!userByEmail.username || typeof userByEmail.username !== "string") {
        updates.username = await generateUniqueUsername(db, profile);
      }

      if (!userByEmail.role) {
        updates.role = defaultRole;
      }

      if (Object.keys(updates).length > 0) {
        const updateDoc: {
          $set: Record<string, unknown>;
          $unset?: Record<string, string>;
        } = { $set: updates };
        if (shouldUnsetVerificationTokens) {
          updateDoc.$unset = buildVerificationTokenUnset();
        }
        await users.updateOne({ _id: userByEmail._id }, updateDoc);
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
      ...buildVerifiedEmailUpdate(now),
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

  return user as unknown as GoogleAuthUserDoc;
}

export async function establishAuthenticatedUserSession(
  req: VercelRequest,
  res: VercelResponse,
  db: Db,
  user: GoogleAuthUserDoc,
): Promise<void> {
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

  setDeviceCookie(res, deviceId);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
}

export function buildAuthenticatedUserPayload(user: GoogleAuthUserDoc) {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    role: normalizeUserRole(user.role),
    avatar_url: user.avatar_url || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
    emailVerified: true,
  };
}
