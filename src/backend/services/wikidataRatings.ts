/**
 * External review scores from Wikidata (CC0, no key). Films and series link to
 * TMDB through P4947 (movie) / P4983 (TV); review scores live in P444 with the
 * reviewer in qualifier P447, the method in P459, the sample size in P7887 and
 * the date in P585. Coverage is patchy and some scores lag the live sites, so
 * every score carries its "as of" date. Series often only have scores on their
 * season items (P179 "part of the series"), which are averaged as a fallback.
 */

import type { ExternalScore, ExternalScoreId } from "@/shared/lib/reckonMeter";

type ExternalRatingId = ExternalScoreId;
type ExternalRating = ExternalScore & { count: number | null; asOf: string | null };

export interface ExternalRatingsResult {
  wikidataId: string | null;
  ratings: ExternalRating[];
}

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "MovieReckon/1.0 (https://github.com/maher4real/moviereckon; review-meter)";
const TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2_000;
const cache = new Map<string, { value: ExternalRatingsResult; at: number }>();

// Wikidata items for the reviewers (labels are matched too, in case an entry
// uses a different item for the same publisher).
const ROTTEN_TOMATOES = "Q105584";
const METACRITIC = "Q150248";
const IMDB = "Q37312";

export function clearWikidataCache(): void {
  cache.clear();
}

const TV_SEASON = "Q3464665";

const IMDB_ID = /^tt\d{5,10}$/;

/**
 * Matches the title by TMDB ID or, when TMDB supplies one, IMDb ID (P345), so
 * an item missing its TMDB link is still found.
 */
export function buildRatingsQuery(contentType: "movie" | "tv", contentId: number, imdbId?: string | null): string {
  const property = contentType === "movie" ? "P4947" : "P4983";
  const match = imdbId && IMDB_ID.test(imdbId)
    ? `{ ?item wdt:${property} "${contentId}" . } UNION { ?item wdt:P345 "${imdbId}" . }`
    : `?item wdt:${property} "${contentId}" .`;
  const statement = contentType === "movie"
    ? "?item p:P444 ?statement ."
    : `{ ?item p:P444 ?statement . } UNION { ?season wdt:P179 ?item . ?season wdt:P31 wd:${TV_SEASON} . ?season p:P444 ?statement . }`;
  return `SELECT DISTINCT ?item ?season ?score ?by ?byLabel ?methodLabel ?count ?date WHERE {
  ${match}
  ${statement}
  ?statement ps:P444 ?score .
  OPTIONAL { ?statement pq:P447 ?by . OPTIONAL { ?by rdfs:label ?byLabel . FILTER(LANG(?byLabel) = "en") } }
  OPTIONAL { ?statement pq:P459 ?method . OPTIONAL { ?method rdfs:label ?methodLabel . FILTER(LANG(?methodLabel) = "en") } }
  OPTIONAL { ?statement pq:P7887 ?count . }
  OPTIONAL { ?statement pq:P585 ?date . }
}
LIMIT 200`;
}

interface SparqlBinding {
  [key: string]: { value: string } | undefined;
}

function entityId(uri: string | undefined): string {
  return uri?.split("/").pop() || "";
}

/**
 * "87%" → share 87, "74/100" → average 7.4, "8.1/10" → average 8.1. A bare
 * number (as some Metascores are stored) is read on `bareScale` when given.
 */
export function parseScore(raw: string, bareScale?: number): { kind: "share" | "average"; value: number } | null {
  const text = raw.trim();
  if (bareScale && /^\d{1,3}(?:\.\d+)?$/.test(text)) {
    const value = Number(text);
    return value >= 0 && value <= bareScale ? { kind: "average", value: Math.round((value / bareScale) * 100) / 10 } : null;
  }
  const percent = /^(\d{1,3}(?:\.\d+)?)\s*%$/.exec(text);
  if (percent) {
    const value = Number(percent[1]);
    return value >= 0 && value <= 100 ? { kind: "share", value } : null;
  }
  const fraction = /^(\d{1,3}(?:\.\d+)?)\s*\/\s*(\d{1,3})$/.exec(text);
  if (fraction) {
    const value = Number(fraction[1]);
    const scale = Number(fraction[2]);
    if (!scale || value < 0 || value > scale) return null;
    return { kind: "average", value: Math.round((value / scale) * 100) / 10 };
  }
  return null;
}

