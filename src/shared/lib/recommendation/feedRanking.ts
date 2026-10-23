/**
 * Pure ranking and filtering for the personalised feed: taste scoring, the
 * blend with the metadata engine, diversification and the hard filters. No I/O,
 * so it can be tested and reused without the HTTP handler or database.
 */
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import { GENRE_PHRASES, LANGUAGE_LABELS } from "../catalogue";
import {
  ERA_LABELS,
  MOOD_LABELS,
  coldStartQuality,
  matchedEra,
  moodGenreSum,
  paceScore,
  preferenceMultiplier,
  relativeAffinity,
  smoothedRating,
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

export const FRESH_WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;

/** 1 on release day, fading linearly to 0 after FRESH_WINDOW_DAYS; 0 if not out. */
export function freshness(item: UnifiedContentItem, now = Date.now()): number {
  const released = item.releaseDate ? Date.parse(item.releaseDate) : Number.NaN;
  if (!Number.isFinite(released) || released > now) return 0;
  return Math.max(0, 1 - (now - released) / (FRESH_WINDOW_DAYS * DAY_MS));
}

function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

function languageName(code: string): string {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

/** The language the viewer watches most, or their first explicit pick. */
function dominantLanguage(profile: TasteProfile): string | null {
  const learned = Object.entries(profile.inferred.languages || {}).sort(([, left], [, right]) => right - left)[0];
  return (learned?.[0] || profile.explicit.languages[0] || null)?.toLowerCase() ?? null;
}

export function scoreCandidate(
  item: UnifiedContentItem,
  profile: TasteProfile,
  exploration: FeedFilters["exploration"] = "familiar",
  now = Date.now(),
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
  // Recent releases get a small lift, but only when they are not poorly
  // received; hype alone must not push a weak new title up the feed.
  const rating = smoothedRating(item.voteAverage, item.voteCount);
  const fresh = freshness(item, now);
  const freshnessBonus = rating >= 6.5 ? fresh * 0.06 : 0;
  const score = profileMatch + explorationBoost + boundedMood * 0.1 + eraBonus + paceBonus + seedSourceBonus + freshnessBonus -
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
    const phrase = GENRE_LABELS[strongestGenre.genreId] || "this genre";
    // Naming the title that taught us the taste is the most convincing reason.
    const evidence = profile.evidence.find((entry) =>
      entry.contentType === item.type && entry.signal !== "watchlist" &&
      entry.key !== item.key && Boolean(entry.title) && profile.clusters.some((cluster) =>
        cluster.evidence.some((itemEvidence) => itemEvidence.key === entry.key) &&
        cluster.genreIds.includes(strongestGenre.genreId),
      ),
    );
    reasons.push({
      label: evidence && !seedTitle
        ? `Because you enjoyed ${evidence.title}`
        : selected
          ? `Because you love ${phrase}`
          : learned > 0
            ? `You often watch ${phrase}`
            : `Fits your taste for ${phrase}`,
    });
  }
  // Quality and freshness say something concrete about the title itself.
  if (rating >= 7.6 && item.voteCount >= 500) {
    reasons.push({ label: `Rated ${item.voteAverage.toFixed(1)} by ${compactCount(item.voteCount)} viewers` });
  } else if (fresh >= 1 - 60 / FRESH_WINDOW_DAYS && rating >= 6.5) {
    reasons.push({ label: item.type === "tv" ? "New series" : "New release" });
  }
  // A language reason only adds information when it is not the viewer's
  // everyday language; otherwise every card would repeat the same line.
  const itemLanguage = item.originalLanguage?.toLowerCase() || "";
  if (language >= 1 && itemLanguage && itemLanguage !== dominantLanguage(profile)) {
    reasons.push({
      label: profile.explicit.languages.includes(itemLanguage)
        ? `In ${languageName(itemLanguage)}, one of your languages`
        : getLearnedTasteLanguageWeight(profile, item.originalLanguage) > 0
          ? `In ${languageName(itemLanguage)}, a language you watch`
          : `In ${languageName(itemLanguage)}, a preferred language`,
    });
  }
  if (negativeGenre > 0 || negativeLanguage > 0) {
    reasons.push({ label: "Contains a signal you previously rejected" });
  }
  const topMood = strongestMood(profile.tone?.moods, item.genreIds);
  if (topMood) reasons.push({ label: `Matches your ${MOOD_LABELS[topMood]} mood` });
  if (era) reasons.push({ label: `From the ${ERA_LABELS[era]} you like` });
  const exploreLane = item.sourceTags
    .map((tag) => /^discover:(?:movie|tv)Explore:any\|([a-z]{2,3}):/.exec(tag)?.[1])
    .find(Boolean);
  if (reasons.length === 0 && exploreLane) {
    reasons.push({ label: `Popular in ${languageName(exploreLane)} ${item.type === "tv" ? "TV" : "cinema"}` });
  }
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
  // Language counts too, so a page interleaves industries (for example
  // Hollywood and Bollywood) instead of stacking one language at the top.
  const sameLanguage = left.originalLanguage && left.originalLanguage === right.originalLanguage ? 1 : 0;
  return Math.min(
    1,
    sameCollection * 0.7 + samePrimary * 0.15 + genreJaccard(left.genreIds, right.genreIds) * 0.15 + sameLanguage * 0.25,
  );
}

export const LANGUAGE_MAX_SHARE = 0.65;

/**
 * Cap how much of one page a single original language may take, so a viewer
 * whose history is mostly English still sees strong Hindi (and other) titles
 * mixed in. Items over the cap move just past the page boundary rather than
 * being dropped; when there is not enough variety the page is topped up in
 * rank order.
 */
export function balanceLanguageMix<T extends { item: UnifiedContentItem }>(
  ranked: T[],
  limit: number,
  maxShare = LANGUAGE_MAX_SHARE,
): T[] {
  if (limit <= 0 || ranked.length <= 1) return ranked;
  const cap = Math.max(1, Math.ceil(limit * maxShare));
  const counts = new Map<string, number>();
  const head: T[] = [];
  const deferred: T[] = [];
  for (const entry of ranked) {
    const language = entry.item.originalLanguage || "unknown";
    const count = counts.get(language) || 0;
    if (head.length >= limit || count >= cap) {
      deferred.push(entry);
      continue;
    }
    counts.set(language, count + 1);
    head.push(entry);
  }
  while (head.length < limit && deferred.length > 0) head.push(deferred.shift()!);
  return [...head, ...deferred];
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

/** True when the title has a known release/air date that is not in the future. */
export function isReleased(releaseDate: string | null | undefined, now = Date.now()): boolean {
  const released = releaseDate ? Date.parse(releaseDate) : Number.NaN;
  return Number.isFinite(released) && released <= now;
}

/**
 * Drop catalogue noise and anything that cannot be watched yet: undated and
 * upcoming titles never pass. Released titles need a minimum number of votes
 * unless they came out recently and have not had time to gather them.
 */
export function passesQualityFloor(item: UnifiedContentItem, now = Date.now()): boolean {
  if (!isReleased(item.releaseDate, now)) return false;
  if (item.voteCount >= QUALITY_FLOOR_MIN_VOTES) return true;
  return now - Date.parse(item.releaseDate!) <= QUALITY_FLOOR_FRESH_DAYS * 86_400_000;
}

export const NON_ENGLISH_POPULARITY_SCALE = 0.4;

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
  // TMDB popularity is driven by a mostly English-speaking audience, so a
  // blockbuster Hindi or Tamil release scores far below a Hollywood one. Scale
  // the bar so Trending/Popular are not Hollywood-only.
  const popularityBar = (item.originalLanguage || "en").toLowerCase() === "en" ? 1 : NON_ENGLISH_POPULARITY_SCALE;
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  switch (filters.recommendationType) {
    case "trending":
      if (item.popularity <= 50 * popularityBar) return false;
      break;
    case "highrated":
      // Vote-smoothed so a 9.0 from a handful of fans does not qualify.
      if (smoothedRating(item.voteAverage, item.voteCount) < 7.6) return false;
      break;
    case "popular":
      if (item.popularity < 100 * popularityBar) return false;
      break;
    case "newreleases":
      if (!Number.isFinite(releaseTimestamp) || releaseTimestamp <= recentCutoff || releaseTimestamp > Date.now()) return false;
      break;
  }
  return true;
}

