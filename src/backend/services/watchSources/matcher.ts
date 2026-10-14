import "server-only";
import type { ParsedSourcePage, SourceContentMatch } from "@/shared/types/watchSources";
import { normalizeSourceTitle } from "./parser";

export interface MatchResult {
  status: "matched" | "pending" | "review";
  match: SourceContentMatch | null;
  reason: string | null;
}

interface Candidate {
  id: number;
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
}

type TMDBRequest = <T>(path: string, params?: Record<string, string>) => Promise<T>;

async function requestTMDB<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not configured");
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`TMDB lookup HTTP ${response.status}`); }
  return response.json() as Promise<T>;
}

/** Cache promises per run to collapse duplicate ID/title lookups across releases. */
export function createContentMatcher(request: TMDBRequest = requestTMDB) {
  const cache = new Map<string, Promise<MatchResult>>();
  async function resolve(page: ParsedSourcePage): Promise<MatchResult> {
    if (page.imdbId) {
      const result = await request<{ movie_results: Candidate[]; tv_results: Candidate[] }>(
        `/find/${page.imdbId}`, { external_source: "imdb_id" },
      );
      const candidates = page.mediaType === "movie" ? result.movie_results : result.tv_results;
      if (candidates?.length === 1 && Number.isSafeInteger(candidates[0].id) && candidates[0].id > 0) {
        return { status: "matched", match: { tmdbId: candidates[0].id, mediaType: page.mediaType, method: "imdb" }, reason: null };
      }
      // An external ID is authoritative: never override it with a fuzzy title match.
      return { status: candidates?.length > 1 ? "review" : "pending", match: null, reason: "IMDb ID has no unique TMDB match of the expected type" };
    }
    if (page.year === null) return { status: "review", match: null, reason: "An IMDb ID or release year is required for automatic matching" };
    const result = await request<{ results: Candidate[]; total_pages: number }>(`/search/${page.mediaType}`, {
      query: page.title,
      ...(page.mediaType === "movie" ? { primary_release_year: String(page.year) } : { first_air_date_year: String(page.year) }),
    });
    const candidates = (result.results || []).filter((candidate) => {
      const names = [candidate.title, candidate.original_title, candidate.name, candidate.original_name];
      const date = page.mediaType === "movie" ? candidate.release_date : candidate.first_air_date;
      return Number.isSafeInteger(candidate.id) && candidate.id > 0 && date?.slice(0, 4) === String(page.year) &&
        names.some((name) => name && normalizeSourceTitle(name) === normalizeSourceTitle(page.title));
    });
    if (candidates.length === 1 && result.total_pages === 1) {
      return { status: "matched", match: { tmdbId: candidates[0].id, mediaType: page.mediaType, method: "title-year" }, reason: null };
    }
    return { status: candidates.length || result.total_pages > 1 ? "review" : "pending", match: null, reason: "Title and year have no unique exact TMDB match" };
  }
  return (page: ParsedSourcePage) => {
    const key = `${page.mediaType}:${page.imdbId || `${normalizeSourceTitle(page.title)}:${page.year}`}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = resolve(page).catch((error) => { cache.delete(key); throw error; });
      cache.set(key, pending);
    }
    return pending;
  };
}
