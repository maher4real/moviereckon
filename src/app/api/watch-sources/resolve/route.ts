import { z } from "zod";
import { getUserFromRequest } from "@/backend/api/lib/auth";
import { hasAjaxHeader, isTrustedRequestOrigin } from "@/backend/api/lib/cors";
import { consumeRateLimit } from "@/backend/api/lib/rate-limit";
import type { VercelRequest } from "@/backend/api/lib/http";
import { lookupContentSources } from "@/backend/services/watchSources/store";
import { resolveWatchMedia } from "@/backend/services/watchSources/resolve";
import { resolveContentDownloads } from "@/backend/services/watchSources/downloadResolver";
import { isResolvableDownload } from "@/shared/lib/watchSources";

export const runtime = "nodejs";
export const maxDuration = 60;
const schema = z.object({ contentId: z.number().int().positive().max(2_147_483_647),
  contentType: z.enum(["movie", "tv"]), linkId: z.string().min(1).max(100) }).strict();
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
});

export async function POST(request: Request) {
  const context = { method: "POST", headers: Object.fromEntries(request.headers) } as VercelRequest;
  if (!hasAjaxHeader(context) || !isTrustedRequestOrigin(context, { allowRefererFallback: false })) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: "Sign in to play this source" }, 401);
    const limit = await consumeRateLimit(`watch_source_resolve:${user.id}`, 20, 60_000);
    if (!limit.allowed) return json({ error: "Please wait before trying another source" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return json({ error: "Provide a content ID, type and saved link ID" }, 400);
    const { contentId, contentType, linkId } = input.data;
    const saved = await lookupContentSources(contentId, contentType);
    const source = saved.sources.find((item) => item.links.some((link) => link.id === linkId));
    const link = source?.links.find((item) => item.id === linkId);
    if (!link || !source) return json({ error: "This source is no longer saved for this title. Fetch links again" }, 404);
    if (isResolvableDownload(link)) {
      const downloads = await resolveContentDownloads(link, source.title);
      if (!downloads.length) return json({ error: "No working file matching this title and episode could be confirmed. Try another quality or source" }, 422);
      return json({ sources: [], downloads });
    }
    const sources = await resolveWatchMedia(link, { contentId, contentType });
    if (!sources.length) return json({ error: "This host does not expose a supported direct stream for this title" }, 422);
    return json({ sources });
  } catch {
    return json({ error: "The provider could not supply a stream. Try another source or fetch links again" }, 503);
  }
}
