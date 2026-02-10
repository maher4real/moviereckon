import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_ALLOWED_ORIGINS_PROD = [
  "https://moviereckon.vercel.app",
];

const DEFAULT_ALLOWED_ORIGINS_DEV = [
  "https://moviereckon.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function isLocalhostOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function getAllowedOrigins(): Set<string> {
  const isProduction = process.env.NODE_ENV === "production";
  const raw = process.env.CORS_ORIGIN;
  const defaults = isProduction ? DEFAULT_ALLOWED_ORIGINS_PROD : DEFAULT_ALLOWED_ORIGINS_DEV;

  if (!raw || raw.trim().length === 0) {
    const initial = new Set(defaults);
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

  return new Set(list);
}

export function applyApiCors(req: VercelRequest, res: VercelResponse): { originAllowed: boolean } {
  const allowedOrigins = getAllowedOrigins();
  const originHeader = req.headers.origin;
  const origin = typeof originHeader === "string" ? originHeader : undefined;
  let sameHostOrigin = false;
  if (origin && req.headers.host) {
    try {
      sameHostOrigin = new URL(origin).host === req.headers.host;
    } catch {
      sameHostOrigin = false;
    }
  }

  const originAllowed = !origin || sameHostOrigin || allowedOrigins.has(origin);

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

export function applyDefaultSecurityHeaders(res: VercelResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}
