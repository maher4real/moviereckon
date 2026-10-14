import { lookupContentSources } from "@/backend/services/watchSources/store";

export const runtime = "nodejs";

function numberParam(value: string | null, minimum: number): number | undefined {
  if (value === null) return undefined;
  if (!/^\d{1,10}$/.test(value)) throw new Error("Invalid number");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error("Invalid number");
  return number;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  let contentId: number | undefined;
  const contentType = query.get("contentType");
  let season: number | undefined;
  let episode: number | undefined;
  try {
    contentId = numberParam(query.get("contentId"), 1);
    season = numberParam(query.get("season"), 0);
    episode = numberParam(query.get("episode"), 1);
    if (!contentId || !["movie", "tv"].includes(contentType || "") ||
        (contentType === "movie" && (season !== undefined || episode !== undefined)) ||
        (episode !== undefined && season === undefined)) throw new Error("Invalid content query");
  } catch {
    return Response.json({ error: "Provide a contentId and contentType (movie or tv); episode requires season" },
      { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await lookupContentSources(contentId, contentType as "movie" | "tv", season, episode);
    return Response.json(result, { headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return Response.json({ error: "Watch sources temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
