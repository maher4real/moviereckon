import "server-only";
import { load } from "cheerio";
import { isAdditionalWatchPlayer, isGreenMotorsUrl, isMultiCloudPlayer, streamtapeFileId } from "@/shared/lib/watchSources";
import type { DirectMediaSource, WatchSourceLink } from "@/shared/types/watchSources";
import { filenameMatchesSource } from "./downloads";
import { decodeGreenMotorsDestination, parseGreenMotorsMirrors } from "./greenMotors";
import { fetchSourceDocument } from "./http";

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash ? url : null;
  } catch { return null; }
}

/** Parse only the player's literal concatenation and substring operations, never JavaScript. */
export function parseStreamtapeMedia(html: string, id: string): URL | null {
  if (html.length > 1_000_000) return null;
  const $ = load(html);
  const assignments = $("script:not([src])").toArray().flatMap((script) =>
    [...$(script).text().matchAll(/document\.getElementById\('robotlink'\)\.innerHTML\s*=\s*([^;\r\n]+);/g)]);
  if (assignments.length !== 1) return null;
  const parts = assignments[0][1].trim().match(/^'([^'\\\r\n]{1,8192})'\s*\+\s*\('([^'\\\r\n]{1,8192})'\)((?:\.substring\(\d{1,2}\)){1,3})$/);
  if (!parts) return null;
  let suffix = parts[2];
  for (const operation of parts[3].matchAll(/substring\((\d+)\)/g)) suffix = suffix.substring(Number(operation[1]));
  const url = httpsUrl(`https:${parts[1]}${suffix}`);
  if (!url || url.origin !== "https://streamtape.com" || url.pathname !== "/get_video" ||
      url.searchParams.get("id") !== id || [...url.searchParams.keys()].sort().join(",") !== "expires,id,ip,token" ||
      !/^[A-Za-z0-9_-]{6,128}$/.test(url.searchParams.get("token") || "") ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(url.searchParams.get("ip") || "")) return null;
  url.searchParams.set("stream", "1");
  return url;
}

function multiCloudMediaUrl(value: string): URL | null {
  const url = httpsUrl(value);
  return url && /^dr\d{1,3}\.multidownload\.lol$/.test(url.hostname) && /^\/d\/[a-f0-9]{8,64}$/.test(url.pathname) &&
    [...url.searchParams.keys()].sort().join(",") === "action,eid,exp,token" && url.searchParams.get("action") === "watch" &&
    /^[A-Za-z0-9_-]{1,1024}$/.test(url.searchParams.get("eid") || "") &&
    /^[a-f0-9]{16,128}$/.test(url.searchParams.get("token") || "") ? url : null;
}

export function parseMultiCloudMedia(html: string): URL[] {
  if (html.length > 1_000_000) return [];
  const $ = load(html);
  const urls = new Set<string>();
  $("script:not([src])").each((_, script) => {
    for (const match of $(script).text().matchAll(/\bconst\s+(?:streamSrc|dbStreamSrc)\s*=\s*("[^"\r\n]{1,8192}")\s*;/g)) {
      try {
        const url = multiCloudMediaUrl(JSON.parse(match[1]));
        if (url) urls.add(url.href);
      } catch { /* Invalid literal. */ }
    }
  });
  return [...urls].slice(0, 2).map((url) => new URL(url));
}

function expiry(url: URL): number {
  const value = url.searchParams.get("expires") || url.searchParams.get("exp") || "";
  return /^\d{10}$/.test(value) ? Number(value) * 1000 : 0;
}

/** Read at most the file prefix, even if the upstream ignores Range. Never proxy the movie. */
async function verifyMedia(url: URL, allowed: (url: URL) => boolean, fetcher: typeof fetch,
  signal: AbortSignal): Promise<"mp4" | "webm" | null> {
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!allowed(current)) return null;
    const response = await fetcher(current.href, { redirect: "manual", cache: "no-store", signal,
      headers: { Range: "bytes=0-1023", Accept: "video/mp4,video/webm,application/octet-stream" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      const next = location ? httpsUrl(new URL(location, current).href) : null;
      if (!next) return null;
      current = next;
      continue;
    }
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (![200, 206].includes(response.status) || !["video/mp4", "video/webm", "application/octet-stream"].includes(mime || "") ||
        (response.status === 206 && !/^bytes 0-\d+\/\d+$/.test(response.headers.get("content-range") || ""))) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const prefix = Buffer.alloc(1024);
    let length = 0;
    try {
      while (length < prefix.length) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const bytes = chunk.value.subarray(0, prefix.length - length);
        prefix.set(bytes, length);
        length += bytes.length;
      }
    } finally { await reader.cancel(); }
    if (length >= 16 && prefix.toString("ascii", 4, 8) === "ftyp" &&
        prefix.readUInt32BE(0) >= 16 && ["video/mp4", "application/octet-stream"].includes(mime!)) return "mp4";
    if (length >= 16 && prefix.readUInt32BE(0) === 0x1a45dfa3 &&
        prefix.subarray(0, length).includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])) &&
        ["video/webm", "application/octet-stream"].includes(mime!)) return "webm";
    return null;
  }
  return null;
}

