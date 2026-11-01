import "server-only";
import { fetchSourceDocument } from "./http";
import { publicLink } from "./parser";

type DomainKind = "catalog" | "archive";
const DEFAULTS = { catalog: "https://new1.moviesdrive.cyou", archive: "https://mdrive.lol" };

function originSetting(value: string, name: string): string {
  const url = publicLink(value, value);
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.port) {
    throw new Error(`${name} must contain public HTTPS origins only`);
  }
  return url.origin;
}

/** New numbered subdomains of the known provider are trusted; new registrable domains are explicit. */
export function moviesDriveDomainPolicy(kind: DomainKind, baseUrl?: string) {
  const prefix = kind === "catalog" ? "MOVIESDRIVE" : "MOVIESDRIVE_ARCHIVE";
  const primary = originSetting(baseUrl || process.env[`${prefix}_BASE_URL`] || DEFAULTS[kind], `${prefix}_BASE_URL`);
  const aliases = (process.env[`${prefix}_FALLBACK_ORIGINS`] || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (aliases.length > 3) throw new Error(`${prefix}_FALLBACK_ORIGINS supports at most three origins`);
  const origins = [...new Set([primary, ...aliases.map((value) => originSetting(value, `${prefix}_FALLBACK_ORIGINS`))])];
  const family = kind === "catalog" ? /^https:\/\/(?:new\d+\.)?moviesdrive\.cyou$/ : /^https:\/\/(?:new\d+\.)?mdrive\.lol$/;
  const allows = (origin: string) => origins.includes(origin) || origin === DEFAULTS[kind] || family.test(origin);
  return { primary, origins, allows };
}

/** Canonical archive URLs preserve link IDs and client recognition across configured domain changes. */
export function canonicalMoviesDriveArchive(value: string): string | null {
  if (!value.startsWith("https://")) return null;
  const url = publicLink(value, DEFAULTS.archive);
  if (!url || !moviesDriveDomainPolicy("archive").allows(url.origin) || url.search || url.hash ||
      !/^\/archive\/\d+\/?$/.test(url.pathname)) return null;
  return `${DEFAULTS.archive}${url.pathname}`;
}

export function createMoviesDriveFetcher(kind: DomainKind, fetchDocument = fetchSourceDocument): typeof fetchSourceDocument {
  const activeOrigins = new Map<string, { origin: string; expires: number }>();
  return async (value, baseUrl, validators = {}, options = {}) => {
    const policy = moviesDriveDomainPolicy(kind, kind === "catalog" ? baseUrl : undefined);
    const initial = publicLink(value, baseUrl);
    if (!initial || !policy.allows(initial.origin)) throw new Error("MoviesDrive URL outside trusted origins");
    const key = JSON.stringify([kind, policy.origins]);
    const cached = activeOrigins.get(key);
    const active = cached && cached.expires > Date.now() && policy.allows(cached.origin) ? cached.origin : null;
    const candidates = [...new Set([...(active ? [active] : []), ...policy.origins])];
    const budget = AbortSignal.timeout(20_000);
    const signal = options.signal ? AbortSignal.any([budget, options.signal]) : budget;
    let failure: unknown = new Error("MoviesDrive domains unavailable");
    for (const origin of candidates) {
      if (signal.aborted) throw signal.reason;
      try {
        const url = new URL(initial.pathname + initial.search, origin);
        const result = await fetchDocument(url.href, origin, origin === initial.origin ? validators : {}, {
          ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]), redirectOriginAllowed: policy.allows,
        });
        const final = new URL(result.finalUrl || url.href);
        if (!policy.allows(final.origin)) throw new Error("MoviesDrive response outside trusted origins");
        if (result.html === null && final.origin !== initial.origin) throw new Error("New MoviesDrive origin returned an invalid 304");
        // Do not cache a redirect to a homepage, search form or other unrelated path as a domain move.
        if (final.pathname === initial.pathname && final.search === initial.search) {
          activeOrigins.delete(key);
          activeOrigins.set(key, { origin: final.origin, expires: Date.now() + 300_000 });
          while (activeOrigins.size > 32) activeOrigins.delete(activeOrigins.keys().next().value!);
        }
        // The durable snapshot is keyed to the logical origin, so mirror validators must not be saved under it.
        return final.origin === initial.origin ? result : { ...result, etag: null, lastModified: null };
      } catch (error) {
        failure = error;
        if (activeOrigins.get(key)?.origin === origin) activeOrigins.delete(key);
      }
    }
    throw failure;
  };
}

export const fetchMoviesDriveDocument = createMoviesDriveFetcher("catalog");
export const fetchMoviesDriveArchive = createMoviesDriveFetcher("archive");
