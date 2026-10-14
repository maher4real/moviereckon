import { z } from "zod";
import { getUserFromRequest } from "@/backend/api/lib/auth";
import { hasAjaxHeader, isTrustedRequestOrigin } from "@/backend/api/lib/cors";
import { consumeRateLimit } from "@/backend/api/lib/rate-limit";
import type { VercelRequest } from "@/backend/api/lib/http";
import { getImporterConfig, sourcePageUrl } from "@/backend/services/watchSources/config";
import { fetchContentSources, SourceSelectionError } from "@/backend/services/watchSources/contentImport";

export const runtime = "nodejs";
export const maxDuration = 300;

const inputSchema = z.object({
  contentId: z.number().int().positive().max(2_147_483_647),
  contentType: z.enum(["movie", "tv"]),
  sourceUrl: z.string().trim().min(1).max(1_000).optional(),
}).strict();

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
});

export async function POST(request: Request) {
  const context = { method: "POST", headers: Object.fromEntries(request.headers) } as VercelRequest;
  if (!hasAjaxHeader(context) || !isTrustedRequestOrigin(context, { allowRefererFallback: false })) {
    return json({ error: "Invalid request origin" }, 403);
  }
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: "Sign in to fetch links" }, 401);
    const limit = await consumeRateLimit(`watch_source_fetch:${user.id}`, 6, 60_000);
    if (!limit.allowed) return json({ error: "Please wait before fetching more links" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    if (process.env.WATCH_IMPORTER_ENABLED === "false") return json({ error: "Link importing is disabled" }, 409);
    if (!process.env.TMDB_API_KEY || !process.env.MONGODB_URI) {
      return json({ error: "Configure TMDB_API_KEY and MONGODB_URI on the server to fetch links" }, 503);
    }
    let input;
    let config;
    try {
      input = inputSchema.parse(await request.json());
    } catch {
      return json({ error: "Provide a valid movie or series ID and an optional source-page URL" }, 400);
    }
    try { config = getImporterConfig(); } catch {
      return json({ error: "The link importer configuration is invalid" }, 503);
    }
    if (input.sourceUrl) {
      try { input.sourceUrl = sourcePageUrl(input.sourceUrl, config); } catch {
        return json({ error: "Use a source-page URL on the configured HDHub domain" }, 400);
      }
    }
    return json(await fetchContentSources(input.contentId, input.contentType, input.sourceUrl, config));
  } catch (error) {
    if (error instanceof SourceSelectionError) return json({ error: error.message }, 422);
    return json({ error: "Unable to fetch links right now. Please try again later" }, 503);
  }
}
