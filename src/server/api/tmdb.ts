/**
 * GET|POST /api/tmdb
 * Server-side TMDB proxy to avoid client-side provider key exposure.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyApiCors,
  applyDefaultSecurityHeaders,
  hasAjaxHeader,
  isTrustedRequestOrigin,
} from "./lib/cors.js";
import { consumeRateLimit, getClientIp } from "./lib/rate-limit.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const ALLOWED_ENDPOINT_PATTERNS = [
  /^\/trending\/(movie|tv)\/(day|week)$/,
  /^\/(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today)$/,
  /^\/discover\/(movie|tv)$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/(movie|tv)\/\d+\/(credits|videos|similar|recommendations|watch\/providers|reviews|keywords)$/,
  /^\/movie\/\d+\/(release_dates|keywords)$/,
  /^\/tv\/\d+\/season\/\d+$/,
  /^\/search\/(movie|tv|multi)$/,
  /^\/genre\/(movie|tv)\/list$/,
];

const FORBIDDEN_QUERY_PARAMS = new Set(["api_key"]);

function isAllowedEndpoint(endpoint: string): boolean {
  return ALLOWED_ENDPOINT_PATTERNS.some((pattern) => pattern.test(endpoint));
}

function getCacheProfile(endpoint: string): { sMaxAge: number; staleWhileRevalidate: number } {
  // Search changes frequently with query terms, so keep CDN cache short.
  if (/^\/search\//.test(endpoint)) {
    return { sMaxAge: 60, staleWhileRevalidate: 120 };
  }

  // Detailed metadata can be cached longer for better hit rates.
  if (/^\/(movie|tv)\/\d+/.test(endpoint)) {
    return { sMaxAge: 300, staleWhileRevalidate: 900 };
  }

  // Trending/discover/list endpoints.
  return { sMaxAge: 180, staleWhileRevalidate: 600 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyDefaultSecurityHeaders(res);
  const { originAllowed } = applyApiCors(req, res);

  if (req.method === "OPTIONS") {
    if (!originAllowed) {
      return res.status(403).json({ error: "Origin not allowed" });
    }
    return res.status(204).end();
  }

  if (!originAllowed) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (
    !isTrustedRequestOrigin(req, {
      allowRefererFallback: true,
      allowMissingOriginForSafeMethods: false,
    })
  ) {
    return res.status(403).json({ error: "Invalid request origin" });
  }

  if (req.method === "POST" && !hasAjaxHeader(req)) {
    return res.status(403).json({ error: "Missing required request header" });
  }

  const contentType = req.headers["content-type"];
  if (
    req.method === "POST" &&
    typeof contentType === "string" &&
    !contentType.includes("application/json")
  ) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return res.status(500).json({ error: "TMDB API key is not configured" });
  }

  try {
    let endpoint = "";
    let params: Record<string, unknown> | undefined;

    if (req.method === "GET") {
      const rawEndpoint = req.query?.endpoint;
      endpoint =
        typeof rawEndpoint === "string"
          ? rawEndpoint.trim()
          : Array.isArray(rawEndpoint)
            ? String(rawEndpoint[0] || "").trim()
            : "";

      const queryParams: Record<string, string> = {};
      Object.entries(req.query || {}).forEach(([key, value]) => {
        if (key === "endpoint") return;
        const normalizedValue = Array.isArray(value) ? value[0] : value;
        if (normalizedValue === undefined || normalizedValue === null || normalizedValue === "") {
          return;
        }
        queryParams[key] = String(normalizedValue);
      });

      params = queryParams;
    } else {
      endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
      params = req.body?.params;
    }

    const clientIp = getClientIp(req);
    const ipRateLimit = consumeRateLimit(`tmdb:ip:${clientIp}`, 180, 15 * 60 * 1000);
    const endpointRateLimit = consumeRateLimit(
      `tmdb:endpoint:${clientIp}:${endpoint || "unknown"}`,
      50,
      5 * 60 * 1000,
    );
    if (!ipRateLimit.allowed || !endpointRateLimit.allowed) {
      const retryAfter = Math.max(ipRateLimit.retryAfterSeconds, endpointRateLimit.retryAfterSeconds, 60);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many TMDB requests. Please try again later." });
    }

    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint is required" });
    }

    if (!endpoint.startsWith("/") || endpoint.length > 120 || !isAllowedEndpoint(endpoint)) {
      return res.status(400).json({ error: "Endpoint not allowed" });
    }

    if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) {
      return res.status(400).json({ error: "params must be an object" });
    }

    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set("api_key", tmdbApiKey);

    if (params && typeof params === "object") {
      const entries = Object.entries(params);
      if (entries.length > 25) {
        return res.status(400).json({ error: "Too many query params" });
      }

      for (const [key, value] of entries) {
        if (!/^[a-zA-Z0-9_.]+$/.test(key)) {
          return res.status(400).json({ error: "Invalid query param key" });
        }

        if (FORBIDDEN_QUERY_PARAMS.has(key)) {
          return res.status(400).json({ error: `Query param not allowed: ${key}` });
        }

        if (value === undefined || value === null || value === "") continue;

        const normalizedValue = String(value);
        if (normalizedValue.length > 250) {
          return res.status(400).json({ error: `Query param too long: ${key}` });
        }

        url.searchParams.set(key, normalizedValue);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(response.status).json({
        error:
          (payload && typeof payload === "object" && "status_message" in payload
            ? String((payload as Record<string, unknown>).status_message)
            : undefined) || `TMDB API Error: ${response.status}`,
      });
    }

    const cacheProfile = getCacheProfile(endpoint);
    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${cacheProfile.sMaxAge}, stale-while-revalidate=${cacheProfile.staleWhileRevalidate}`,
    );

    return res.status(200).json(payload);
  } catch (error) {
    console.error("TMDB proxy error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
