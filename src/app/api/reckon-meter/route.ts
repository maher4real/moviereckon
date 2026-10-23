import { loadMeterSources } from "@/backend/services/meterSources";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const contentType = query.get("contentType");
  const rawId = query.get("contentId") || "";
  const contentId = /^\d{1,10}$/.test(rawId) ? Number(rawId) : 0;
  if (!contentId || (contentType !== "movie" && contentType !== "tv")) {
    return Response.json({ error: "Provide a contentId and contentType (movie or tv)" },
      { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const payload = await loadMeterSources(contentType, contentId);
  // Scores move slowly and Wikidata asks clients to keep load low: the CDN
  // serves each title for 12 hours and a stale copy for a week. A partial
  // result (a source failed) is cached briefly so it retries soon.
  const complete = payload.tmdb !== null && payload.wikidata !== null;
  return Response.json(payload, {
    headers: {
      "Cache-Control": complete
        ? "public, s-maxage=43200, stale-while-revalidate=604800"
        : "public, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
