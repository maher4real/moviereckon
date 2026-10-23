import "server-only";
import { createHash } from "node:crypto";
import { canCheckWatchLink, directMediaFormat, isDirectFileLink, isResolvableDownload, isResolvablePlayer } from "@/shared/lib/watchSources";
import type { WatchLinkCheck, WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { resolveContentDownloads } from "./downloadResolver";
import { verifyDirectDownload } from "./downloads";
import { resolveWatchMedia } from "./resolve";
import { resolveHdStreamMedia } from "./hdStream";

const cache = new Map<string, WatchLinkCheck>();
const pending = new Map<string, Promise<WatchLinkCheck>>();
const defaults = { downloads: resolveContentDownloads, direct: verifyDirectDownload, watch: resolveWatchMedia, hls: resolveHdStreamMedia, now: () => Date.now() };

/** Cache evidence briefly, bound to the saved URL, metadata and exact content identity. */
export async function checkWatchLink(link: WatchSourceLink, title: string, identity: WatchSourceIdentity,
  dependencies = defaults, force = false): Promise<WatchLinkCheck> {
  const key = createHash("sha256").update(JSON.stringify([identity, title, link])).digest("hex");
  // Injected checks are deliberately isolated from production caches.
  if (force && dependencies === defaults) cache.delete(key);
  const cached = dependencies === defaults ? cache.get(key) : undefined;
  if (cached && Date.parse(cached.validUntil) > dependencies.now()) return cached;
  const inflight = dependencies === defaults ? pending.get(key) : undefined;
  if (inflight) return inflight;
  const check = async (): Promise<WatchLinkCheck> => {
    let downloads: WatchLinkCheck["downloads"] = [];
    let available = false;
    try {
      if (canCheckWatchLink(link)) {
        if (isResolvableDownload(link)) downloads = await dependencies.downloads(link, title);
        else if (isDirectFileLink(link.url)) downloads = await dependencies.direct(link, title);
        else if (isResolvablePlayer(link) || directMediaFormat(link.url) === "hls") {
          const sources = await dependencies.watch(link, identity, undefined, title);
          // A URL extracted from an HTML page is not proof. Only adapters that
          // checked the playlist AND media bytes supply hlsPlaylist evidence.
          const validated = sources.filter((source) => !!source.hlsPlaylist);
          if (!validated.length && sources.length) validated.push(...await dependencies.hls(sources));
          available = validated.length > 0;
        }
      }
    } catch { /* Unreachable, blocked and unconfirmed sources remain hidden. */ }
    const now = dependencies.now();
    downloads = downloads.filter((file) => !file.expiresAt || Date.parse(file.expiresAt) > now + 30_000);
    available ||= downloads.length > 0;
    const until = Math.min(now + (available ? 120_000 : 30_000),
      ...downloads.flatMap((file) => file.expiresAt ? [Date.parse(file.expiresAt) - 30_000] : []));
    const result: WatchLinkCheck = { linkId: link.id, url: link.url, available, downloads,
      checkedAt: new Date(now).toISOString(), validUntil: new Date(until).toISOString() };
    if (dependencies === defaults) {
      for (const [id, value] of cache) if (Date.parse(value.validUntil) <= now) cache.delete(id);
      cache.delete(key);
      cache.set(key, result);
      while (cache.size > 500) cache.delete(cache.keys().next().value!);
    }
    return result;
  };
  const result = check();
  if (dependencies === defaults) pending.set(key, result);
  try { return await result; } finally { if (dependencies === defaults) pending.delete(key); }
}
