import "server-only";
import { createDecipheriv } from "node:crypto";
import { z } from "zod";
import type { DirectMediaSource, WatchSourceLink } from "@/shared/types/watchSources";
import { filenameMatchesSource } from "./downloads";
import { publicLink } from "./parser";

const ORIGIN = "https://hubstream.art";
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_MASTER_BYTES = 48 * 1024;
const MAX_PLAYLIST_BYTES = 1024 * 1024;
const TIKTOK_HOST = /^p\d{1,3}-ad-site-sign-sg\.tiktokcdn\.com$/;
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  Referer: `${ORIGIN}/`,
};

// Public HTTPS protocol/hash-derived constants published by the player bundle.
// Decrypt response data only; never evaluate provider scripts or ad strings.
const KEY = Buffer.from("kiemtienmua911ca", "utf8");
const IV = Buffer.from("1234567890oiuytr", "utf8");
const infoSchema = z.object({ title: z.string().min(1).max(1000) });
const videoSchema = infoSchema.extend({
  swarmId: z.string().min(1).max(32),
  hlsVideoTiktok: z.string().min(1).max(4096),
  streamingConfig: z.string().min(1).max(16_384),
});
const configSchema = z.object({ adjust: z.object({ Tiktok: z.object({
  disabled: z.boolean().optional(), domain: z.string().regex(TIKTOK_HOST),
  params: z.object({ v: z.string().regex(/^\d{1,16}$/) }).strict(),
}) }) });

export function decryptHubStreamPayload(value: string): unknown | null {
  const hex = value.trim();
  if (hex.length > MAX_METADATA_BYTES || !/^(?:[a-f0-9]{32})+$/i.test(hex)) return null;
  try {
    const decipher = createDecipheriv("aes-128-cbc", KEY, IV);
    const bytes = Buffer.concat([decipher.update(Buffer.from(hex, "hex")), decipher.final()]);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { return null; }
}

async function boundedBytes(response: Response, maximum: number, prefix = false): Promise<Uint8Array> {
  if (!response.body) throw new Error("Provider returned no data");
  const reader = response.body.getReader();
  try {
    if (!prefix && Number(response.headers.get("content-length")) > maximum) throw new Error("Provider response too large");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!prefix && bytes + chunk.value.byteLength > maximum) throw new Error("Provider response too large");
      const part = prefix ? chunk.value.subarray(0, maximum - bytes) : chunk.value;
      bytes += part.byteLength;
      chunks.push(part);
      if (prefix && bytes >= maximum) break;
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => undefined); }
}

async function boundedText(response: Response, maximum: number): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true }).decode(await boundedBytes(response, maximum));
}

/** Reproduce only the published TikTok route/parameter transformation. */
function tiktokMaster(value: string, rawConfig: string): URL | null {
  const url = publicLink(value, ORIGIN);
  if (!url || url.origin !== ORIGIN || url.hash || url.search ||
      !/^\/hls\/[a-zA-Z0-9_-]{8,128}\/unl\/[a-zA-Z0-9]{3,32}\/[a-zA-Z0-9]{3,32}\/tt\/master\.m3u8$/.test(url.pathname)) return null;
  let config: z.infer<typeof configSchema>;
  try { config = configSchema.parse(JSON.parse(rawConfig)); } catch { return null; }
  const adjustment = config.adjust.Tiktok;
  if (adjustment.disabled) return null;
  url.pathname = url.pathname.replace("/hls/", `/hlsmod/${adjustment.domain}/`);
  url.searchParams.set("v", adjustment.params.v);
  return url;
}

function masterVariants(text: string, master: URL): Array<{ url: URL; label: string }> {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U" || lines.some((line) => /^#.*\bURI\s*=/i.test(line))) return [];
  const directory = master.pathname.slice(0, master.pathname.lastIndexOf("/") + 1);
  const variants: Array<{ url: URL; label: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#")) continue;
    const dimensions = lines[i - 1]?.match(/^#EXT-X-STREAM-INF:.*\bRESOLUTION=(\d{2,5})x(\d{2,5})(?:,|$)/);
    const url = publicLink(line, master.href);
    if (!dimensions || !url || url.origin !== ORIGIN || url.hash || url.search !== master.search ||
        !url.pathname.startsWith(directory) || !/^index-f[12]-v\d{1,2}-a\d{1,2}\.m3u8$/.test(url.pathname.slice(directory.length))) return [];
    const width = Number(dimensions[1]);
    const quality = width === 1920 ? "1080p" : width === 1280 ? "720p" : `${dimensions[1]}×${dimensions[2]}`;
    variants.push({ url, label: `HubStream · ${quality}` });
  }
  return variants.length > 0 && variants.length <= 2 && new Set(variants.map((item) => item.url.href)).size === variants.length ? variants : [];
}

function tiktokMedia(value: string): URL | null {
  const url = publicLink(value, ORIGIN);
  if (!url || url.protocol !== "https:" || !TIKTOK_HOST.test(url.hostname) || url.port || url.hash ||
      !/^\/ad-site-i18n-sg\/[a-f0-9]{32}~tplv-d5opwmad15-ttam-origin\.image$/.test(url.pathname)) return null;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 3 || new Set(keys).size !== 3 || keys.some((key) => !["lk3s", "x-expires", "x-signature"].includes(key)) ||
      !/^[a-f0-9]{8}$/.test(url.searchParams.get("lk3s") || "") ||
      !/^[a-zA-Z0-9+/]{20,128}={0,2}$/.test(url.searchParams.get("x-signature") || "") ||
      !/^\d{10}$/.test(url.searchParams.get("x-expires") || "") ||
      Number(url.searchParams.get("x-expires")) * 1000 <= Date.now() + 30_000) return null;
  return url;
}

