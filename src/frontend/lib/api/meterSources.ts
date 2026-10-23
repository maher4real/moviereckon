import type { ExternalScore } from "@/shared/lib/reckonMeter";

export interface MeterSources {
  imdbId: string | null;
  tmdb: { average: number | null; votes: number; reviewerRatings: number[]; reviewsScanned: number } | null;
  wikidata: { wikidataId: string | null; ratings: ExternalScore[] } | null;
}

/** Hybrid TMDB + Wikidata inputs for the Reckon Meter. Never throws. */
export async function fetchMeterSources(contentId: number, contentType: "movie" | "tv"): Promise<MeterSources | null> {
  try {
    const query = new URLSearchParams({ contentId: String(contentId), contentType });
    const response = await fetch(`/api/reckon-meter?${query.toString()}`);
    if (!response.ok) return null;
    return await response.json() as MeterSources;
  } catch {
    return null;
  }
}
