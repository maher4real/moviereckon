import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { getCookieValue } from "./cookies.js";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CERTS_ENDPOINT = "https://www.googleapis.com/oauth2/v1/certs";

export const GOOGLE_OAUTH_STATE_COOKIE_NAME = "moviereckon_google_oauth_state";
export const GOOGLE_ONE_TAP_NONCE_COOKIE_NAME = "moviereckon_google_one_tap_nonce";

const GOOGLE_SCOPE = "openid email profile";
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

type SameSite = "lax" | "strict" | "none";

export interface GoogleOAuthState {
  nonce: string;
  returnTo: string;
  createdAt: number;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleIdTokenPayload = {
  aud?: string | string[];
  email?: string;
  iss?: string;
  exp?: number;
  given_name?: string;
  name?: string;
  nonce?: string;
  picture?: string;
  sub?: string;
  email_verified?: boolean;
};

type GoogleCertCache = {
  certs: Record<string, string>;
  expiresAt: number;
};

let googleCertCache: GoogleCertCache | null = null;

function getStringEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function shouldUseSecureCookies(): boolean {
  if (isProductionEnv()) return true;
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return false;
}

function getSameSiteValue(secure: boolean): SameSite {
  const raw = getStringEnv("SESSION_COOKIE_SAMESITE").toLowerCase();
  const sameSite: SameSite = raw === "strict" || raw === "none" ? raw : "lax";

  // SameSite=None is only valid with Secure cookies.
  if (sameSite === "none" && !secure) return "lax";
  return sameSite;
}

function serializeCookie(name: string, value: string, options: {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite;
  path?: string;
  maxAge?: number;
  expires?: Date;
} = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join("; ");
}

function appendSetCookie(res: VercelResponse, cookieValue: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing.map(String), cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [String(existing), cookieValue]);
}

function getCacheMaxAgeMs(headerValue: string | null): number {
  if (!headerValue) return 60 * 60 * 1000;
  const match = headerValue.match(/max-age=(\d+)/i);
  if (!match) return 60 * 60 * 1000;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return 60 * 60 * 1000;
  return seconds * 1000;
}

function getHeaderFirstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.split(",")[0]?.trim() || null;
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0].split(",")[0]?.trim() || null;
  }

  return null;
}

export function getRequestOrigin(req: VercelRequest): string | null {
  const host = getHeaderFirstValue(req.headers.host);
  if (!host) return null;

  const forwardedProto = getHeaderFirstValue(req.headers["x-forwarded-proto"]);
  const protocol = forwardedProto || (isProductionEnv() ? "https" : "http");

  return `${protocol}://${host}`;
}

export function getGoogleOAuthConfig(): OAuthConfig {
  const clientId = getGoogleOAuthClientId();
  const clientSecret = getStringEnv("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured");
  }

  return { clientId, clientSecret };
}

export function getGoogleOAuthClientId(): string {
  return getStringEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleCallbackUrl(req: VercelRequest): string {
  const configured = getStringEnv("GOOGLE_OAUTH_REDIRECT_URI");
  if (configured) return configured;

  const origin = getRequestOrigin(req);
  if (!origin) {
    throw new Error("Unable to determine request origin for Google OAuth callback");
  }

  return `${origin}/api/auth/google-callback`;
}

export function normalizeReturnToPath(req: VercelRequest, rawValue: string | null): string {
  const fallback = "/home";
  if (!rawValue || rawValue.trim().length === 0) return fallback;

  const candidate = rawValue.trim();
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }

  const origin = getRequestOrigin(req);
  if (!origin) return fallback;

  try {
    const parsed = new URL(candidate);
    if (parsed.origin !== origin) return fallback;
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path || fallback;
  } catch {
    return fallback;
  }
}

export function setGoogleOAuthStateCookie(res: VercelResponse, state: GoogleOAuthState): void {
  const secure = shouldUseSecureCookies();
  const sameSite = getSameSiteValue(secure);
  const encodedState = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");

  appendSetCookie(
    res,
    serializeCookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, encodedState, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    }),
  );
}

