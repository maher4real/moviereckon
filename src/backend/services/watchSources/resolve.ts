import "server-only";
import { load } from "cheerio";
import { z } from "zod";
import { directMediaFormat, isResolvablePlayer } from "@/shared/lib/watchSources";
import type { DirectMediaSource, WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { fetchSourceDocument } from "./http";
import { resolveHubStreamMedia } from "./hubStream";
import { parseHdStreamMedia } from "./packedPlayer";
import { resolveHdStreamMedia } from "./hdStream";
import { publicLink } from "./parser";

const playerData = z.object({
  ok: z.literal(true),
  movie: z.object({ tmdb_id: z.number().int(), imdb_id: z.string(), type_slug: z.literal("movie") }),
  streams: z.array(z.object({ m3u8_url: z.string().max(4096) })).max(20),
});

/** Read this provider's published JSON as data. Never execute third-party scripts. */
export function parsePlayerMedia(html: string, pageUrl: string, identity: WatchSourceIdentity): DirectMediaSource[] {
  if (identity.contentType !== "movie") return [];
  const $ = load(html);
  for (const script of $("script:not([src])").toArray()) {
    const assignment = $(script).text().trim().match(/^window\.__PA_PLAY__\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (!assignment) continue;
    try {
      const data = playerData.parse(JSON.parse(assignment[1]));
      if (data.movie.tmdb_id !== identity.contentId || new URL(pageUrl).pathname.replace(/\/$/, "") !== `/${data.movie.imdb_id}`) return [];
      const urls = [...new Set(data.streams.map((stream) => stream.m3u8_url))];
      return urls.flatMap((value, index) => {
        const url = publicLink(value, pageUrl);
        return url?.protocol === "https:" ? [{ url: url.href, format: "hls" as const, label: `Stream ${index + 1} · Auto quality` }] : [];
      });
    } catch { return []; }
  }
  return [];
}

export async function resolveWatchMedia(link: WatchSourceLink, identity: WatchSourceIdentity,
  fetchDocument = fetchSourceDocument, title?: string, verifyHdStream = resolveHdStreamMedia): Promise<DirectMediaSource[]> {
  // Never turn a season pack or a multi-episode collection into one episode.
  if (link.scope !== "movie" && link.scope !== "episode") return [];
  const format = directMediaFormat(link.url);
  if (format) return [{ url: link.url, format, label: link.quality || link.label }];
  if (!isResolvablePlayer(link)) return [];
  if (new URL(link.url).origin === "https://hubstream.art") {
    if (!title || (link.scope === "movie") !== (identity.contentType === "movie")) return [];
    return resolveHubStreamMedia(link, title);
  }
  if (new URL(link.url).origin === "https://hdstream4u.com") {
    if ((link.scope === "movie") !== (identity.contentType === "movie")) return [];
    const signal = AbortSignal.timeout(48_000);
    // A published CDN can be unavailable while another freshly issued host
    // works. Refresh the provider page once, within the same request deadline.
    for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
      const result = await fetchDocument(link.url, "https://hdstream4u.com", {}, { signal });
      const candidates = parseHdStreamMedia(result.html || "", link.url);
      if (!candidates.length) return [];
      const sources = await verifyHdStream(candidates, undefined, signal);
      if (sources.length) return sources;
    }
    return [];
  }
  if (identity.contentType !== "movie") return [];
  // Fixed origin, no arbitrary-URL fetch or traversal of ad/redirect chains.
  const result = await fetchDocument(link.url, "https://play4u.org");
  return parsePlayerMedia(result.html || "", link.url, identity);
}
