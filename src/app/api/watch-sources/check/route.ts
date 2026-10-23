import { z } from "zod";
import { getUserFromRequest } from "@/backend/api/lib/auth";
import { hasAjaxHeader, isTrustedRequestOrigin } from "@/backend/api/lib/cors";
import { consumeRateLimit } from "@/backend/api/lib/rate-limit";
import type { VercelRequest } from "@/backend/api/lib/http";
import { lookupContentSources } from "@/backend/services/watchSources/store";
import { checkWatchLink } from "@/backend/services/watchSources/availability";

export const runtime = "nodejs";
export const maxDuration = 60;
const schema = z.object({ contentId: z.number().int().positive().max(2_147_483_647),
  contentType: z.enum(["movie", "tv"]), linkIds: z.array(z.string().min(1).max(100)).min(1).max(4), force: z.boolean().optional() }).strict();
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
});

export async function POST(request: Request) {
  const context = { method: "POST", headers: Object.fromEntries(request.headers) } as VercelRequest;
  if (!hasAjaxHeader(context) || !isTrustedRequestOrigin(context, { allowRefererFallback: false })) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: "Sign in to check links" }, 401);
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return json({ error: "Provide a content ID, type and up to four saved link IDs" }, 400);
    const limit = await consumeRateLimit(`watch_source_check:${user.id}`, 20, 60_000);
    if (!limit.allowed) return json({ error: "Please wait before checking more links" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    const { contentId, contentType, linkIds, force } = input.data;
    const saved = await lookupContentSources(contentId, contentType);
    const checks = await Promise.all([...new Set(linkIds)].map(async (id) => {
      const source = saved.sources.find((item) => item.links.some((link) => link.id === id));
      const link = source?.links.find((item) => item.id === id);
      if (!source || !link) return null;
      return force ? checkWatchLink(link, source.title, { contentId, contentType }, undefined, true) :
        checkWatchLink(link, source.title, { contentId, contentType });
    }));
    return json({ checks: checks.filter(Boolean) });
  } catch {
    return json({ error: "Link checks are temporarily unavailable. Please try again" }, 503);
  }
}
