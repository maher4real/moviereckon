/**
 * JWT Authentication Utilities
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { connectToDatabase, ObjectId } from "./mongodb.js";
import { ACCESS_TOKEN_COOKIE_NAME, getCookieValue } from "./cookies.js";

const JWT_SECRET = process.env.JWT_SECRET;
// Legacy fallback (disabled for security):
// const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be configured and at least 32 characters");
}

const JWT_ISSUER = "moviereckon";
const JWT_AUDIENCE = "moviereckon-web";

const JWT_EXPIRES_IN = "15m";
// Legacy fallback (disabled for security):
// const JWT_EXPIRES_IN = "7d";

const REFRESH_TOKEN_EXPIRES_IN = "30d";
const REFRESH_TOKEN_PEPPER = process.env.REFRESH_TOKEN_PEPPER || JWT_SECRET;

export interface UserPayload {
  id: string;
  email: string;
  username: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function generateTokens(user: UserPayload): TokenPair {
  const accessToken = jwt.sign(user, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  const refreshToken = jwt.sign({ id: user.id, type: "refresh" }, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as UserPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { id: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { id: string; type: string };
    if (decoded.type !== "refresh") return null;
    return { id: decoded.id };
  } catch {
    return null;
  }
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(`${REFRESH_TOKEN_PEPPER}:${token}`).digest("hex");
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
  const direct = headers[normalizedHeaderName];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct) && direct.length > 0) return direct[0] ?? null;

  return null;
}

export async function getUserFromRequest(request: RequestLike): Promise<UserPayload | null> {
  const authHeader = getHeaderValue(request.headers, "authorization");
  const headerToken = extractTokenFromHeader(authHeader);

  const cookieHeader = getHeaderValue(request.headers, "cookie") ?? undefined;
  const cookieToken = getCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE_NAME);

  const token = headerToken || cookieToken;
  if (!token) return null;

  return verifyAccessToken(token);
}

// Get full user from database
export async function getUserById(userId: string) {
  const { db } = await connectToDatabase();
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) return null;

  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    avatar_url: user.avatar_url || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}