function mediaPlaylist(text: string): { text: string; first: URL } | null {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U" || lines.at(-1) !== "#EXT-X-ENDLIST") return null;
  let first: URL | null = null;
  let waitingForMedia = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#")) {
      // This published alternative is unencrypted MPEG-TS VOD. Exclude keys,
      // maps, nested playlists, external resources and unobserved tag syntax.
      if (waitingForMedia || !/^#(?:EXTINF:\d+(?:\.\d+)?,|EXT-X-(?:TARGETDURATION:\d+|ALLOW-CACHE:YES|PLAYLIST-TYPE:VOD|VERSION:3|MEDIA-SEQUENCE:\d+|ENDLIST))$/.test(line)) return null;
      waitingForMedia = line.startsWith("#EXTINF:");
    } else {
      if (!waitingForMedia) return null;
      const url = tiktokMedia(line);
      if (!url) return null;
      first ||= url;
      lines[i] = url.href;
      waitingForMedia = false;
    }
  }
  return first && !waitingForMedia ? { text: `${lines.join("\n")}\n`, first } : null;
}

function hasTransportStream(bytes: Uint8Array): boolean {
  // The published CDN files have a 120-byte PNG prefix followed by MPEG-TS.
  // Standard hls.js scans leading bytes for the same 188-byte packet sync.
  for (let i = 0; i <= Math.min(940, bytes.length - 377); i++) {
    if (bytes[i] === 0x47 && bytes[i + 188] === 0x47 && bytes[i + 376] === 0x47) return true;
  }
  return false;
}

/** Return validated playlist text; media bytes travel directly from CDN to browser. */
export async function resolveHubStreamMedia(link: WatchSourceLink, title: string,
  dependencies = { request: fetch }): Promise<DirectMediaSource[]> {
  if (link.kind !== "watch" || (link.scope !== "movie" && link.scope !== "episode")) return [];
  let page: URL;
  try { page = new URL(link.url); } catch { return []; }
  if (page.origin !== ORIGIN || page.pathname !== "/" || page.search || page.username || page.password ||
      !/^#[a-zA-Z0-9]{6,32}$/.test(page.hash)) return [];
  const id = page.hash.slice(1);
  const signal = AbortSignal.timeout(22_000);
  const request = async (url: string) => {
    if (new URL(url).origin !== ORIGIN) throw new Error("Unsupported metadata origin");
    const response = await dependencies.request(url, { redirect: "manual", cache: "no-store", signal, headers: REQUEST_HEADERS });
    if (response.status !== 200 || (response.url && response.url !== url)) {
      await response.body?.cancel();
      throw new Error("Provider is unavailable");
    }
    return response;
  };
  const playlistText = async (url: string, maximum: number) => {
    const response = await request(url);
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!/^application\/(?:vnd\.apple\.mpegurl|x-mpegurl)$/.test(mime || "")) {
      await response.body?.cancel();
      throw new Error("Provider returned no playlist");
    }
    return boundedText(response, maximum);
  };
  try {
    const info = infoSchema.safeParse(decryptHubStreamPayload(await boundedText(await request(`${ORIGIN}/api/v1/info?id=${id}`), MAX_METADATA_BYTES)));
    if (!info.success || !filenameMatchesSource(info.data.title, link, title)) return [];
    const video = videoSchema.safeParse(decryptHubStreamPayload(await boundedText(await request(`${ORIGIN}/api/v1/video?id=${id}&w=1280&h=720&r=`), MAX_METADATA_BYTES)));
    if (!video.success || video.data.swarmId !== id || video.data.title !== info.data.title ||
        !filenameMatchesSource(video.data.title, link, title)) return [];
    // TikTok uses different opaque asset IDs. Bind to the exact saved ID's
    // metadata/swarmId/title, then preserve the entire published asset path.
    const master = tiktokMaster(video.data.hlsVideoTiktok, video.data.streamingConfig);
    if (!master) return [];
    const variants = masterVariants(await playlistText(master.href, MAX_MASTER_BYTES), master);
    const sources: DirectMediaSource[] = [];
    for (const variant of variants) {
      try {
        const playlist = mediaPlaylist(await playlistText(variant.url.href, MAX_PLAYLIST_BYTES));
        if (!playlist) continue;
        const probe = await dependencies.request(playlist.first.href, { redirect: "manual", cache: "no-store", signal,
          headers: { Range: "bytes=0-1023" }, referrerPolicy: "no-referrer" });
        if (![200, 206].includes(probe.status) || (probe.url && probe.url !== playlist.first.href) ||
            probe.headers.get("access-control-allow-origin") !== "*") {
          await probe.body?.cancel();
          continue;
        }
        if (!hasTransportStream(await boundedBytes(probe, 1024, true))) continue;
        sources.push({ url: variant.url.href, format: "hls", label: variant.label, referrerPolicy: "no-referrer", hlsPlaylist: playlist.text });
      } catch { /* Keep independently verified variants if another is unavailable. */ }
    }
    return sources;
  } catch { return []; }
}
