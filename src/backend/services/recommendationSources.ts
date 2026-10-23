/** TMDB candidate retrieval for the recommendation feed. */
import {
  discoverServerMovies,
  discoverServerTVShows,
  getServerMovieRecommendations,
  getServerSimilarMovies,
  getServerSimilarTVShows,
  getServerTVShowRecommendations,
} from "@/backend/services/tmdbServer";
import type { TasteProfile } from "@/shared/lib/recommendation/taste";
import { discoverExclusions, pickSeedsForPage } from "@/shared/lib/recommendation/coldStart";
import type { ContentType, FeedFilters } from "@/shared/lib/recommendation/feedTypes";
import type {
  SourceResult,
  SourceStream,
  TasteInterestState,
} from "./recommendationFeedTypes";

export function buildTasteInterests(profile: TasteProfile, type: ContentType): TasteInterestState[] {
  const interests: TasteInterestState[] = [];
  const seen = new Set<string>();
  const add = (genreId?: number, language?: string) => {
    const normalizedLanguage = language?.trim().toLowerCase();
    const key = `${genreId || "any"}|${normalizedLanguage || "any"}`;
    if (seen.has(key)) return;
    seen.add(key);
    interests.push({
      key,
      ...(genreId ? { genreId } : {}),
      ...(normalizedLanguage ? { language: normalizedLanguage } : {}),
      page: 1,
      totalPages: null,
    });
  };

  // Learned clusters carry the language observed with that genre. Keep that
  // association intact instead of combining unrelated top genre/language
  // values (for example Hindi comedy with English horror).
  for (const cluster of [...profile.clusters].sort((left, right) => right.weight - left.weight)) {
    if (cluster.contentType !== type && cluster.contentType !== "mixed") continue;
    const genreId = cluster.genreIds[0];
    const languages = [...new Set(cluster.evidence.map((entry) => entry.language).filter(Boolean))] as string[];
    if (genreId && languages.length > 0) {
      languages.slice(0, 3).forEach((value) => add(genreId, value));
    } else if (genreId) {
      add(genreId);
    }
    if (interests.length >= 16) break;
  }

  // Explicit choices are soft retrieval signals when no learned cluster has
  // paired them with activity. They remain separate one-dimensional queries.
  for (const genreId of profile.explicit.genres) {
    if (interests.length >= 16) break;
    add(genreId);
  }
  for (const language of profile.explicit.languages) {
    if (interests.length >= 16) break;
    add(undefined, language);
  }
  const learnedLanguages = Object.entries(profile.learned?.languages || profile.inferred.languages || {})
    .sort(([, left], [, right]) => right - left)
    .map(([value]) => value);
  for (const language of learnedLanguages) {
    if (interests.length >= 16) break;
    add(undefined, language);
  }
  return interests;
}

// Industries every explore stream samples so the feed mixes Hollywood and
// Bollywood (plus the viewer's own languages) instead of whatever single
// language dominates TMDB's global popularity list.
export const EXPLORE_BASE_LANGUAGES = ["en", "hi"] as const;
const MAX_EXPLORE_INTERESTS = 4;

export function buildExploreInterests(profile: TasteProfile, filters: FeedFilters): TasteInterestState[] {
  // A language filter already pins every query to one language.
  if (filters.language) return [];
  const learnedLanguages = Object.entries(profile.learned?.languages || profile.inferred.languages || {})
    .sort(([, left], [, right]) => right - left)
    .map(([value]) => value);
  const languages = [...EXPLORE_BASE_LANGUAGES, ...profile.explicit.languages, ...learnedLanguages]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
  return [...new Set(languages)].slice(0, MAX_EXPLORE_INTERESTS).map((language) => ({
    key: `any|${language}`,
    language,
    page: 1,
    totalPages: null,
  }));
}

function todayIso(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export async function fetchSource(
  type: ContentType,
  page: number,
  filters: FeedFilters,
  profile: TasteProfile,
  profileSource: boolean,
  stream: SourceStream,
  interest?: TasteInterestState,
): Promise<SourceResult> {
  try {
    const params = {
      page: interest?.page || page,
      with_genres: filters.genreId
        ? String(filters.genreId)
        : profileSource && interest?.genreId
          ? String(interest.genreId)
          : undefined,
      with_original_language: filters.language
        ? filters.language
        : interest?.language
          ? interest.language
          : undefined,
      // Only titles that are already out. For movies the release-type filter
      // requires an actual theatrical/digital/physical/TV release on or before
      // today, which excludes festival-only premieres and delayed titles.
      ...(type === "movie"
        ? {
            "primary_release_date.lte": todayIso(),
            "release_date.lte": todayIso(),
            with_release_type: "2|3|4|5|6",
          }
        : { "first_air_date.lte": todayIso(), include_null_first_air_dates: false }),
      sort_by:
        filters.sort === "rating"
          ? `vote_average.${filters.direction}`
          : filters.sort === "release_date"
            ? type === "movie" ? `primary_release_date.${filters.direction}` : `first_air_date.${filters.direction}`
            : `popularity.${filters.direction}`,
      "vote_count.gte": filters.sort === "rating" ? 40 : undefined,
      without_genres: discoverExclusions(profile, filters.genreId),
    };
    const response = type === "movie"
      ? await discoverServerMovies(params)
      : await discoverServerTVShows(params);
    return {
      stream,
      type,
      profileSource,
      ...(interest ? { interestKey: interest.key } : {}),
      page,
      // A TMDB page count belongs to one exact genre/language query. When we
      // cycle through several interests, keep the count unknown so one query
      // cannot prematurely exhaust another.
      totalPages: Number.isFinite(response.total_pages) ? response.total_pages : null,
      results: Array.isArray(response.results) ? response.results : [],
      failed: false,
    };
  } catch {
    return { stream, type, profileSource, page, totalPages: null, results: [], failed: true };
  }
}

export async function fetchSeedCandidates(
  profile: TasteProfile,
  page: number,
  filters: FeedFilters,
): Promise<Array<{ type: ContentType; seedKey: string; results: unknown[] }>> {
  const seeds = pickSeedsForPage(profile.explicit.seeds, page).filter(
    (seed) => filters.contentType === "all" || filters.contentType === seed.contentType,
  );
  const settle = async (load: () => Promise<{ results?: unknown[] }>): Promise<unknown[]> => {
    try {
      const response = await load();
      return Array.isArray(response?.results) ? response.results.slice(0, 20) : [];
    } catch {
      return [];
    }
  };
  return Promise.all(
    seeds.map(async (seed) => {
      const [recommended, similar] = await Promise.all(
        seed.contentType === "movie"
          ? [settle(() => getServerMovieRecommendations(seed.contentId)), settle(() => getServerSimilarMovies(seed.contentId))]
          : [settle(() => getServerTVShowRecommendations(seed.contentId)), settle(() => getServerSimilarTVShows(seed.contentId))],
      );
      return {
        type: seed.contentType,
        seedKey: `${seed.contentType}_${seed.contentId}`,
        results: [...recommended, ...similar],
      };
    }),
  );
}

