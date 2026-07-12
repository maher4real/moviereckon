/**
 * JWT Authentication Utilities
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { connectToDatabase, ObjectId } from "./mongodb.js";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  DEVICE_ID_COOKIE_NAME,
  getCookieValue,
} from "./cookies.js";
import { isEmailVerificationSatisfied } from "./email-auth.js";
import type { Db } from "mongodb";
import { getConfiguredAuthBaseURL } from "./auth-base-url.js";

function getJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  // Legacy fallback (disabled for security):
  // const value = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET must be configured and at least 32 characters");
  }
  return value;
}

function getRefreshTokenPepper(): string {
  return process.env.REFRESH_TOKEN_PEPPER || getJwtSecret();
}

const JWT_ISSUER = "moviereckon";
const JWT_AUDIENCE = "moviereckon-web";

const JWT_EXPIRES_IN = "15m";
// Legacy fallback (disabled for security):
// const JWT_EXPIRES_IN = "7d";

const REFRESH_TOKEN_EXPIRES_IN = "30d";
const SESSION_FINGERPRINT_VERSION = "v2";

export type UserRole = "user" | "moderator" | "admin";

const ROLE_RANK: Record<UserRole, number> = {
  user: 1,
  moderator: 2,
  admin: 3,
};

function getBootstrapAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

export function normalizeUserRole(value: unknown): UserRole {
  if (value === "admin" || value === "moderator" || value === "user") {
    return value;
  }
  return "user";
}

export function hasRequiredRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

export function getDefaultUserRoleForEmail(email: string): UserRole {
  const normalizedEmail = email.trim().toLowerCase();
  if (getBootstrapAdminEmails().has(normalizedEmail)) {
    return "admin";
  }
  return "user";
}

export interface UserPayload {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function generateRefreshSessionId(): string {
  return randomBytes(16).toString("hex");
}

export function generateDeviceId(): string {
  return randomBytes(24).toString("hex");
}

export function generateTokens(
  user: UserPayload,
  options: { refreshSessionId?: string } = {},
): TokenPair {
  const refreshSessionId = options.refreshSessionId || generateRefreshSessionId();
  const jwtSecret = getJwtSecret();

  const accessToken = jwt.sign(user, jwtSecret, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  const refreshToken = jwt.sign(
    { id: user.id, type: "refresh", sid: refreshSessionId },
    jwtSecret,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as Partial<UserPayload>;
    if (!decoded || typeof decoded.id !== "string") return null;
    if (typeof decoded.email !== "string" || typeof decoded.username !== "string") return null;
    return {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      role: normalizeUserRole(decoded.role),
    };
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { id: string; sid: string | null } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { id: string; type: string; sid?: unknown };
    if (decoded.type !== "refresh") return null;
    const sid = typeof decoded.sid === "string" && decoded.sid.length > 0 ? decoded.sid : null;
    return { id: decoded.id, sid };
  } catch {
    return null;
  }
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(`${getRefreshTokenPepper()}:${token}`).digest("hex");
}

export function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(`${getRefreshTokenPepper()}:device:${deviceId}`).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
}

type RequestLike = {
  headers:
    | { get(name: string): string | null }
    | Record<string, string | string[] | undefined>
    | { authorization?: string; cookie?: string };
};

type FetchLikeHeaders = { get(name: string): string | null };

function isFetchLikeHeaders(headers: RequestLike["headers"]): headers is FetchLikeHeaders {
  return typeof (headers as FetchLikeHeaders).get === "function";
}

function getHeaderValue(headers: RequestLike["headers"], headerName: string): string | null {
  if (isFetchLikeHeaders(headers)) {
    return headers.get(headerName);
  }

  const normalizedHeaderName = headerName.toLowerCase();
  const direct = (headers as Record<string, string | string[] | undefined>)[normalizedHeaderName];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct) && direct.length > 0) return direct[0] ?? null;

  return null;
}

export function getSessionFingerprintFromRequest(request: RequestLike): string {
  const userAgent = (getHeaderValue(request.headers, "user-agent") || "").trim().slice(0, 400);
  const acceptLanguage = (getHeaderValue(request.headers, "accept-language") || "")
    .trim()
    .slice(0, 120);
  const normalizedUserAgent = userAgent.toLowerCase();
  const normalizedAcceptLanguage = acceptLanguage.toLowerCase();

  const browserFamily = (() => {
    if (normalizedUserAgent.includes("edg/")) return "edge";
    if (normalizedUserAgent.includes("opr/") || normalizedUserAgent.includes("opera")) {
      return "opera";
    }
    if (normalizedUserAgent.includes("firefox/") || normalizedUserAgent.includes("fxios/")) {
      return "firefox";
    }
    if (normalizedUserAgent.includes("crios/") || normalizedUserAgent.includes("chrome/")) {
      return "chrome";
    }
    if (normalizedUserAgent.includes("safari/") && normalizedUserAgent.includes("version/")) {
      return "safari";
    }
    return "other";
  })();

  const platformFamily = (() => {
    if (normalizedUserAgent.includes("iphone")) return "iphone";
    if (normalizedUserAgent.includes("ipad")) return "ipad";
    if (normalizedUserAgent.includes("android")) return "android";
    if (normalizedUserAgent.includes("macintosh") || normalizedUserAgent.includes("mac os x")) {
      return "mac";
    }
    if (normalizedUserAgent.includes("windows")) return "windows";
    if (normalizedUserAgent.includes("cros")) return "chromeos";
    if (normalizedUserAgent.includes("linux")) return "linux";
    return "other";
  })();

  const primaryLanguage =
    normalizedAcceptLanguage
      .split(",")[0]
      ?.split(";")[0]
      ?.trim()
      ?.slice(0, 16) || "unknown";

  return `${SESSION_FINGERPRINT_VERSION}:${createHash("sha256")
    .update(
      `${getRefreshTokenPepper()}:browser:${browserFamily}|platform:${platformFamily}|lang:${primaryLanguage}`,
    )
    .digest("hex")}`;
}

export function isVersionedSessionFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(`${SESSION_FINGERPRINT_VERSION}:`) &&
    value.length > SESSION_FINGERPRINT_VERSION.length + 1
  );
}

export function getDeviceIdFromRequest(request: RequestLike): string | null {
  const cookieHeader = getHeaderValue(request.headers, "cookie") ?? undefined;
  return getCookieValue(cookieHeader, DEVICE_ID_COOKIE_NAME);
}

function getSingleHeader(headers: RequestLike["headers"], name: string): string | null {
  if (isFetchLikeHeaders(headers)) {
    return headers.get(name) || headers.get(name.toLowerCase()) || null;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw;
}

async function getBetterAuthSessionUser(
  request: RequestLike,
): Promise<{ id: string; email: string; username: string; role: unknown } | null> {
  const cookieHeader = getHeaderValue(request.headers, "cookie") ?? undefined;
  const authorizationHeader = getSingleHeader(request.headers, "authorization");

  if (!cookieHeader && !authorizationHeader) return null;

  const headers = new Headers();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (authorizationHeader) headers.set("authorization", authorizationHeader);
  const authBaseURL = getConfiguredAuthBaseURL();
  headers.set("origin", authBaseURL);

  const response = await fetch(`${authBaseURL}/api/better-auth/get-session`, {
    method: "GET",
    headers,
  });

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return null;

  const user = (payload as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;

  const normalized = user as Record<string, unknown>;
  const additionalFields =
    normalized.additionalFields && typeof normalized.additionalFields === "object"
      ? (normalized.additionalFields as Record<string, unknown>)
      : null;

  const id =
    typeof normalized.id === "string"
      ? normalized.id
      : typeof normalized.userId === "string"
        ? normalized.userId
        : typeof (normalized._id as unknown) === "string"
          ? String(normalized._id)
        : null;
  const email =
    typeof normalized.email === "string"
      ? normalized.email
      : null;
  const username =
    typeof normalized.username === "string"
      ? normalized.username
      : typeof normalized.name === "string"
        ? normalized.name
        : null;

  if (!id || !email || !username) return null;

  return {
    id,
    email,
    username,
    role:
      typeof normalized.role === "string"
        ? normalized.role
        : typeof additionalFields?.role === "string"
          ? additionalFields.role
          : "user",
  };
}

export async function pruneRefreshTokensForUser(
  db: Db,
  userId: string,
  maxTokens: number = Number(process.env.REFRESH_TOKEN_MAX_SESSIONS || 8),
): Promise<void> {
  const maxAllowed = Math.max(1, Number.isFinite(maxTokens) ? Math.floor(maxTokens) : 8);
  const staleDocs = await db
    .collection("refresh_tokens")
    .find(
      { user_id: userId },
      {
        projection: { _id: 1 },
        sort: { created_at: -1, _id: -1 },
        skip: maxAllowed,
      },
    )
    .toArray();

  if (staleDocs.length === 0) return;

  await db.collection("refresh_tokens").deleteMany({
    _id: { $in: staleDocs.map((doc) => doc._id) },
  });
}

export async function getUserFromRequest(request: RequestLike): Promise<UserPayload | null> {
  const authHeader = getHeaderValue(request.headers, "authorization");
  const headerToken = extractTokenFromHeader(authHeader);

  const cookieHeader = getHeaderValue(request.headers, "cookie") ?? undefined;
  const cookieToken = getCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE_NAME);

  const token = headerToken || cookieToken;
  if (!token) {
    const betterAuthSession = await getBetterAuthSessionUser(request);
    if (!betterAuthSession || !ObjectId.isValid(betterAuthSession.id)) return null;

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(betterAuthSession.id) },
      {
        projection: {
          email: 1,
          username: 1,
          role: 1,
          emailVerified: 1,
          email_verified: 1,
        },
      },
    );

    if (!user || !isEmailVerificationSatisfied(user)) {
      return null;
    }

    return {
      id: user._id.toString(),
      email: user.email || betterAuthSession.email,
      username: user.username || betterAuthSession.username,
      role: normalizeUserRole(user.role || betterAuthSession.role),
    };
  }

  const payload = verifyAccessToken(token);
  if (!payload || !ObjectId.isValid(payload.id)) return null;

  const { db } = await connectToDatabase();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(payload.id) },
    {
      projection: {
        email: 1,
        username: 1,
        role: 1,
        emailVerified: 1,
        email_verified: 1,
      },
    },
  );

  if (!user || !isEmailVerificationSatisfied(user)) {
    return null;
  }

  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    role: normalizeUserRole(user.role),
  };
}

export async function resolveCurrentUserRole(user: UserPayload): Promise<UserRole> {
  const enforceDbRole = process.env.RBAC_ENFORCE_DB !== "false";
  if (!enforceDbRole) return normalizeUserRole(user.role);
  if (!ObjectId.isValid(user.id)) return normalizeUserRole(user.role);

  const { db } = await connectToDatabase();
  const doc = await db.collection("users").findOne(
    { _id: new ObjectId(user.id) },
    { projection: { role: 1 } },
  );
  if (!doc) return normalizeUserRole(user.role);
  return normalizeUserRole(doc.role);
}

export async function userHasRoleAtLeast(
  user: UserPayload,
  requiredRole: UserRole,
): Promise<boolean> {
  const effectiveRole = await resolveCurrentUserRole(user);
  return hasRequiredRole(effectiveRole, requiredRole);
}

// Get full user from database
export async function getUserById(userId: string) {
  if (!ObjectId.isValid(userId)) return null;
  const { db } = await connectToDatabase();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    {
      projection: {
        email: 1,
        username: 1,
        role: 1,
        avatar_url: 1,
        created_at: 1,
        updated_at: 1,
        emailVerified: 1,
        email_verified: 1,
      },
    },
  );
  if (!user) return null;

  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    role: normalizeUserRole(user.role),
    avatar_url: user.avatar_url || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
    emailVerified: isEmailVerificationSatisfied(user),
  };
}
