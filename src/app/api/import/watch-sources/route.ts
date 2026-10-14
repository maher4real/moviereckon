import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getImporterConfig, sourcePageUrl } from "@/backend/services/watchSources/config";
import { previewSourcePages, runSourceImport } from "@/backend/services/watchSources/importer";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  urls: z.array(z.string().min(1).max(1_000)).min(1).max(100).optional(),
  dryRun: z.boolean().default(false),
}).strict();

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function authorize(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return json({ error: "Configure CRON_SECRET with at least 32 characters" }, 503);
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json({ error: "Unauthorized" }, 401);
  return null;
}

async function execute(request: Request, manual: boolean) {
  const denied = authorize(request);
  if (denied) return denied;
  if (process.env.WATCH_IMPORTER_ENABLED === "false") return json({ skipped: true, reason: "Importer disabled" });
  let config;
  try { config = getImporterConfig(); } catch {
    return json({ error: "Invalid watch importer configuration" }, 503);
  }
  let input: z.infer<typeof bodySchema> = { dryRun: false };
  if (manual) {
    try {
      input = bodySchema.parse(await request.json());
      input.urls = input.urls?.map((url) => sourcePageUrl(url, config));
      if (input.dryRun && (!input.urls?.length || input.urls.length > 10)) {
        return json({ error: "A dry run requires between 1 and 10 source page URLs" }, 400);
      }
    } catch {
      return json({ error: "Provide valid source URLs on HDHUB_BASE_URL and an optional dryRun boolean" }, 400);
    }
  }
  if (!input.dryRun && (!process.env.MONGODB_URI || !process.env.TMDB_API_KEY)) {
    return json({ error: "MONGODB_URI and TMDB_API_KEY are required for persistent imports" }, 503);
  }
  try {
    if (input.dryRun) return json({ dryRun: true, pages: await previewSourcePages(input.urls!, config) });
    return json(await runSourceImport({ urls: input.urls }, config));
  } catch {
    // Do not expose database details, API keys, or upstream HTML in public errors.
    return json({ error: "Watch source import failed; check source and database availability" }, 502);
  }
}

/** Vercel Cron sends Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request) { return execute(request, false); }

/** An authenticated manual run can seed pages or preview extraction without DB writes. */
export async function POST(request: Request) { return execute(request, true); }
