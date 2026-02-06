/**
 * POST /api/tmdb
 * Secure TMDB proxy. Keeps TMDB_API_KEY server-side only.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY ||
  process.env.TMDB_KEY ||
  process.env.TMDB_V3_API_KEY ||
  process.env.TMDB_API_V3_KEY ||
  process.env.VITE_TMDB_API_KEY ||
  null;
const TMDB_BEARER_TOKEN =
  process.env.TMDB_BEARER_TOKEN ||
  process.env.TMDB_READ_ACCESS_TOKEN ||
  process.env.TMDB_ACCESS_TOKEN ||
  process.env.TMDB_V4_TOKEN ||
  process.env.TMDB_API_READ_ACCESS_TOKEN ||
  process.env.VITE_TMDB_BEARER_TOKEN ||
  null;
const LEGACY_SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  null;
const LEGACY_SUPABASE_ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  null;
const LEGACY_SUPABASE_TMDB_FN = process.env.SUPABASE_TMDB_FUNCTION || "tmdb-proxy";

const ALLOWED_PREFIXES = [
  "/trending/",
  "/movie/",
  "/tv/",
  "/search/",
  "/genre/",
  "/discover/",
] as const;

type ProxyParams = Record<string, string | number | boolean | undefined | null>;

async function parseRequestBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

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

  const body = await parseRequestBody(req);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";

  if (!endpoint || !isSafeEndpoint(endpoint)) {
    return res.status(400).json({ error: "Invalid endpoint" });
  }

  const params = sanitizeParams(body?.params);

  try {
    if (!TMDB_API_KEY && !TMDB_BEARER_TOKEN && LEGACY_SUPABASE_URL && LEGACY_SUPABASE_ANON_KEY) {
      const fallbackUrl = `${LEGACY_SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/${LEGACY_SUPABASE_TMDB_FN}`;
      const fallbackResponse = await fetch(fallbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: LEGACY_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${LEGACY_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ endpoint, params }),
      });

      if (!fallbackResponse.ok) {
        return res
          .status(fallbackResponse.status)
          .json({ error: `Legacy TMDB proxy failed (${fallbackResponse.status})` });
      }

      const fallbackData = await fallbackResponse.json();
      return res.status(200).json(fallbackData);
    }

    if (!TMDB_API_KEY && !TMDB_BEARER_TOKEN) {
      return res.status(500).json({ error: "TMDB credentials are not configured" });
    }

    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    const requestHeaders: Record<string, string> = { Accept: "application/json" };
    if (TMDB_BEARER_TOKEN) {
      requestHeaders.Authorization = `Bearer ${TMDB_BEARER_TOKEN}`;
    } else if (TMDB_API_KEY) {
      url.searchParams.set("api_key", TMDB_API_KEY);
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), { headers: requestHeaders });

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
