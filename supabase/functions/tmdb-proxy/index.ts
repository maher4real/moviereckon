import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://moviereckon.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
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

function getAllowedOrigins() {
  const configured = Deno.env.get("TMDB_PROXY_ALLOWED_ORIGINS");
  if (!configured || configured.trim().length === 0) {
    return new Set(DEFAULT_ALLOWED_ORIGINS);
  }

  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  return getAllowedOrigins().has(origin);
}

function corsHeaders(origin: string | null, allowed: boolean) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  if (origin && allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  // Legacy fallback (disabled for security):
  // headers["Access-Control-Allow-Origin"] = "*";

  return headers;
}

function isAllowedEndpoint(endpoint: string): boolean {
  return ALLOWED_ENDPOINT_PATTERNS.some((pattern) => pattern.test(endpoint));
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const originAllowed = isAllowedOrigin(origin);
  const baseHeaders = corsHeaders(origin, originAllowed);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    if (!originAllowed) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("ok", { headers: baseHeaders });
  }

  if (!originAllowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!TMDB_API_KEY) {
      console.error("TMDB_API_KEY not configured");
      return new Response(JSON.stringify({ error: "TMDB API key not configured" }), {
        status: 500,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => null);
    const endpoint = typeof payload?.endpoint === "string" ? payload.endpoint.trim() : "";
    const params = payload?.params;

    if (!endpoint) {
      return new Response(JSON.stringify({ error: "Endpoint is required" }), {
        status: 400,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      });
    }

    if (!endpoint.startsWith("/") || endpoint.length > 120 || !isAllowedEndpoint(endpoint)) {
      return new Response(JSON.stringify({ error: "Endpoint not allowed" }), {
        status: 400,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      });
    }

    if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) {
      return new Response(JSON.stringify({ error: "params must be an object" }), {
        status: 400,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set("api_key", TMDB_API_KEY);

    if (params && typeof params === "object") {
      const entries = Object.entries(params);
      if (entries.length > 25) {
        return new Response(JSON.stringify({ error: "Too many query params" }), {
          status: 400,
          headers: { ...baseHeaders, "Content-Type": "application/json" },
        });
      }

      for (const [key, value] of entries) {
        if (!/^[a-zA-Z0-9_]+$/.test(key)) {
          return new Response(JSON.stringify({ error: "Invalid query param key" }), {
            status: 400,
            headers: { ...baseHeaders, "Content-Type": "application/json" },
          });
        }

        if (FORBIDDEN_QUERY_PARAMS.has(key)) {
          return new Response(JSON.stringify({ error: `Query param not allowed: ${key}` }), {
            status: 400,
            headers: { ...baseHeaders, "Content-Type": "application/json" },
          });
        }

        if (value === undefined || value === null || value === "") continue;

        const normalizedValue = String(value);
        if (normalizedValue.length > 250) {
          return new Response(JSON.stringify({ error: `Query param too long: ${key}` }), {
            status: 400,
            headers: { ...baseHeaders, "Content-Type": "application/json" },
          });
        }

        url.searchParams.set(key, normalizedValue);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`TMDB API error: ${response.status} ${response.statusText}`);
      return new Response(JSON.stringify({ error: `TMDB API Error: ${response.status}` }), {
        status: response.status,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in tmdb-proxy:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  }
});
