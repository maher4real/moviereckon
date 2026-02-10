/**
 * POST /api/tmdb
 * Server-side TMDB proxy to avoid client-side provider key exposure.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyApiCors, applyDefaultSecurityHeaders } from "./lib/cors.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const ALLOWED_ENDPOINT_PATTERNS = [
  /^\/trending\/(movie|tv)\/(day|week)$/,
  /^\/(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today)$/,
  /^\/discover\/(movie|tv)$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/(movie|tv)\/\d+\/(credits|videos|similar|recommendations|watch\/providers|reviews)$/,
  /^\/movie\/\d+\/(release_dates|keywords)$/,
  /^\/tv\/\d+\/season\/\d+$/,
  /^\/search\/(movie|tv|multi)$/,
  /^\/genre\/(movie|tv)\/list$/,
];

const FORBIDDEN_QUERY_PARAMS = new Set(["api_key"]);

function isAllowedEndpoint(endpoint: string): boolean {
  return ALLOWED_ENDPOINT_PATTERNS.some((pattern) => pattern.test(endpoint));
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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return res.status(500).json({ error: "TMDB API key is not configured" });
  }

  try {
    const endpoint =
      typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
    const params = req.body?.params;

    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint is required" });
    }

    if (!endpoint.startsWith("/") || endpoint.length > 120 || !isAllowedEndpoint(endpoint)) {
      return res.status(400).json({ error: "Endpoint not allowed" });
    }

    if (
      params !== undefined &&
      (typeof params !== "object" || params === null || Array.isArray(params))
    ) {
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
        if (!/^[a-zA-Z0-9_]+$/.test(key)) {
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

    return res.status(200).json(payload);
  } catch (error) {
    console.error("TMDB proxy error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
