import type { WatchSourceIdentity } from "@/shared/types/watchSources";

export interface ExternalWatchProvider { name: string; url: string; scope: "movie" | "episode" }

/** Documented public player routes, not a claim that the provider has this title. */
export function externalWatchProviders(
  { contentId, contentType }: WatchSourceIdentity, season?: number, episode?: number,
): ExternalWatchProvider[] {
  if (!Number.isSafeInteger(contentId) || contentId <= 0) return [];
  if (contentType === "movie") return [
    { name: "VidLink", url: `https://vidlink.pro/movie/${contentId}?autoplay=false`, scope: "movie" },
  ];
  if (season === undefined || episode === undefined || !Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(episode) || episode <= 0) return [];
  return [
    { name: "VidLink", url: `https://vidlink.pro/tv/${contentId}/${season}/${episode}?autoplay=false`, scope: "episode" },
  ];
}
