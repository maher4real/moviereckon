import type { VercelRequest, VercelResponse } from "@vercel/node";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_OAUTH_STATE_COOKIE_NAME = "moviereckon_google_oauth_state";

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
  const clientId = getStringEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getStringEnv("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured");
  }

  return { clientId, clientSecret };
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

  if (!profile.email_verified) {
    return { profile: null, errorCode: "email_not_verified" };
  }

  return { profile, errorCode: null };
}

export function buildAuthErrorRedirectPath(errorCode: string): string {
  const safeCode = encodeURIComponent(errorCode || "unknown_error");
  return `/auth?oauth=google&oauth_error=${safeCode}`;
}
