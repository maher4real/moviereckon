import {
  mergeNormalizedItems,
  normalizeTmdbItem,
  type UnifiedContentItem,
} from "@/shared/lib/recommendation";
import type { MovieKeyword } from "@/shared/lib/tmdb";

type KeywordFetchers = {
  fetchMovieKeywords: (id: number) => Promise<MovieKeyword[]>;
  fetchTVKeywords: (id: number) => Promise<MovieKeyword[]>;
  limit: number;
  concurrency?: number;
  deadlineMs?: number;
};

const DEFAULT_KEYWORD_CONCURRENCY = 6;

function getConcurrency(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return DEFAULT_KEYWORD_CONCURRENCY;
  }

  return Math.max(1, Math.floor(value));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
  shouldContinue?: () => boolean,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        if (shouldContinue && !shouldContinue()) return;

        const item = items[nextIndex];
        nextIndex += 1;
        if (item) {
          await task(item);
        }
      }
    }),
  );
}

export async function enrichCandidatesWithKeywords(
  candidates: UnifiedContentItem[],
  fetchers: KeywordFetchers,
): Promise<UnifiedContentItem[]> {
  if (!candidates.length || fetchers.limit <= 0) return candidates;

  const enrichedByKey = new Map<string, UnifiedContentItem>();
  const bounded = candidates.slice(0, fetchers.limit);
  const concurrency = getConcurrency(fetchers.concurrency);
  const deadlineAt =
    typeof fetchers.deadlineMs === "number" && Number.isFinite(fetchers.deadlineMs)
      ? Date.now() + Math.max(0, fetchers.deadlineMs)
      : null;
  const hasTimeRemaining = () => deadlineAt === null || Date.now() < deadlineAt;

  await runWithConcurrency(
    bounded,
    concurrency,
    async (candidate) => {
      if (candidate.keywords.length > 0) return;

      try {
        const keywords =
          candidate.type === "movie"
            ? await fetchers.fetchMovieKeywords(candidate.id)
            : await fetchers.fetchTVKeywords(candidate.id);
        if (!keywords.length) return;

        const raw =
          candidate.raw && typeof candidate.raw === "object" ? candidate.raw : {};
        const normalized = normalizeTmdbItem(
          {
            ...raw,
            id: candidate.id,
            title: candidate.type === "movie" ? candidate.title : undefined,
            name: candidate.type === "tv" ? candidate.title : undefined,
            genre_ids: candidate.genreIds,
            original_language: candidate.originalLanguage,
            release_date:
              candidate.type === "movie" ? candidate.releaseDate : undefined,
            first_air_date:
              candidate.type === "tv" ? candidate.releaseDate : undefined,
            vote_average: candidate.voteAverage,
            vote_count: candidate.voteCount,
            popularity: candidate.popularity,
            keywords,
            _content_type: candidate.type,
          },
          {
            typeHint: candidate.type,
            sourceTag: "metadata:keywords",
            useCache: false,
          },
        );

        if (normalized) {
          enrichedByKey.set(candidate.key, mergeNormalizedItems(candidate, normalized));
        }
      } catch {
        return;
      }
    },
    hasTimeRemaining,
  );

  return candidates.map((candidate) => enrichedByKey.get(candidate.key) || candidate);
}
