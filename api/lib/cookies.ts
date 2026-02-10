import type { VercelResponse } from "@vercel/node";

export const ACCESS_TOKEN_COOKIE_NAME = "moviereckon_access";
export const REFRESH_TOKEN_COOKIE_NAME = "moviereckon_refresh";

type SameSite = "lax" | "strict" | "none";

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite;
  path?: string;
  maxAge?: number;
  expires?: Date;
};

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

function shouldUseSecureCookies() {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return isProductionEnv();
}

function getSameSiteValue(): SameSite {
  const configured = process.env.SESSION_COOKIE_SAMESITE?.toLowerCase();
  if (configured === "lax" || configured === "strict" || configured === "none") {
    return configured;
  }
  // Use Lax as a safer default unless explicitly configured otherwise.
  return "lax";
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
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

function appendSetCookie(res: VercelResponse, cookieValue: string) {
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

export function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const [rawName, ...rest] = segment.trim().split("=");
    if (rawName !== name) continue;
    const rawValue = rest.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export function setAuthCookies(res: VercelResponse, accessToken: string, refreshToken: string) {
  const secure = shouldUseSecureCookies();
  const sameSite = getSameSiteValue();

  appendSetCookie(
    res,
    serializeCookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    }),
  );

  appendSetCookie(
    res,
    serializeCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    }),
  );
}

export function clearAuthCookies(res: VercelResponse) {
  const secure = shouldUseSecureCookies();
  const sameSite = getSameSiteValue();

  const expired = new Date(0);

  appendSetCookie(
    res,
    serializeCookie(ACCESS_TOKEN_COOKIE_NAME, "", {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: 0,
      expires: expired,
    }),
  );

  appendSetCookie(
    res,
    serializeCookie(REFRESH_TOKEN_COOKIE_NAME, "", {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: 0,
      expires: expired,
    }),
  );
}
