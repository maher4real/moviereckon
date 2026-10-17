import "server-only";
import type { DirectMediaSource } from "@/shared/types/watchSources";
import { publicLink } from "./parser";

// Only the CDN families published by this adapter may be probed by the server.
const CDN_HOST = /^[a-z0-9]+\.(?:acek-cdn\.com|mediaveltrino\.online)$/;
const MAX_PLAYLIST_BYTES = 1024 * 1024;

async function readBytes(response: Response, maximum: number, prefix = false): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty media response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!prefix && size + chunk.value.byteLength > maximum) throw new Error("Playlist too large");
      const bytes = prefix ? chunk.value.subarray(0, maximum - size) : chunk.value;
      chunks.push(bytes);
      size += bytes.byteLength;
      if (prefix && size >= maximum) break;
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => undefined); }
}

function resource(value: string, parent: URL): URL | null {
  const url = publicLink(value, parent.href);
  const directory = parent.pathname.slice(0, parent.pathname.lastIndexOf("/") + 1);
  return url && url.protocol === "https:" && !url.hash && url.origin === parent.origin &&
    url.pathname.startsWith(directory) ? url : null;
}

function variants(text: string, master: URL): Array<{ url: URL; label: string }> {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") return [];
  const result: Array<{ url: URL; label: string }> = [];
  for (let index = 1; index < lines.length; index++) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const url = resource(lines[index + 1] || "", master);
    if (!url || !/\.(?:m3u8|txt)$/.test(url.pathname)) return [];
    const dimensions = lines[index].match(/\bRESOLUTION=(\d+)x(\d+)/);
    const height = dimensions?.[1] === "1920" ? "1080" : dimensions?.[1] === "1280" ? "720" : dimensions?.[2];
    result.push({ url, label: height ? `HDStream · ${height}p` : "HDStream" });
  }
  return result.length <= 4 ? result : [];
}

function mediaPlaylist(text: string, parent: URL): { text: string; first: URL } | null {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U" || lines.at(-1) !== "#EXT-X-ENDLIST") return null;
  let first: URL | null = null;
  let waiting = false;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith("#")) {
      if (waiting || !/^#(?:EXTINF:\d+(?:\.\d+)?,|EXT-X-(?:TARGETDURATION:\d+|ALLOW-CACHE:YES|PLAYLIST-TYPE:VOD|VERSION:\d+|MEDIA-SEQUENCE:\d+|DISCONTINUITY|ENDLIST))$/.test(line)) return null;
      waiting = line.startsWith("#EXTINF:");
    } else {
      const url = resource(line, parent);
      if (!waiting || !url || !/\.ts$/.test(url.pathname)) return null;
      first ||= url;
      lines[index] = url.href;
      waiting = false;
    }
  }
  return first && !waiting ? { text: `${lines.join("\n")}\n`, first } : null;
}

/** Validate actual media, not just a URL in a player page. Never proxy video. */
export async function resolveHdStreamMedia(candidates: DirectMediaSource[], request: typeof fetch = fetch, parentSignal?: AbortSignal): Promise<DirectMediaSource[]> {
  const timeout = AbortSignal.timeout(18_000);
  const signal = parentSignal ? AbortSignal.any([timeout, parentSignal]) : timeout;
  const playlist = async (url: URL, maximum: number) => {
    const response = await request(url.href, { redirect: "manual", cache: "no-store", signal, referrerPolicy: "no-referrer" });
    if (response.status !== 200 || (response.url && response.url !== url.href) ||
        !/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(response.headers.get("content-type") || "")) {
      await response.body?.cancel();
      throw new Error("Unavailable playlist");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(await readBytes(response, maximum));
  };
  const results = await Promise.allSettled(candidates.slice(0, 3).map(async (candidate) => {
    const master = publicLink(candidate.url, "https://hdstream4u.com");
    if (!master || !CDN_HOST.test(master.hostname) || master.protocol !== "https:" || master.hash) return [];
    const choices = variants(await playlist(master, 48 * 1024), master);
    const sources: DirectMediaSource[] = [];
    for (const choice of choices) {
      try {
        const media = mediaPlaylist(await playlist(choice.url, MAX_PLAYLIST_BYTES), choice.url);
        if (!media) continue;
        const response = await request(media.first.href, { redirect: "manual", cache: "no-store", signal,
          headers: { Range: "bytes=0-1023" }, referrerPolicy: "no-referrer" });
        if (![200, 206].includes(response.status) || (response.url && response.url !== media.first.href) ||
            response.headers.get("access-control-allow-origin") !== "*") {
          await response.body?.cancel();
          continue;
        }
        const bytes = await readBytes(response, 1024, true);
        let transportStream = false;
        for (let offset = 0; offset <= Math.min(940, bytes.length - 377); offset++) {
          if (bytes[offset] === 0x47 && bytes[offset + 188] === 0x47 && bytes[offset + 376] === 0x47) { transportStream = true; break; }
        }
        if (transportStream) sources.push({ url: choice.url.href, format: "hls", label: choice.label,
          referrerPolicy: "no-referrer", hlsPlaylist: media.text });
      } catch { /* Preserve independently working qualities. */ }
    }
    return sources;
  }));
  const sources = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return sources.filter((source, index) => sources.findIndex((other) => other.url === source.url) === index);
}
