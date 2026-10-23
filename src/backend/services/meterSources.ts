/**
 * Hybrid Reckon Meter inputs: TMDB (audience average, every reviewer rating)
 * plus Wikidata (Rotten Tomatoes, Metacritic, IMDb). TMDB also supplies the
 * IMDb ID that lets Wikidata match far more titles. Each source fails on its
 * own, so the meter degrades instead of disappearing.
 */
import {
  getServerMovieDetails,
  getServerReviews,
  getServerTVExternalIds,
  getServerTVShowDetails,
} from "@/backend/services/tmdbServer";
import { fetchWikidataRatings, type ExternalRatingsResult } from "@/backend/services/wikidataRatings";

export interface TmdbMeterData {
  average: number | null;
  votes: number;
  /** Ratings from TMDB reviewers who gave a score (0-10). */
  reviewerRatings: number[];
  reviewsScanned: number;
}

export interface MeterSourcesPayload {
  imdbId: string | null;
  tmdb: TmdbMeterData | null;
  wikidata: ExternalRatingsResult | null;
}

const TMDB_TIMEOUT_MS = 5_000;
export const MAX_REVIEW_PAGES = 5;

async function settle<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

async function loadReviewerRatings(contentType: "movie" | "tv", contentId: number) {
  const first = await getServerReviews(contentType, contentId, 1, TMDB_TIMEOUT_MS);
  const pages = Math.min(MAX_REVIEW_PAGES, Math.max(1, first.total_pages || 1));
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      settle(() => getServerReviews(contentType, contentId, index + 2, TMDB_TIMEOUT_MS))),
  );
  const reviews = [first, ...rest].flatMap((page) => page?.results || []);
  const seen = new Set<string>();
  const ratings: number[] = [];
  for (const review of reviews) {
    if (seen.has(review.id)) continue;
    seen.add(review.id);
    const rating = review.author_details?.rating;
    if (typeof rating === "number" && Number.isFinite(rating) && rating >= 0 && rating <= 10) ratings.push(rating);
  }
  return { ratings, scanned: seen.size };
}

export async function loadMeterSources(contentType: "movie" | "tv", contentId: number): Promise<MeterSourcesPayload> {
  const [details, externalIds] = await Promise.all([
    settle<{ vote_average?: number; vote_count?: number; imdb_id?: string | null }>(() => contentType === "movie"
      ? getServerMovieDetails(contentId, TMDB_TIMEOUT_MS)
      : getServerTVShowDetails(contentId, TMDB_TIMEOUT_MS)),
    contentType === "tv" ? settle(() => getServerTVExternalIds(contentId, TMDB_TIMEOUT_MS)) : Promise.resolve(null),
  ]);
  const rawImdbId = contentType === "movie"
    ? details?.imdb_id
    : externalIds?.imdb_id;
  const imdbId = typeof rawImdbId === "string" && /^tt\d{5,10}$/.test(rawImdbId) ? rawImdbId : null;

  const [reviews, wikidata] = await Promise.all([
    settle(() => loadReviewerRatings(contentType, contentId)),
    settle(() => fetchWikidataRatings(contentType, contentId, { imdbId })),
  ]);

  const average = Number(details?.vote_average);
  const votes = Math.max(0, Math.floor(Number(details?.vote_count) || 0));
  const tmdb: TmdbMeterData | null = details || reviews
    ? {
        average: Number.isFinite(average) && average > 0 ? average : null,
        votes,
        reviewerRatings: reviews?.ratings || [],
        reviewsScanned: reviews?.scanned || 0,
      }
    : null;

  return { imdbId, tmdb, wikidata };
}
