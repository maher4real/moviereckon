import { getContentKey, normalizeTmdbItem } from "./normalizers";
import {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  RecommendationReason,
  RecommendationUserContext,
  RecommendationWeights,
  ScoreBreakdown,
  ScoreCandidateResult,
  UnifiedContentItem,
} from "./types";

const SCORE_CACHE_LIMIT = 20000;
const YEAR_WINDOW = 20;
const RUNTIME_WINDOW = 60;

const GENRE_LABELS: Record<number, string> = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  36: "History",
  37: "Western",
  53: "Thriller",
  80: "Crime",
  99: "Documentary",
  878: "Sci-Fi",
  9648: "Mystery",
  10402: "Music",
  10749: "Romance",
  10751: "Family",
  10752: "War",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  10770: "TV Movie",
};

const scoreCache = new Map<string, ScoreCandidateResult>();

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toContentItem(item: UnifiedContentItem | unknown): UnifiedContentItem | null {
  if (typeof item !== "object" || item === null) return null;
  if ("key" in item && "type" in item && "id" in item) {
    return item as UnifiedContentItem;
  }
  return normalizeTmdbItem(item);
}

function normalizeWeights(weights?: Partial<RecommendationWeights>) {
  const merged = { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...(weights || {}) };
  const baseTotal =
    merged.genre +
    merged.keywords +
    merged.people +
    merged.year +
    merged.runtime +
    merged.quality +
    merged.popularity;

  if (baseTotal <= 0) {
    return {
      ...DEFAULT_RECOMMENDATION_WEIGHTS,
      noveltyBoost: merged.noveltyBoost,
    };
  }

  return {
    ...merged,
    genre: merged.genre / baseTotal,
    keywords: merged.keywords / baseTotal,
    people: merged.people / baseTotal,
    year: merged.year / baseTotal,
    runtime: merged.runtime / baseTotal,
    quality: merged.quality / baseTotal,
    popularity: merged.popularity / baseTotal,
  };
}

function toIdSet(values: number[]): Set<number> {
  return new Set(values.filter((value) => Number.isFinite(value)));
}

function intersectionSize<T>(left: Set<T>, right: Set<T>): number {
  let count = 0;
  if (left.size < right.size) {
    left.forEach((value) => {
      if (right.has(value)) count += 1;
    });
  } else {
    right.forEach((value) => {
      if (left.has(value)) count += 1;
    });
  }
  return count;
}

function jaccardFromSets<T>(left: Set<T>, right: Set<T>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = intersectionSize(left, right);
  const union = left.size + right.size - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function keywordSet(item: UnifiedContentItem): Set<string> {
  if (item.keywords.length > 0) {
    return new Set(
      item.keywords.map((keyword) =>
        keyword.id ? `id:${keyword.id}` : `name:${keyword.name.toLowerCase()}`,
      ),
    );
  }

  return new Set(item.keywordTokens);
}

function linearProximity(a: number | null, b: number | null, window: number): number {
  if (!a || !b || window <= 0) return 0;
  const diff = Math.abs(a - b);
  if (diff >= window) return 0;
  return 1 - diff / window;
}

function qualityScore(voteAverage: number, voteCount: number): number {
  const normalizedVote = clamp(voteAverage / 10);
  const confidence = 1 - Math.exp(-Math.max(0, voteCount) / 250);
  return clamp(normalizedVote * confidence);
}

function popularityScore(popularity: number, cap: number): number {
  const boundedCap = Math.max(10, cap);
  const boundedPopularity = Math.max(0, Math.min(popularity, boundedCap));
  return clamp(Math.log1p(boundedPopularity) / Math.log1p(boundedCap));
}

function scorePeopleSimilarity(seedItem: UnifiedContentItem, candidateItem: UnifiedContentItem): number {
  if (seedItem.peopleIds.length === 0 || candidateItem.peopleIds.length === 0) {
    return 0;
  }

  const seedLead = toIdSet(seedItem.leadActors.map((actor) => actor.id));
  const candidateLead = toIdSet(candidateItem.leadActors.map((actor) => actor.id));
  const castOverlap = jaccardFromSets(seedLead, candidateLead);

  const seedCreative = toIdSet([
    ...seedItem.directors.map((person) => person.id),
    ...seedItem.creators.map((person) => person.id),
  ]);
  const candidateCreative = toIdSet([
    ...candidateItem.directors.map((person) => person.id),
    ...candidateItem.creators.map((person) => person.id),
  ]);
  const creativeMatch = intersectionSize(seedCreative, candidateCreative) > 0 ? 1 : 0;

  const peopleOverlap = jaccardFromSets(toIdSet(seedItem.peopleIds), toIdSet(candidateItem.peopleIds));

  return clamp(creativeMatch * 0.65 + castOverlap * 0.25 + peopleOverlap * 0.10);
}

function toSeenKeySet(context?: RecommendationUserContext): Set<string> {
  return new Set(context?.seenIds ? Array.from(context.seenIds) : []);
}

export function calculatePopularityMedian(items: UnifiedContentItem[]): number {
  if (!items.length) return 0;
  const values = items
    .map((item) => item.popularity)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!values.length) return 0;

  const midpoint = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return (values[midpoint - 1] + values[midpoint]) / 2;
  }
  return values[midpoint];
}

