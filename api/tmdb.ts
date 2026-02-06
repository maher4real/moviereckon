/**
 * POST /api/tmdb
 * Secure TMDB proxy. Keeps TMDB_API_KEY server-side only.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const ALLOWED_PREFIXES = [
  "/trending/",
  "/movie/",
  "/tv/",
  "/search/",
  "/genre/",
  "/discover/",
] as const;

type ProxyParams = Record<string, string | number | boolean | undefined | null>;

function isSafeEndpoint(endpoint: string): boolean {
  if (!endpoint.startsWith("/")) return false;
  if (endpoint.includes("..") || endpoint.includes("\\") || endpoint.includes("://")) return false;
  if (endpoint.includes("?") || endpoint.length > 220) return false;

  const normalized = endpoint.toLowerCase();
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function sanitizeParams(input: unknown): ProxyParams {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const params: ProxyParams = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;

    const valueText = String(value);
    if (valueText.length > 120) continue;

    params[key] = value;
  }

  return params;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const corsOrigin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!TMDB_API_KEY) {
    return res.status(500).json({ error: "TMDB API key is not configured" });
  }

  const endpoint =
    typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";

  if (!endpoint || !isSafeEndpoint(endpoint)) {
    return res.status(400).json({ error: "Invalid endpoint" });
  }

  const params = sanitizeParams(req.body?.params);

  try {
    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set("api_key", TMDB_API_KEY);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `TMDB request failed (${response.status})` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error("TMDB proxy error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