function classify(binding: SparqlBinding, parsed: { kind: "share" | "average" }): ExternalRatingId | null {
  const by = entityId(binding.by?.value);
  const byLabel = (binding.byLabel?.value || "").toLowerCase();
  const method = (binding.methodLabel?.value || "").toLowerCase();
  if (by === ROTTEN_TOMATOES || byLabel.includes("rotten tomatoes")) {
    if (method.includes("audience") || method.includes("popcorn")) return parsed.kind === "share" ? "rt_audience" : null;
    // Tomatometer is the percent of positive critic reviews; RT's average
    // critic rating (x/10) is a different number and is skipped.
    return parsed.kind === "share" ? "rt_critics" : null;
  }
  if (by === METACRITIC || byLabel.includes("metacritic")) {
    // Metacritic user scores (x/10) are excluded; only the critic Metascore counts.
    return parsed.kind === "average" && !method.includes("user") ? "metacritic" : null;
  }
  if (by === IMDB || byLabel === "imdb") return parsed.kind === "average" ? "imdb" : null;
  return null;
}

function isMetacritic(binding: SparqlBinding): boolean {
  return entityId(binding.by?.value) === METACRITIC || (binding.byLabel?.value || "").toLowerCase().includes("metacritic");
}

/**
 * Keep the most recent score for each source. Scores on the title itself win;
 * otherwise a source's season scores are averaged (TV).
 */
export function parseRatingsResponse(bindings: SparqlBinding[]): ExternalRatingsResult {
  const latest = new Map<string, ExternalRating>();
  let wikidataId: string | null = null;
  for (const binding of bindings) {
    wikidataId ||= entityId(binding.item?.value) || null;
    const parsed = binding.score?.value ? parseScore(binding.score.value, isMetacritic(binding) ? 100 : undefined) : null;
    if (!parsed) continue;
    const id = classify(binding, parsed);
    if (!id) continue;
    const countValue = Number(binding.count?.value);
    const rating: ExternalRating = {
      id,
      kind: parsed.kind,
      value: parsed.value,
      count: Number.isFinite(countValue) && countValue > 0 ? Math.round(countValue) : null,
      asOf: binding.date?.value ? binding.date.value.slice(0, 10) : null,
    };
    const slot = `${id}|${entityId(binding.season?.value) || "title"}`;
    const current = latest.get(slot);
    if (!current || (rating.asOf || "") > (current.asOf || "")) latest.set(slot, rating);
  }

  const ratings: ExternalRating[] = [];
  const ids = new Set([...latest.keys()].map((slot) => slot.split("|")[0] as ExternalRatingId));
  for (const id of ids) {
    const own = latest.get(`${id}|title`);
    if (own) {
      ratings.push(own);
      continue;
    }
    const seasons = [...latest.entries()].filter(([slot]) => slot.startsWith(`${id}|`)).map(([, rating]) => rating);
    const counts = seasons.map((rating) => rating.count).filter((count): count is number => count !== null);
    const dates = seasons.map((rating) => rating.asOf).filter((date): date is string => Boolean(date)).sort();
    ratings.push({
      id,
      kind: seasons[0]!.kind,
      value: Math.round((seasons.reduce((total, rating) => total + rating.value, 0) / seasons.length) * 10) / 10,
      count: counts.length === seasons.length ? counts.reduce((total, count) => total + count, 0) : null,
      asOf: dates.at(-1) ?? null,
    });
  }
  return { wikidataId, ratings };
}

export async function fetchWikidataRatings(
  contentType: "movie" | "tv",
  contentId: number,
  { imdbId = null, fetchImpl = fetch }: { imdbId?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<ExternalRatingsResult> {
  const key = `${contentType}_${contentId}_${imdbId || ""}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set("query", buildRatingsQuery(contentType, contentId, imdbId));
  url.searchParams.set("format", "json");
  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`wikidata_${response.status}`);
  const body = await response.json() as { results?: { bindings?: SparqlBinding[] } };
  const value = parseRatingsResponse(body.results?.bindings || []);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, at: Date.now() });
  return value;
}
