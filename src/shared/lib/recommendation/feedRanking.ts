/**
 * Pure ranking and filtering for the personalised feed: taste scoring, the
 * blend with the metadata engine, diversification and the hard filters. No I/O,
 * so it can be tested and reused without the HTTP handler or database.
 */
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import { GENRE_PHRASES } from "../catalogue";
import {
  ERA_LABELS,
  MOOD_LABELS,
  coldStartQuality,
  matchedEra,
  moodGenreSum,
  paceScore,
  preferenceMultiplier,
  relativeAffinity,
  strongestMood,
  tasteConfidence,
} from "./coldStart";
import {
  getLearnedTasteGenreWeight,
  getLearnedTasteLanguageWeight,
  getTasteGenreWeight,
  getTasteLanguageWeight,
  type TasteProfile,
} from "./taste";
import type { FeedExplanation, FeedFilters } from "./feedTypes";
import type { UnifiedContentItem } from "./types";

export function dateValue(item: UnifiedContentItem): number {
  const value = item.releaseDate ? Date.parse(item.releaseDate) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

export const GENRE_LABELS = GENRE_PHRASES;

export function scoreCandidate(
  item: UnifiedContentItem,
  profile: TasteProfile,
  exploration: FeedFilters["exploration"] = "familiar",
): {
  score: number;
  explanation: FeedExplanation;
} {
  const confidence = tasteConfidence(profile);
  const multiplier = preferenceMultiplier(profile);
  const language = getTasteLanguageWeight(profile, item.originalLanguage);
  const negativeGenre = item.genreIds.reduce(
    (total, genreId) => total + (profile.negative.genres[String(genreId)] || 0),
    0,
  );
  const negativeLanguage = item.originalLanguage
    ? profile.negative.languages[item.originalLanguage] || 0
    : 0;
  // Affinity totals grow with activity volume. Saturate each feature before
  // blending so a prolific account cannot drown out metadata similarity or
  // exploration simply by repeating the same kind of event.
  const bounded = (value: number, scale: number): number =>
    value > 0 ? 1 - Math.exp(-value / scale) : 0;
  // With little activity the explicit picks and seeds are all we know, so they
  // count for more; the multiplier fades to 1 as real activity accumulates.
  // Relative to the viewer's strongest genre/language, so a long history
  // separates core tastes from fringe ones instead of saturating them all.
  const boundedGenre = relativeAffinity(profile.inferred.genres, item.genreIds, multiplier, 4);
  const boundedLanguage = item.originalLanguage
    ? relativeAffinity(profile.inferred.languages, [item.originalLanguage.toLowerCase()], multiplier, 3)
    : 0;
  const boundedNegativeGenre = bounded(negativeGenre, 4);
  const boundedNegativeLanguage = bounded(negativeLanguage, 3);
  const dislikedHits = item.genreIds.filter((genreId) =>
    (profile.explicit.dislikedGenres ?? []).includes(genreId),
  ).length;
  const dislikePenalty = dislikedHits > 0 ? 0.3 : 0;
  const quality = coldStartQuality(item, confidence);
  const popularity = Math.max(0, Math.min(1, Math.log1p(item.popularity) / Math.log1p(500)));
  const moodSum = moodGenreSum(profile.tone?.moodGenreBoost, item.genreIds);
  const boundedMood = bounded(moodSum, 1.6);
  const era = matchedEra(item.year, profile.tone?.eras);
  const eraBonus = era ? 0.06 : 0;
  const paceBonus = paceScore(profile.tone?.pace, item.runtime) * 0.04;
  const seedTag = item.sourceTags.find((tag) => tag.startsWith("seed:"));
  const seedSourceBonus = seedTag ? 0.08 * (1 + (1 - confidence)) : 0;
  const profileMatch = boundedGenre * 0.46 + boundedLanguage * 0.24;
  // Adventurous trades some taste match for well-made titles outside the
  // viewer's usual genres; a flat bonus alone would not change the order.
  const explorationBoost = exploration === "adventurous"
    ? quality * 0.16 + popularity * 0.06 + (1 - boundedGenre) * 0.14 + 0.04
    : quality * 0.1 + popularity * 0.04 + 0.04;
  const score = profileMatch + explorationBoost + boundedMood * 0.1 + eraBonus + paceBonus + seedSourceBonus -
    (boundedNegativeGenre * 0.08 + boundedNegativeLanguage * 0.06 + dislikePenalty);
  const reasons: Array<{ label: string; evidence?: string }> = [];
  const seedKey = seedTag?.slice("seed:".length);
  const seedTitle = seedKey
    ? (profile.explicit.seeds ?? []).find(
        (seed) => `${seed.contentType}_${seed.contentId}` === seedKey,
      )?.title
    : undefined;
  if (seedTitle) reasons.push({ label: `Because you picked ${seedTitle}` });
  const strongestGenre = item.genreIds
    .map((genreId) => ({ genreId, weight: getTasteGenreWeight(profile, genreId) }))
    .sort((left, right) => right.weight - left.weight)[0];
  if (strongestGenre && strongestGenre.weight >= 1) {
    const selected = profile.explicit.genres.includes(strongestGenre.genreId);
    const learned = getLearnedTasteGenreWeight(profile, strongestGenre.genreId);
    reasons.push({
      label: selected
        ? `Matches your selected ${GENRE_LABELS[strongestGenre.genreId] || "genre"}`
        : learned > 0
          ? `Matches your ${GENRE_LABELS[strongestGenre.genreId] || "genre"} affinity`
          : `Matches a preferred ${GENRE_LABELS[strongestGenre.genreId] || "genre"}`,
    });
    const evidence = profile.evidence.find((entry) =>
      entry.contentType === item.type && entry.signal !== "watchlist" &&
      entry.key !== item.key && profile.clusters.some((cluster) =>
        cluster.evidence.some((itemEvidence) => itemEvidence.key === entry.key) &&
        cluster.genreIds.includes(strongestGenre.genreId),
      ),
    );
    if (evidence) reasons[0]!.evidence = `from ${evidence.title}`;
  }
  if (language >= 1) {
    reasons.push({
      label: profile.explicit.languages.includes(item.originalLanguage || "")
        ? "Matches your selected language"
        : getLearnedTasteLanguageWeight(profile, item.originalLanguage) > 0
          ? "Matches a language you often enjoy"
          : "Matches a preferred language",
    });
  }
  if (negativeGenre > 0 || negativeLanguage > 0) {
    reasons.push({ label: "Contains a signal you previously rejected" });
  }
  const topMood = strongestMood(profile.tone?.moods, item.genreIds);
  if (topMood) reasons.push({ label: `Matches your ${MOOD_LABELS[topMood]} mood` });
  if (era) reasons.push({ label: `From the ${ERA_LABELS[era]} you like` });
  if (reasons.length === 0) reasons.push({ label: "Exploration pick" });
  return {
    score,
    explanation: {
      reasons: reasons.slice(0, 3),
      score,
      scoreBreakdown: {
        genre: boundedGenre,
        keywords: 0,
        people: 0,
        year: eraBonus,
        runtime: paceBonus,
        quality,
        popularity,
        novelty: 0.1,
        diversityPenalty: 0,
        preference: boundedGenre + boundedLanguage + boundedMood,
        negativePenalty: boundedNegativeGenre + boundedNegativeLanguage,
      },
      seedTitle: null,
    },
  };
}

export interface TasteRankOptions {
  sort?: FeedFilters["sort"];
  direction?: FeedFilters["direction"];
  exploration?: FeedFilters["exploration"];
}

/**
 * Blend the shared metadata/similarity engine with the user's current taste
 * signals. Keeping this as a pure boundary makes it possible to verify that
 * a changed profile changes ordering without duplicating the ranking logic in
 * tests or UI code.
 */
export function rankCandidatesForTaste(
  candidates: UnifiedContentItem[],
  profile: TasteProfile,
  engineRanked: Array<{
    item: UnifiedContentItem;
    score: number;
    reasons: Array<{ label: string; evidence?: string }>;
    seedTitle: string | null;
  }> = [],
  options: TasteRankOptions = {},
): Array<{ item: UnifiedContentItem; score: number; explanation: FeedExplanation }> {
  const engineByKey = new Map(engineRanked.map((entry) => [entry.item.key, entry]));
  const direction = options.direction === "asc" ? -1 : 1;
  const ranked = candidates.map((item) => {
    const dynamic = scoreCandidate(item, profile, options.exploration);
    const engine = engineByKey.get(item.key);
    const engineScore = Number.isFinite(engine?.score) ? Number(engine?.score) : 0;
    const score = engine
      ? engineScore * 0.72 + dynamic.score * 0.28
      : dynamic.score;
    const reasons = [...dynamic.explanation.reasons];
    for (const reason of engine?.reasons || []) {
      if (!reasons.some((existing) => existing.label === reason.label)) reasons.push(reason);
    }
    return {
      item,
      score,
      explanation: {
        ...dynamic.explanation,
        reasons: reasons.slice(0, 3),
        score,
        seedTitle: engine?.seedTitle || dynamic.explanation.seedTitle,
      },
    };
  });
  const sorted = ranked.sort((left, right) => {
    if (options.sort === "popularity") {
      const difference = right.item.popularity - left.item.popularity;
      if (difference !== 0) return direction * difference;
    } else if (options.sort === "rating") {
      const difference = right.item.voteAverage - left.item.voteAverage;
      if (difference !== 0) return direction * difference;
    } else if (options.sort === "release_date") {
      const difference = dateValue(right.item) - dateValue(left.item);
      if (difference !== 0) return direction * difference;
    }
    const scoreDifference = right.score - left.score;
    if (scoreDifference !== 0) return direction * scoreDifference;
    const popularityDifference = right.item.popularity - left.item.popularity;
    if (popularityDifference !== 0) return direction * popularityDifference;
    return direction * left.item.key.localeCompare(right.item.key);
  });
  // Explicit sorts are a promise to the viewer; only relevance is diversified.
  if ((options.sort ?? "relevance") !== "relevance" || options.direction === "asc") return sorted;
  return diversifyRanked(sorted);
}

export const DIVERSIFY_WINDOW = 60;
export const DIVERSIFY_LAMBDA = 0.82;

export function genreJaccard(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const set = new Set(left);
  const shared = right.filter((genreId) => set.has(genreId)).length;
  return shared / (left.length + right.length - shared);
}

export function itemSimilarity(left: UnifiedContentItem, right: UnifiedContentItem): number {
  const sameCollection = left.collectionId !== null && left.collectionId === right.collectionId ? 1 : 0;
  const samePrimary = left.primaryGenreId !== null && left.primaryGenreId === right.primaryGenreId ? 1 : 0;
  return Math.min(1, sameCollection * 0.7 + samePrimary * 0.15 + genreJaccard(left.genreIds, right.genreIds) * 0.15);
}

/**
 * Maximal-marginal-relevance pass over the head of the feed. The upstream
 * engine diversifies too, but the taste blend re-sorts afterwards, so without
 * this the final page could fill with one franchise or one sub-genre.
 */
export function diversifyRanked<T extends { item: UnifiedContentItem; score: number }>(sorted: T[]): T[] {
  if (sorted.length <= 2) return sorted;
  const pool = sorted.slice(0, DIVERSIFY_WINDOW).map((entry) => ({ entry, maxSimilarity: 0 }));
  const selected: T[] = [];
  while (pool.length > 0) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    pool.forEach((candidate, index) => {
      const value = DIVERSIFY_LAMBDA * candidate.entry.score - (1 - DIVERSIFY_LAMBDA) * candidate.maxSimilarity;
      if (value > bestValue) { bestValue = value; bestIndex = index; }
    });
    const [chosen] = pool.splice(bestIndex, 1);
    selected.push(chosen.entry);
    for (const candidate of pool) {
      const similarity = itemSimilarity(candidate.entry.item, chosen.entry.item);
      if (similarity > candidate.maxSimilarity) candidate.maxSimilarity = similarity;
    }
  }
  return [...selected, ...sorted.slice(DIVERSIFY_WINDOW)];
}

