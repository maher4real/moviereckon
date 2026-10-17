import { load } from "cheerio";
import type { DirectMediaSource } from "@/shared/types/watchSources";
import { publicLink } from "./parser";

function stringLiteral(value: string): string {
  return value.slice(1, -1).replace(/\\(u[\da-f]{4}|x[\da-f]{2}|[\s\S])/gi, (_, escaped: string) => {
    if (/^[ux][\da-f]+$/i.test(escaped)) return String.fromCharCode(parseInt(escaped.slice(1), 16));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[escaped] ?? escaped;
  });
}

/** Decode a bounded word dictionary as text. Never evaluate the player/ad code. */
export function unpackPlayerData(script: string): string | null {
  if (script.length > 512_000) return null;
  const packed = script.match(/\}\(\s*('(?:\\.|[^'\\])*')\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*('(?:\\.|[^'\\])*')\.split\('\|'\)/);
  if (!packed) return null;
  const radix = Number(packed[2]);
  const count = Number(packed[3]);
  const words = stringLiteral(packed[4]).split("|");
  if (radix < 2 || radix > 36 || count > 2000 || count !== words.length) return null;
  const dictionary = new Map(words.map((word, index) => [index.toString(radix), word]));
  let size = 0;
  const decoded = stringLiteral(packed[1]).replace(/\b\w+\b/g, (word) => {
    const replacement = dictionary.get(word) || word;
    size += replacement.length;
    return size <= 1_000_000 ? replacement : "";
  });
  return size <= 1_000_000 ? decoded : null;
}

/** HDStream publishes its HLS candidates in a JSON `links` object. */
export function parseHdStreamMedia(html: string, pageUrl: string): DirectMediaSource[] {
  const provider = publicLink(pageUrl, "https://hdstream4u.com");
  if (!provider) return [];
  const $ = load(html);
  for (const script of $("script:not([src])").toArray()) {
    const decoded = unpackPlayerData($(script).text());
    const object = decoded?.match(/\b(?:var|let|const)\s+links\s*=\s*(\{[^{}]{1,16000}\})\s*;/)?.[1];
    if (!object) continue;
    try {
      const links = JSON.parse(object) as Record<string, unknown>;
      const seen = new Set<string>();
      // The observed provider-origin proxy omits CORS headers. Offer CDN
      // candidates; its HTTP-200 proxy is not a browser-playable fallback.
      return ["hls2", "hls4", "hls3"].flatMap((key) => {
        const value = links[key];
        if (typeof value !== "string" || value.length > 4096) return [];
        const url = publicLink(value, pageUrl);
        if (!url || url.protocol !== "https:" || url.hash || url.origin === provider.origin || seen.has(url.href)) return [];
        seen.add(url.href);
        return [{ url: url.href, format: "hls" as const, label: `Stream ${seen.size} · Auto quality` }];
      });
    } catch { /* Invalid data cannot become a playable source. */ }
  }
  return [];
}
