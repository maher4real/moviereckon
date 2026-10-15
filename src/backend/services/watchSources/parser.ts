import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { load } from "cheerio";
import type { ParsedSourcePage, WatchSourceLink } from "@/shared/types/watchSources";
import { directMediaFormat, isDirectFileLink } from "@/shared/lib/watchSources";

const text = (value: string) => value.replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ").trim();
const LANGUAGE_NAMES = /\b(Hindi|English|Tamil|Telugu|Malayalam|Kannada|Punjabi|Gujarati|Bengali|Marathi|Korean|Japanese|Spanish|French|German|Chinese)\b/gi;

export function publicLink(value: string, base: string): URL | null {
  try {
    const url = new URL(value, base);
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        (url.port && !["80", "443"].includes(url.port)) || isIP(host.replace(/^\[|\]$/g, "")) ||
        !host.includes(".") || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

export function normalizeSourceTitle(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Parse the published download section only, excluding navigation, trailers and comments. */
export function parseSourcePage(html: string, sourceUrl: string): ParsedSourcePage {
  const $ = load(html);
  const heading = $("h1").first().clone();
  heading.find("i, .material-icons").remove();
  const rawTitle = text(heading.text() || $("meta[property='og:title']").attr("content") || $("title").text());
  const mediaType = /\b(?:season|series|episodes?)\b|\bS\d{1,2}\b/i.test(rawTitle) ? "tv" : "movie";
  const title = text(rawTitle.split(/\s*(?:\((?:19|20)\d{2}\)|\(Season\b|\[|\b(?:BluRay|WEB[- ]?(?:DL|Rip)|HDRip|HDTC|HDTS|DS4K|Season\s+\d+)\b)/i)[0]);
  if (!title) throw new Error("Source page has no title");
  const yearMatch = rawTitle.match(/\(((?:19|20)\d{2})\)/);
  const seasonMatch = rawTitle.match(/\bSeason\s*[-:]?\s*(\d{1,3})\b|\bS(\d{1,2})\b/i);
  const defaultSeason = seasonMatch ? Number(seasonMatch[1] || seasonMatch[2]) : null;
  const imdbHref = $("a[href]").toArray().map((element) => $(element).attr("href") || "")
    .find((href) => /^https?:\/\/(?:www\.)?imdb\.com\/title\/tt\d+/i.test(href));
  const imdbId = imdbHref?.match(/\b(tt\d+)\b/)?.[1] || null;
  const languages = [...new Set((rawTitle.match(LANGUAGE_NAMES) || []).map((name) => name.toLowerCase()))];
  const links: WatchSourceLink[] = [];
  const seen = new Set<string>();
  let active = false;
  let ended = false;
  let season = defaultSeason;
  let episode: number | null = null;
  let episodeEnd: number | null = null;
  let sectionCodec: WatchSourceLink["codec"] = null;

  // Some source pages have malformed nested divs. Walk document order instead
  // of relying on one CSS content wrapper to contain every quality row.
  $("h1,h2,h3,h4,h5,h6,a[href]").each((_, element) => {
    if (ended) return;
    const node = $(element);
    const label = text(node.text());
    if (element.tagName !== "a") {
      if (/download\s+links/i.test(label)) { active = true; return; }
      if (!active) return;
      if (/^(?:h1|h2)$/.test(element.tagName) &&
          /storyline|review|description|trailer|screen.?shots|watch online|you may also/i.test(label)) {
        ended = true; return;
      }
      if (/single\s+episode/i.test(label)) {
        episode = null; episodeEnd = null;
        sectionCodec = /x264|h\.?264/i.test(label) ? "H.264" : /hevc|x265/i.test(label) ? "HEVC" : null;
      }
      // Only standalone section headings establish scope, so an "EP-08 Added"
      // note or a range in a season-pack label cannot contaminate later rows.
      if (node.find("a").length === 0) {
        const sm = label.match(/\bSeason\s*[-:]?\s*(\d+)\b|\bS(\d{1,2})(?=E|\b)/i);
        if (sm) { season = Number(sm[1] || sm[2]); episode = null; episodeEnd = null; }
        const em = label.match(/\b(?:episodes?|ep)\s*[-:]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\b|\bS\d{1,2}E(\d{1,3})(?:\s*[-–]\s*E?(\d+))?/i);
        if (em) { episode = Number(em[1] || em[3]); episodeEnd = em[2] || em[4] ? Number(em[2] || em[4]) : null; }
      }
      return;
    }
    if (!active || !label || /how to|join|telegram|whatsapp|imdb|trailer/i.test(label)) return;
    const url = publicLink(node.attr("href") || "", sourceUrl);
    if (!url || (url.origin === new URL(sourceUrl).origin && !directMediaFormat(url.href) && !isDirectFileLink(url.href))) return;
    const block = node.closest("h3,h4,h5,h6,p,li");
    const context = text(block.length ? block.text() : label);
    const metadata = `${label} ${context}`;
    const resolutionMatch = metadata.match(/\b(360|480|576|720|1080|1440|2160|4320)p\b/i);
    const resolution = resolutionMatch ? Number(resolutionMatch[1]) : /\b4K\b/i.test(metadata) ? 2160 : /\b8K\b/i.test(metadata) ? 4320 : null;
    const watch = /\bwatch\b|\bplayer\s*[-:]?\s*\d*\b|\bstream(?:ing)?\b/i.test(label);
    if (!watch && resolution === null && !directMediaFormat(url.href) && !isDirectFileLink(url.href)) return;
    const collection = !watch && /\b(?:SDR|HDR|DV|REMUX)\b/i.test(label) && label.includes("|");
    const scope = mediaType === "movie" ? "movie" : collection ? (season === null ? "series" : "season") :
      episode !== null ? (episodeEnd !== null ? "episode-range" : "episode") : season !== null ? "season" : "series";
    const key = `${url.href}|${scope}|${season}|${episode}|${episodeEnd}|${resolution}`;
    if (seen.has(key)) return;
    seen.add(key);
    const bitMatch = metadata.match(/\b(8|10|12)\s*[- ]?bit\b/i);
    const sizeMatch = metadata.match(/\b\d+(?:\.\d+)?\s*(?:MB|GB|TB)\b/i);
    links.push({
      id: createHash("sha256").update(key).digest("hex").slice(0, 24),
      label, url: url.href, host: url.hostname,
      kind: watch ? "watch" : collection ? "collection" : "download",
      verification: "unverified", quality: resolution === null ? null : `${resolution}p`, resolution,
      codec: /hevc|x265|h\.?265/i.test(metadata) ? "HEVC" : /x264|h\.?264/i.test(metadata) ? "H.264" : /\bAV1\b/i.test(metadata) ? "AV1" : sectionCodec,
      bitDepth: bitMatch ? Number(bitMatch[1]) : null,
      size: sizeMatch ? sizeMatch[0].replace(/\s/g, "").toUpperCase() : null,
      formats: [...new Set((metadata.match(/\b(?:SDR|HDR10\+?|HDR|DV|REMUX|BluRay|WEB-DL)\b/gi) || []).map((format) => format.toUpperCase()))],
      languages, scope, season: mediaType === "tv" ? season : null,
      episode: scope === "episode" || scope === "episode-range" ? episode : null,
      episodeEnd: scope === "episode-range" ? episodeEnd : null,
    });
  });
  return { title, year: yearMatch ? Number(yearMatch[1]) : null, mediaType, imdbId, season: defaultSeason, links };
}

/** Same-origin content pages only; navigation and pagination are not queue jobs. */
export function discoverSourcePages(html: string, baseUrl: string): string[] {
  const $ = load(html);
  const base = new URL(baseUrl);
  const pages = new Set<string>();
  $("a[href]").each((_, element) => {
    const url = publicLink($(element).attr("href") || "", base.href);
    if (!url || url.origin !== base.origin || url.search || url.hash ||
        !/^\/[^/]+\/$/.test(url.pathname) ||
        !/(?:full-(?:movie|series|season|episodes)|alll?-episodes)/i.test(url.pathname)) return;
    pages.add(url.href);
  });
  return [...pages];
}