export function toDisplayItem(item: UnifiedContentItem): Movie | TVShow {
  const raw = item.raw;
  if (raw && typeof raw === "object") return raw as Movie | TVShow;
  if (item.type === "movie") {
    return {
      id: item.id,
      title: item.title,
      original_title: item.originalTitle || item.title,
      overview: item.overview,
      poster_path: null,
      backdrop_path: null,
      release_date: item.releaseDate || "",
      vote_average: item.voteAverage,
      vote_count: item.voteCount,
      popularity: item.popularity,
      genre_ids: item.genreIds,
      original_language: item.originalLanguage || "en",
      adult: false,
      video: false,
    };
  }
  return {
    id: item.id,
    name: item.title,
    original_name: item.originalTitle || item.title,
    overview: item.overview,
    poster_path: null,
    backdrop_path: null,
    first_air_date: item.releaseDate || "",
    vote_average: item.voteAverage,
    vote_count: item.voteCount,
    popularity: item.popularity,
    genre_ids: item.genreIds,
    original_language: item.originalLanguage || "en",
    origin_country: [],
  };
}

export const QUALITY_FLOOR_MIN_VOTES = 10;
export const QUALITY_FLOOR_FRESH_DAYS = 120;

/**
 * Drop catalogue noise: titles that have been out for months yet collected
 * almost no votes. Fresh and upcoming releases pass, since they have not had
 * time to gather votes.
 */
