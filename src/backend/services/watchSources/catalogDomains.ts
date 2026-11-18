import "server-only";
import { load } from "cheerio";
import type { ImporterConfig } from "./config";
import { fetchSourceDocument, type SourceResponse } from "./http";
import { fetchMoviesDriveDocument, moviesDriveDomainPolicy } from "./moviesDriveDomains";
import { publicLink } from "./parser";

// Observed redirects, kept separate for each catalog. Never trust arbitrary TLDs.
const ORIGINS = {
  hdhub: ["https://new14.hdhub4u.cl", "https://new10.hdhub4u.cl", "https://new8.hdhub4u.cl"],
  moviesmod: ["https://moviesmod.fi", "https://moviesmod.tw", "https://moviesmod.meme", "https://moviesmod.uk.com"],
  bollyflix: ["https://new1.bollyflix.tours", "https://bollyflix.church", "https://bollyflix.co.za"],
  rogmovies: ["https://rogmovies.cyou", "https://rogmovies.im"],
  uhdmovies: ["https://uhdmovies.ceo", "https://uhdmovies.beauty", "https://uhdmovies.us.org"],
} as const;

export function catalogOriginAllowed(config: ImporterConfig, origin: string): boolean {
  if (config.provider === "moviesdrive") return moviesDriveDomainPolicy("catalog", config.baseUrl).allows(origin);
  if (origin === config.baseUrl) return true;
  const provider = config.provider || "hdhub";
  if (provider === "hdhub" && /^https:\/\/(?:new\d+\.)?hdhub4u\.cl$/.test(origin)) return true;
  return provider in ORIGINS && (ORIGINS[provider as keyof typeof ORIGINS] as readonly string[]).includes(origin);
}

/** Preserve logical URLs/IDs while parsing links published on the new origin. */
function rebaseDocument(result: SourceResponse, config: ImporterConfig, requested: URL, format?: "html" | "xml" | "json"): SourceResponse {
  if (result.html === null || format === "json") return result;
  const finalUrl = result.finalUrl || requested.href;
  const $ = load(result.html, { xmlMode: format === "xml" });
  $(format === "xml" ? "loc" : "a[href]").each((_, node) => {
    const value = format === "xml" ? $(node).text().trim() : $(node).attr("href") || "";
    const url = publicLink(value, finalUrl);
    if (!url || url.protocol !== "https:" || !catalogOriginAllowed(config, url.origin)) return;
    const logical = new URL(url.pathname + url.search + url.hash, config.baseUrl).href;
    if (format === "xml") $(node).text(logical);
    else $(node).attr("href", logical);
  });
  return { ...result, html: format === "xml" ? $.xml() : $.html() };
}

export function createCatalogFetcher(fetchDocument = fetchSourceDocument) {
  const activeOrigins = new Map<string, { origin: string; expires: number }>();
  return (config: ImporterConfig): typeof fetchSourceDocument => {
    if (config.provider === "moviesdrive") return fetchMoviesDriveDocument;
    return async (value, baseUrl, validators = {}, options = {}) => {
      if (baseUrl !== config.baseUrl) throw new Error("Catalog origin mismatch");
      const initial = publicLink(value, baseUrl);
      if (!initial || initial.protocol !== "https:" || !catalogOriginAllowed(config, initial.origin)) throw new Error("Untrusted catalog URL");
      const provider = config.provider || "hdhub";
      const key = `${provider}:${config.baseUrl}`;
      const cached = activeOrigins.get(key);
      const active = cached && cached.expires > Date.now() ? cached.origin : null;
      const known = provider in ORIGINS ? ORIGINS[provider as keyof typeof ORIGINS] : [];
      const fallback = (known as readonly string[]).includes(config.baseUrl) || (provider === "hdhub" && /^https:\/\/new\d+\.hdhub4u\.cl$/.test(config.baseUrl)) ? known[0] : undefined;
      const origins = [...new Set([active, config.baseUrl, fallback].filter((origin): origin is string => !!origin))];
      const budget = AbortSignal.timeout(20_000);
      const signal = options.signal ? AbortSignal.any([budget, options.signal]) : budget;
      let failure: unknown = new Error("Catalog unavailable");
      for (const origin of origins) {
        if (signal.aborted) throw signal.reason;
        try {
          const url = new URL(initial.pathname + initial.search, origin);
          const result = await fetchDocument(url.href, origin, origin === initial.origin ? validators : {}, {
            ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
            redirectOriginAllowed: (target) => catalogOriginAllowed(config, target),
          });
          const final = publicLink(result.finalUrl || url.href, url.href);
          if (!final || final.protocol !== "https:" || !catalogOriginAllowed(config, final.origin)) throw new Error("Untrusted catalog response");
          if (result.html === null && final.origin !== initial.origin) throw new Error("New catalog origin returned an invalid 304");
          if (final.pathname === initial.pathname && final.search === initial.search) {
            activeOrigins.delete(key);
            activeOrigins.set(key, { origin: final.origin, expires: Date.now() + 300_000 });
            while (activeOrigins.size > 32) activeOrigins.delete(activeOrigins.keys().next().value!);
          }
          const rebased = rebaseDocument(result, config, url, options.format);
          return final.origin === initial.origin ? rebased : { ...rebased, etag: null, lastModified: null };
        } catch (error) {
          failure = error;
          activeOrigins.delete(key);
        }
      }
      throw failure;
    };
  };
}

export const catalogFetcher = createCatalogFetcher();
