import "server-only";
import { load } from "cheerio";
import { isGreenMotorsUrl, isResolvableDownload } from "@/shared/lib/watchSources";
import type { ResolvedDownload, WatchSourceLink } from "@/shared/types/watchSources";
import { decodeGreenMotorsDestination, parseGreenMotorsMirrors } from "./greenMotors";
import { fetchSourceDocument } from "./http";
import { normalizeSourceTitle, publicLink } from "./parser";

/** Only storage hosts observed in the supported providers' file buttons may be probed. */
export function finalStorageUrl(value: string): URL | null {
  const url = publicLink(value, "https://hubcdn.wiki");
  return url?.protocol === "https:" && !url.hash && url.pathname !== "/" &&
    /^(?:pub-[a-f0-9]{32}\.r2\.dev|[a-f0-9]{32}\.r2\.cloudflarestorage\.com|video-downloads\.googleusercontent\.com)$/.test(url.hostname) ? url : null;
}

/** Decode this provider's published redirect parameter as data, without visiting the ad site. */
export function parseCdnFile(html: string): URL | null {
  const candidates = html.match(/https:\/\/inventoryidea\.com\/\?r=[A-Za-z0-9+/=%_-]+/g) || [];
  const files = new Map<string, URL>();
  for (const value of candidates.slice(0, 10)) {
    try {
      const encoded = decodeURIComponent(new URL(value).search.slice(3));
      if (!encoded || encoded.length > 12_000 || !/^[A-Za-z0-9+/=_-]+$/.test(encoded)) continue;
      const decoded = new URL(Buffer.from(encoded, "base64").toString("utf8"));
      if (decoded.origin !== "https://hubcdn.club" || decoded.username || decoded.password ||
          decoded.pathname !== "/dl/" || decoded.hash || [...decoded.searchParams.keys()].some((key) => key !== "link")) continue;
      const url = finalStorageUrl(decoded.searchParams.get("link") || "");
      if (url) files.set(url.href, url);
    } catch { /* Malformed redirect data is not a usable source. */ }
  }
  // An ambiguous set must not silently pick an unrelated file.
  return files.size === 1 ? [...files.values()][0] : null;
}

export function filenameMatchesSource(filename: string, link: WatchSourceLink, title: string): boolean {
  if (filename.length > 1000 || /[/\\]/.test(filename) || [...filename].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      !/\.(?:mp4|webm|mkv|mov|avi|zip|rar|7z)$/i.test(filename)) return false;
  const normalized = normalizeSourceTitle(filename);
  const expected = normalizeSourceTitle(title);
  if (!expected || !normalized.startsWith(`${expected} `)) return false;
  if (link.scope === "movie" && link.releaseYear && !normalized.startsWith(`${expected} ${link.releaseYear} `)) return false;
  filename = filename.replaceAll("_", ".");
  const episodes = [...filename.matchAll(/\bS(\d{1,3})[._ -]?E(\d{1,4})(?:\s*[-–]\s*E?(\d{1,4}))?\b/gi)];
  const se = episodes[0];
  if (link.scope === "episode" && (episodes.length !== 1 || Number(se[1]) !== link.season || Number(se[2]) !== link.episode || se[3])) return false;
  if (link.scope === "season" && (se || Number(filename.match(/\bS(\d{1,3})\b/i)?.[1]) !== link.season)) return false;
  if (link.scope === "movie" && se) return false;
  if (link.resolution !== null) {
    const quality = filename.match(/\b(360|480|576|720|1080|1440|2160|4320)p\b/i);
    if (!quality || Number(quality[1]) !== link.resolution) return false;
  }
  if (link.codec === "HEVC" && !/\b(?:HEVC|x265|h[._ -]?265)\b/i.test(filename)) return false;
  if (link.codec === "H.264" && !/\b(?:x264|h[._ -]?264)\b/i.test(filename)) return false;
  if (link.codec === "AV1" && !/\bAV1\b/i.test(filename)) return false;
  return true;
}

function responseFilename(response: Response): string | null {
  const value = response.headers.get("content-disposition") || "";
  const encoded = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  try {
    return encoded ? decodeURIComponent(encoded.trim()) : value.match(/filename\s*=\s*"([^"]+)"/i)?.[1] ||
      value.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim() || null;
  } catch { return null; }
}

function expiry(url: URL): string | null {
  const date = url.searchParams.get("X-Amz-Date")?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  const seconds = Number(url.searchParams.get("X-Amz-Expires"));
  if (!date || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 604_800) return null;
  const [, year, month, day, hour, minute, second] = date;
  return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) + seconds * 1000).toISOString();
}