export function clearGoogleOAuthStateCookie(res: VercelResponse): void {
  const secure = shouldUseSecureCookies();
  const sameSite = getSameSiteValue(secure);

  appendSetCookie(
    res,
    serializeCookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, "", {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

export function createGoogleOneTapNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function setGoogleOneTapNonceCookie(res: VercelResponse, nonce: string): void {
  const secure = shouldUseSecureCookies();
  const sameSite = getSameSiteValue(secure);

  appendSetCookie(
    res,
    serializeCookie(GOOGLE_ONE_TAP_NONCE_COOKIE_NAME, nonce, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: 10 * 60,
    }),
  );
}

export function clearGoogleOneTapNonceCookie(res: VercelResponse): void {
  const secure = shouldUseSecureCookies();
  const sameSite = getSameSiteValue(secure);

  appendSetCookie(
    res,
    serializeCookie(GOOGLE_ONE_TAP_NONCE_COOKIE_NAME, "", {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

export function getGoogleOneTapNonceFromRequest(req: VercelRequest): string | null {
  return getCookieValue(req.headers.cookie, GOOGLE_ONE_TAP_NONCE_COOKIE_NAME) || null;
}

export function parseGoogleOAuthState(rawCookieValue: string | null): GoogleOAuthState | null {
  if (!rawCookieValue) return null;

  try {
    const decoded = Buffer.from(rawCookieValue, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<GoogleOAuthState>;

    if (
      typeof parsed.nonce !== "string" ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    if (!Number.isFinite(parsed.createdAt)) {
      return null;
    }

    if (Date.now() - parsed.createdAt > OAUTH_STATE_MAX_AGE_SECONDS * 1000) {
      return null;
    }

    return {
      nonce: parsed.nonce,
      returnTo: parsed.returnTo,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function fetchGoogleProfile(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ profile: GoogleProfile | null; errorCode: string | null }> {
  const tokenBody = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
  });

  const tokenJson = (await parseJsonSafe(tokenResponse)) as GoogleTokenResponse;

  if (!tokenResponse.ok || !tokenJson.access_token) {
    return { profile: null, errorCode: "token_exchange_failed" };
  }

  const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
  });

  const profileJson = await parseJsonSafe(userInfoResponse);
  if (!userInfoResponse.ok) {
    return { profile: null, errorCode: "userinfo_fetch_failed" };
  }

  const profile = {
    sub: typeof profileJson.sub === "string" ? profileJson.sub : "",
    email: typeof profileJson.email === "string" ? profileJson.email.trim().toLowerCase() : "",
    email_verified: profileJson.email_verified === true,
    name: typeof profileJson.name === "string" ? profileJson.name : undefined,
    given_name: typeof profileJson.given_name === "string" ? profileJson.given_name : undefined,
    picture: typeof profileJson.picture === "string" ? profileJson.picture : undefined,
  } satisfies GoogleProfile;

  if (!profile.sub || !profile.email) {
    return { profile: null, errorCode: "profile_incomplete" };
  }

  // TODO: Email verification disabled for now
  // if (!profile.email_verified) {
  //   return { profile: null, errorCode: "email_not_verified" };
  // }

  return { profile, errorCode: null };
}

async function fetchGoogleSigningCertificates(forceRefresh = false): Promise<Record<string, string>> {
  if (!forceRefresh && googleCertCache && googleCertCache.expiresAt > Date.now()) {
    return googleCertCache.certs;
  }

  const response = await fetch(GOOGLE_CERTS_ENDPOINT, {
    headers: {
      Accept: "application/json",
    },
  });
  const certs = (await parseJsonSafe(response)) as Record<string, unknown>;
  if (!response.ok || typeof certs !== "object" || certs === null) {
    throw new Error("google_certs_fetch_failed");
  }

  const normalizedCerts = Object.fromEntries(
    Object.entries(certs).filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;
  if (Object.keys(normalizedCerts).length === 0) {
    throw new Error("google_certs_missing");
  }

  googleCertCache = {
    certs: normalizedCerts,
    expiresAt: Date.now() + getCacheMaxAgeMs(response.headers.get("cache-control")),
  };

  return normalizedCerts;
}

export async function verifyGoogleIdToken(params: {
  credential: string;
  clientId: string;
  nonce?: string | null;
}): Promise<{ profile: GoogleProfile | null; errorCode: string | null }> {
  try {
    const decoded = jwt.decode(params.credential, { complete: true }) as
      | { header?: { kid?: string; alg?: string } }
      | null;
    const kid = typeof decoded?.header?.kid === "string" ? decoded.header.kid : "";
    const alg = typeof decoded?.header?.alg === "string" ? decoded.header.alg : "";
    if (!kid || alg !== "RS256") {
      return { profile: null, errorCode: "credential_verification_failed" };
    }

    let certs = await fetchGoogleSigningCertificates(false);
    let cert = certs[kid];
    if (!cert) {
      certs = await fetchGoogleSigningCertificates(true);
      cert = certs[kid];
    }
    if (!cert) {
      return { profile: null, errorCode: "credential_verification_failed" };
    }

    const payload = jwt.verify(params.credential, cert, {
      algorithms: ["RS256"],
      audience: params.clientId,
      issuer: ["accounts.google.com", "https://accounts.google.com"],
    }) as GoogleIdTokenPayload;

    if (params.nonce && payload.nonce !== params.nonce) {
      return { profile: null, errorCode: "credential_verification_failed" };
    }

    const profile = {
      sub: typeof payload.sub === "string" ? payload.sub : "",
      email: typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "",
      email_verified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : undefined,
      given_name: typeof payload.given_name === "string" ? payload.given_name : undefined,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    } satisfies GoogleProfile;

    if (!profile.sub || !profile.email) {
      return { profile: null, errorCode: "profile_incomplete" };
    }

    // TODO: Email verification disabled for now
    // if (!profile.email_verified) {
    //   return { profile: null, errorCode: "email_not_verified" };
    // }

    return { profile, errorCode: null };
  } catch {
    return { profile: null, errorCode: "credential_verification_failed" };
  }
}

export function buildAuthErrorRedirectPath(errorCode: string): string {
  const safeCode = encodeURIComponent(errorCode || "unknown_error");
  return `/auth?oauth=google&oauth_error=${safeCode}`;
}