export function calculatePopularityCap(items: UnifiedContentItem[]): number {
  if (!items.length) return 100;
  const values = items
    .map((item) => item.popularity)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!values.length) return 100;

  const percentileIndex = Math.floor(values.length * 0.9);
  const p90 = values[Math.min(values.length - 1, percentileIndex)];
  return Math.max(20, p90);
}

function sharedGenreNames(seedItem: UnifiedContentItem, candidateItem: UnifiedContentItem): string[] {
  const shared = seedItem.genreIds.filter((genreId) => candidateItem.genreIds.includes(genreId));
  return shared
    .slice(0, 3)
    .map((genreId) => GENRE_LABELS[genreId] || `Genre ${genreId}`);
}

function sharedNames(left: { id: number; name?: string }[], right: { id: number; name?: string }[]): string[] {
  const rightById = new Map(right.map((item) => [item.id, item.name || ""]));
  const names: string[] = [];

  for (const item of left) {
    if (!rightById.has(item.id)) continue;
    const name = item.name || rightById.get(item.id) || "";
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

export function explainRecommendation(
  seedItemInput: UnifiedContentItem | unknown,
  candidateItemInput: UnifiedContentItem | unknown,
  scoreBreakdown: ScoreBreakdown,
): RecommendationReason[] {
  const seedItem = toContentItem(seedItemInput);
  const candidateItem = toContentItem(candidateItemInput);

  if (!seedItem || !candidateItem) {
    return [{ label: "Strong match" }];
  }

  const reasons: RecommendationReason[] = [];

  const sharedDirectorNames = sharedNames(seedItem.directors, candidateItem.directors);
  if (sharedDirectorNames.length > 0) {
    reasons.push({
      label: "Same director",
      evidence: sharedDirectorNames.slice(0, 2).join(", "),
    });
  }

  const sharedCreatorNames = sharedNames(seedItem.creators, candidateItem.creators);
  if (reasons.length < 3 && sharedCreatorNames.length > 0) {
    reasons.push({
      label: "Same creator",
      evidence: sharedCreatorNames.slice(0, 2).join(", "),
    });
  }

  const sharedGenres = sharedGenreNames(seedItem, candidateItem);
  if (reasons.length < 3 && sharedGenres.length > 0) {
    reasons.push({
      label: "Same genre",
      evidence: sharedGenres.slice(0, 2).join(", "),
    });
  }

  const sharedCastNames = sharedNames(seedItem.leadActors, candidateItem.leadActors);
  if (reasons.length < 3 && sharedCastNames.length > 0) {
    reasons.push({
      label: "Shared lead cast",
      evidence: sharedCastNames.slice(0, 2).join(", "),
    });
  }

  if (reasons.length < 3 && scoreBreakdown.keywords >= 0.08) {
    reasons.push({ label: "Similar themes" });
  }

  if (reasons.length < 3 && scoreBreakdown.quality >= 0.06) {
    reasons.push({ label: "Highly rated" });
  }

  if (reasons.length < 3 && scoreBreakdown.year >= 0.04) {
    reasons.push({ label: "From a similar era" });
  }

  if (reasons.length < 2 && scoreBreakdown.popularity >= 0.05) {
    reasons.push({ label: "Popular with viewers" });
  }

  if (reasons.length === 0) {
    reasons.push({ label: "Strong overall content match" });
  }

  if (reasons.length < 2) {
    reasons.push({ label: "Aligned with your preferences" });
  }

  return reasons.slice(0, 3);
}

export function scoreCandidate(
  seedItemInput: UnifiedContentItem | unknown,
  candidateItemInput: UnifiedContentItem | unknown,
  userContext?: RecommendationUserContext,
  weights?: Partial<RecommendationWeights>,
): ScoreCandidateResult {
  const seedItem = toContentItem(seedItemInput);
  const candidateItem = toContentItem(candidateItemInput);

  if (!seedItem || !candidateItem) {
    return {
      score: 0,
      reasons: [{ label: "Insufficient metadata" }],
      scoreBreakdown: {
        genre: 0,
        keywords: 0,
        people: 0,
        year: 0,
        runtime: 0,
        quality: 0,
        popularity: 0,
        novelty: 0,
        diversityPenalty: 0,
      },
    };
  }

  const normalizedWeights = normalizeWeights(weights);
  const seenKeys = toSeenKeySet(userContext);
  const candidateKey = getContentKey(candidateItem.type, candidateItem.id);
  const noveltyBoost = seenKeys.has(candidateKey) ? 0 : normalizedWeights.noveltyBoost;
  const popularityCap = userContext?.popularityCap || 100;

  const cacheKey = [
    seedItem.key,
    candidateItem.key,
    popularityCap.toFixed(2),
    noveltyBoost.toFixed(3),
    normalizedWeights.genre.toFixed(4),
    normalizedWeights.keywords.toFixed(4),
    normalizedWeights.people.toFixed(4),
    normalizedWeights.year.toFixed(4),
    normalizedWeights.runtime.toFixed(4),
    normalizedWeights.quality.toFixed(4),
    normalizedWeights.popularity.toFixed(4),
  ].join("|");

  const cached = scoreCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      scoreBreakdown: { ...cached.scoreBreakdown },
      reasons: cached.reasons.map((reason) => ({ ...reason })),
    };
  }

  const genreSimilarity = jaccardFromSets(toIdSet(seedItem.genreIds), toIdSet(candidateItem.genreIds));

  const seedKeywords = keywordSet(seedItem);
  const candidateKeywords = keywordSet(candidateItem);
  const keywordSimilarity = jaccardFromSets(seedKeywords, candidateKeywords);

  const peopleSimilarity = scorePeopleSimilarity(seedItem, candidateItem);
  const yearSimilarity = linearProximity(seedItem.year, candidateItem.year, YEAR_WINDOW);
  const runtimeSimilarity = linearProximity(seedItem.runtime, candidateItem.runtime, RUNTIME_WINDOW);
  const qualitySimilarity = qualityScore(candidateItem.voteAverage, candidateItem.voteCount);
  const popularitySimilarity = popularityScore(candidateItem.popularity, popularityCap);

  const scoreBreakdown: ScoreBreakdown = {
    genre: genreSimilarity * normalizedWeights.genre,
    keywords: keywordSimilarity * normalizedWeights.keywords,
    people: peopleSimilarity * normalizedWeights.people,
    year: yearSimilarity * normalizedWeights.year,
    runtime: runtimeSimilarity * normalizedWeights.runtime,
    quality: qualitySimilarity * normalizedWeights.quality,
    popularity: popularitySimilarity * normalizedWeights.popularity,
    novelty: noveltyBoost,
    diversityPenalty: 0,
  };

  const score =
    scoreBreakdown.genre +
    scoreBreakdown.keywords +
    scoreBreakdown.people +
    scoreBreakdown.year +
    scoreBreakdown.runtime +
    scoreBreakdown.quality +
    scoreBreakdown.popularity +
    scoreBreakdown.novelty;

  const reasons = explainRecommendation(seedItem, candidateItem, scoreBreakdown);

  const result: ScoreCandidateResult = {
    score,
    reasons,
    scoreBreakdown,
  };

  if (scoreCache.size >= SCORE_CACHE_LIMIT) {
    const firstKey = scoreCache.keys().next().value;
    if (firstKey) scoreCache.delete(firstKey);
  }

  scoreCache.set(cacheKey, {
    score: result.score,
    reasons: result.reasons.map((reason) => ({ ...reason })),
    scoreBreakdown: { ...result.scoreBreakdown },
  });

  return result;
}

export function isHiddenGem(item: UnifiedContentItem, medianPopularity: number): boolean {
  return item.voteAverage >= 7 && item.popularity < medianPopularity;
}

export function clearRecommendationScoreCache(): void {
  scoreCache.clear();
}