async function checkFile(url: URL, link: WatchSourceLink, title: string, signal: AbortSignal, request: typeof fetch): Promise<ResolvedDownload | null> {
  // Signed S3 links authorize GET rather than HEAD. Request one byte and cancel
  // immediately; the full movie/episode is never buffered or proxied by this API.
  const signed = url.searchParams.has("X-Amz-Signature");
  let response = await request(url.href, { method: signed ? "GET" : "HEAD", redirect: "manual", cache: "no-store",
    signal, headers: signed ? { Range: "bytes=0-0" } : {} });
  await response.body?.cancel();
  if (!signed && [405, 501].includes(response.status)) {
    response = await request(url.href, { method: "GET", redirect: "manual", cache: "no-store", signal, headers: { Range: "bytes=0-0" } });
    await response.body?.cancel();
  }
  if (![200, 206].includes(response.status)) return null;
  let filename = responseFilename(response);
  if (!filename && !response.headers.has("content-disposition")) {
    try { filename = decodeURIComponent(url.pathname.split("/").pop() || ""); } catch { return null; }
  }
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!filename || !filenameMatchesSource(filename, link, title) ||
      !/^(?:video\/[a-z0-9.+-]+|application\/(?:octet-stream|zip|x-zip-compressed|x-rar-compressed|vnd\.rar|x-7z-compressed))$/.test(contentType)) return null;
  const checkedAt = new Date();
  const expiresAt = expiry(url);
  if (expiresAt && Date.parse(expiresAt) <= checkedAt.getTime() + 30_000) return null;
  const bytes = response.status === 206 ? response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1] : response.headers.get("content-length");
  const sizeBytes = bytes && Number.isSafeInteger(Number(bytes)) && Number(bytes) > 0 ? Number(bytes) : null;
  return { url: url.href, filename, sizeBytes, contentType, checkedAt: checkedAt.toISOString(), expiresAt };
}

export async function resolveSourceDownloads(link: WatchSourceLink, title: string,
  dependencies = { fetchDocument: fetchSourceDocument, request: fetch },
  signal = AbortSignal.timeout(22_000)): Promise<ResolvedDownload[]> {
  if (!isResolvableDownload(link)) return [];
  const document = async (url: URL) => (await dependencies.fetchDocument(url.href, url.origin, {}, { signal })).html || "";
  let candidates: URL[] = [];
  const original = new URL(link.url);
  if (isGreenMotorsUrl(link.url)) {
    // Canonicalize the observed domain rotation instead of following arbitrary redirects.
    const wrapper = new URL(original.pathname + original.search, "https://greenmotors.cc");
    const destination = decodeGreenMotorsDestination(await document(wrapper));
    if (!destination) return [];
    const mirrors = destination.origin === "https://hblinks.lol" ?
      parseGreenMotorsMirrors(await document(destination), destination) : [destination.href];
    const found: ResolvedDownload[] = [];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(2, mirrors.length) }, async () => {
      while (cursor < mirrors.length && !signal.aborted) {
        const mirror = mirrors[cursor++];
        try {
          found.push(...await resolveSourceDownloads({ ...link, url: mirror, host: new URL(mirror).hostname }, title, dependencies, signal));
        } catch { /* A failed mirror must not hide other working destinations. */ }
      }
    }));
    // Signed timestamps can change between mirrors while pointing to the same file.
    return [...new Map(found.map((file) => {
      const url = new URL(file.url);
      return [`${url.origin}${url.pathname}|${file.filename}|${file.sizeBytes}`, file] as const;
    })).values()].slice(0, 8);
  }
  if (original.hostname === "hubcdn.club" || original.hostname === "hubcdn.wiki") {
    // This is the observed provider domain rotation, not an arbitrary redirect.
    const canonical = new URL(original.pathname, "https://hubcdn.wiki");
    const file = parseCdnFile(await document(canonical));
    if (file) candidates = [file];
  } else {
    const drive = load(original.hostname === "hubcloud.ist" ? "" : await document(original));
    const cloudLinks = drive("a[href]").toArray().flatMap((node) => {
      const url = publicLink(drive(node).attr("href") || "", original.href);
      return url?.origin === "https://hubcloud.ist" && !url.search && !url.hash && /^\/drive\/[a-z0-9]+$/.test(url.pathname) ? [url] : [];
    });
    const unique = original.hostname === "hubcloud.ist" ? [new URL(original.href.replace(/\/$/, ""))] : [...new Map(cloudLinks.map((url) => [url.href, url])).values()];
    if (unique.length !== 1) return [];
    const cloud = unique[0];
    const page = load(await document(cloud));
    const next = publicLink(page("a#download").attr("href") || "", cloud.href);
    if (!next || next.origin !== "https://gamerxyt.com" || next.pathname !== "/hubcloud.php" || next.hash ||
        next.searchParams.get("host") !== "hubcloud" || next.searchParams.get("id") !== cloud.pathname.split("/").pop() ||
        !next.searchParams.get("token") || [...next.searchParams.keys()].some((key) => !["host", "id", "token"].includes(key))) return [];
    const files = load(await document(next));
    candidates = files("a#s3[href],a#fsl[href]").toArray().flatMap((node) => {
      const url = finalStorageUrl(files(node).attr("href") || "");
      return url ? [url] : [];
    });
  }
  const unique = [...new Map(candidates.map((url) => [url.href, url])).values()].slice(0, 2);
  const checks = await Promise.allSettled(unique.map((url) => checkFile(url, link, title, signal, dependencies.request)));
  return checks.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
}
