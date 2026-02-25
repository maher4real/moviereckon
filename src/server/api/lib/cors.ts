import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_ALLOWED_ORIGINS_PROD = [
  "https://moviereckon.vercel.app",
];

const DEFAULT_ALLOWED_ORIGINS_DEV = [
  "https://moviereckon.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AJAX_HEADER_NAME = "x-requested-with";
const AJAX_HEADER_VALUE = "xmlhttprequest";

function isLocalhostOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function normalizeOriginList(origins: string[]): string[] {
  const normalized = new Set<string>();
  origins.forEach((origin) => {
    try {
      normalized.add(new URL(origin).origin);
    } catch {
      // Ignore invalid origin values from env configuration.
    }
  });
  return [...normalized];
}

function getAllowedOrigins(): Set<string> {
  const isProduction = process.env.NODE_ENV === "production";
  const raw = process.env.CORS_ORIGIN;
  const defaults = isProduction ? DEFAULT_ALLOWED_ORIGINS_PROD : DEFAULT_ALLOWED_ORIGINS_DEV;

  if (!raw || raw.trim().length === 0) {
    const initial = new Set(normalizeOriginList(defaults));
    if (process.env.VERCEL_URL) {
      initial.add(`https://${process.env.VERCEL_URL}`);
    }
    return initial;
  }

  let list = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (isProduction) {
    // Harden production CORS in case local origins were copied from development env files.
    list = list.filter((origin) => !isLocalhostOrigin(origin));
  }

  if (process.env.VERCEL_URL) {
    list.push(`https://${process.env.VERCEL_URL}`);
  }

  if (list.length === 0) {
    list = [...defaults];
  }

  const normalized = normalizeOriginList(list);
  if (normalized.length === 0) {
    return new Set(normalizeOriginList(defaults));
  }

  return new Set(normalized);
}

function getHeaderFirstValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.split(",")[0]?.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].split(",")[0]?.trim();
  }
  return undefined;
}

function toNormalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function hasSameHost(req: VercelRequest, origin: string): boolean {
  const host = getHeaderFirstValue(req.headers.host);
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isAllowedOrigin(req: VercelRequest, origin: string, allowedOrigins: Set<string>): boolean {
  return hasSameHost(req, origin) || allowedOrigins.has(origin);
}

export function applyApiCors(req: VercelRequest, res: VercelResponse): { originAllowed: boolean } {
  const allowedOrigins = getAllowedOrigins();
  const originHeader = getHeaderFirstValue(req.headers.origin);
  const origin = originHeader ? toNormalizedOrigin(originHeader) : null;
  const originAllowed = !originHeader || (!!origin && isAllowedOrigin(req, origin, allowedOrigins));

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "600");

  if (origin && originAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  // Legacy fallback (disabled for security):
  // res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  // res.setHeader("Access-Control-Allow-Credentials", "true");

  return { originAllowed };
}

type TrustedOriginOptions = {
  allowRefererFallback?: boolean;
  allowMissingOriginForSafeMethods?: boolean;
};

export function hasAjaxHeader(req: VercelRequest): boolean {
  const raw = getHeaderFirstValue(req.headers[AJAX_HEADER_NAME]);
  return typeof raw === "string" && raw.toLowerCase() === AJAX_HEADER_VALUE;
}

export function isTrustedRequestOrigin(
  req: VercelRequest,
  options: TrustedOriginOptions = {},
): boolean {
  const allowRefererFallback = options.allowRefererFallback !== false;
  const allowMissingOriginForSafeMethods = options.allowMissingOriginForSafeMethods !== false;
  const method = (req.method || "GET").toUpperCase();
  const allowedOrigins = getAllowedOrigins();

  const originHeader = getHeaderFirstValue(req.headers.origin);
  const normalizedOrigin = originHeader ? toNormalizedOrigin(originHeader) : null;
  if (originHeader && !normalizedOrigin) {
    return false;
  }
  if (normalizedOrigin) {
    return isAllowedOrigin(req, normalizedOrigin, allowedOrigins);
  }

  if (allowRefererFallback) {
    const refererHeader = getHeaderFirstValue(req.headers.referer);
    if (refererHeader) {
      try {
        const refererOrigin = new URL(refererHeader).origin;
        return isAllowedOrigin(req, refererOrigin, allowedOrigins);
      } catch {
        return false;
      }
    }
  }

  if (allowMissingOriginForSafeMethods && SAFE_HTTP_METHODS.has(method)) {
    return true;
  }

  return false;
}

export function isStateChangingMethod(method: string | undefined): boolean {
  const normalized = (method || "GET").toUpperCase();
  return !SAFE_HTTP_METHODS.has(normalized);
}

export function applyDefaultSecurityHeaders(res: VercelResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}