export function passesQualityFloor(item: UnifiedContentItem, now = Date.now()): boolean {
  if (item.voteCount >= QUALITY_FLOOR_MIN_VOTES) return true;
  const released = item.releaseDate ? Date.parse(item.releaseDate) : Number.NaN;
  if (!Number.isFinite(released)) return false;
  return now - released <= QUALITY_FLOOR_FRESH_DAYS * 86_400_000;
}

export function hardFilter(item: UnifiedContentItem, filters: FeedFilters, profile?: TasteProfile): boolean {
  if (filters.contentType !== "all" && item.type !== filters.contentType) return false;
  if (filters.genreId && !item.genreIds.includes(filters.genreId)) return false;
  // Explicit dislikes hide an item only when its primary genre is disliked and
  // the person has not asked for that genre. Liked wins over disliked.
  const disliked = (profile?.explicit.dislikedGenres ?? []).filter(
    (genreId) => !(profile?.explicit.genres ?? []).includes(genreId),
  );
  if (
    item.primaryGenreId !== null &&
    disliked.includes(item.primaryGenreId) &&
    filters.genreId !== item.primaryGenreId
  ) {
    return false;
  }
  if (filters.language && item.originalLanguage !== filters.language) return false;
  const releaseTimestamp = item.releaseDate ? Date.parse(item.releaseDate) : Number.NaN;
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  switch (filters.recommendationType) {
    case "trending":
      if (item.popularity <= 50) return false;
      break;
    case "highrated":
      if (item.voteAverage < 8) return false;
      break;
    case "popular":
      if (item.popularity < 100) return false;
      break;
    case "newreleases":
      if (!Number.isFinite(releaseTimestamp) || releaseTimestamp <= recentCutoff || releaseTimestamp > Date.now()) return false;
      break;
  }
  return true;
}