async function resolvePlayer(link: WatchSourceLink, title: string, fetchDocument: typeof fetchSourceDocument,
  fetcher: typeof fetch, signal: AbortSignal): Promise<DirectMediaSource[]> {
  const id = streamtapeFileId(link.url);
  const playerUrl = id ? `https://streamtape.com/e/${id}` : link.url;
  if (!isAdditionalWatchPlayer(playerUrl)) return [];
  const result = await fetchDocument(playerUrl, new URL(playerUrl).origin, {}, { signal,
    redirectOriginAllowed: id ? undefined : (origin) => isMultiCloudPlayer(`${origin}/player.php/?v=abcdef`) });
  const finalUrl = result.finalUrl || playerUrl;
  // Domain rotations must preserve the published file ID and player route.
  if (id ? finalUrl !== playerUrl : !isMultiCloudPlayer(finalUrl) ||
      new URL(finalUrl).search !== new URL(playerUrl).search) return [];
  const html = result.html || "";
  if (html.length > 1_000_000) return [];
  const $ = load(html);
  const filename = id ? $("meta[name='og:title'],meta[property='og:title']").first().attr("content") || "" :
    $("title").text().replace(/\s+-\s+Premium Stream\s*$/, "").trim();
  if (!filenameMatchesSource(filename, link, title)) return [];
  const tapeUrl = id ? parseStreamtapeMedia(html, id) : null;
  const candidates = id ? (tapeUrl ? [tapeUrl] : []) : parseMultiCloudMedia(html);
  const sources: DirectMediaSource[] = [];
  for (const candidate of candidates) {
    const expires = expiry(candidate);
    if (expires <= Date.now() + 30_000) continue;
    const allowed = (url: URL) => !!httpsUrl(url.href) && (url.href === candidate.href || (id ?
      /^\d{1,15}\.tapecontent\.net$/.test(url.hostname) && url.pathname.startsWith(`/radosgw/${id}/`) &&
        filenameMatchesSource(decodeURIComponent(url.pathname.split("/").at(-1) || ""), link, title) :
      !!multiCloudMediaUrl(url.href) && url.pathname === candidate.pathname && url.search === candidate.search));
    try {
      const format = await verifyMedia(candidate, allowed, fetcher, signal);
      if (format && expires > Date.now() + 30_000) sources.push({ url: candidate.href, format, mediaVerified: true,
        playerUrl: finalUrl, expiresAt: new Date(expires).toISOString(), label: link.quality || "Standard" });
    } catch { /* A dead mirror must not suppress another published candidate. */ }
  }
  return sources;
}

/** Resolve only published, known player destinations with exact file metadata and media evidence. */
export async function resolveAdditionalWatchMedia(link: WatchSourceLink, title: string,
  fetchDocument = fetchSourceDocument, fetcher: typeof fetch = fetch): Promise<DirectMediaSource[]> {
  if (link.kind !== "watch" || !["movie", "episode"].includes(link.scope)) return [];
  const signal = AbortSignal.timeout(48_000);
  let urls = [link.url];
  if (isGreenMotorsUrl(link.url)) {
    const page = await fetchDocument(link.url, new URL(link.url).origin, {}, { signal,
      redirectOriginAllowed: (origin) => ["https://greenmotors.club", "https://greenmotors.cc"].includes(origin) });
    const destination = decodeGreenMotorsDestination(page.html || "", "watch");
    if (!destination) return [];
    if (destination.origin === "https://hblinks.lol") {
      const archive = await fetchDocument(destination.href, destination.origin, {}, { signal });
      urls = parseGreenMotorsMirrors(archive.html || "", destination, "watch");
    } else urls = [destination.href];
  }
  const sources: DirectMediaSource[] = [];
  for (let index = 0; index < urls.length && !signal.aborted; index += 3) {
    const batch = await Promise.allSettled(urls.slice(index, index + 3).map((url) =>
      resolvePlayer({ ...link, url }, title, fetchDocument, fetcher, signal)));
    for (const result of batch) if (result.status === "fulfilled") sources.push(...result.value);
  }
  return sources;
}
