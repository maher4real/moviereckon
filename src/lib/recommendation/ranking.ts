import { getContentKey, normalizeTmdbItem } from "./normalizers";
import {
  calculatePopularityCap,
  calculatePopularityMedian,
  isHiddenGem,
  scoreCandidate,
} from "./scoring";
import {
  DEFAULT_DIVERSIFICATION_TOP_N,
  DEFAULT_MAX_CANDIDATES,
  RankedRecommendation,
  RecommendationReason,
  RecommendationUserContext,
  ScoreBreakdown,
  UnifiedContentItem,
} from "./types";

function isUnifiedContentItem(item: unknown): item is UnifiedContentItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "key" in item &&
    "type" in item &&
    "id" in item &&
    "title" in item
  );
}

function toUnifiedItems(items: Array<UnifiedContentItem | unknown>): UnifiedContentItem[] {
  return items
    .map((item) => (isUnifiedContentItem(item) ? item : normalizeTmdbItem(item)))
    .filter((item): item is UnifiedContentItem => item !== null);
}

function toStringSet(values?: Iterable<string>): Set<string> {
  return new Set(values ? Array.from(values) : []);
}

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function setJaccard(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;

  leftSet.forEach((value) => {
    if (rightSet.has(value)) intersection += 1;
  });

  const union = leftSet.size + rightSet.size - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function recommendationSimilarity(a: UnifiedContentItem, b: UnifiedContentItem): number {
  if (a.key === b.key) return 1;

  const sameCollection =
    a.collectionId && b.collectionId && a.collectionId === b.collectionId ? 1 : 0;
  const samePrimaryGenre =
    a.primaryGenreId && b.primaryGenreId && a.primaryGenreId === b.primaryGenreId ? 1 : 0;
  const genreSimilarity = setJaccard(a.genreIds, b.genreIds);
  const leadActorSimilarity = setJaccard(
    a.leadActors.map((person) => person.id),
    b.leadActors.map((person) => person.id),
  );
  const peopleSimilarity = setJaccard(a.peopleIds, b.peopleIds);

  return clamp(
    sameCollection * 0.65 +
      samePrimaryGenre * 0.1 +
      genreSimilarity * 0.2 +
      leadActorSimilarity * 0.25 +
      peopleSimilarity * 0.15,
  );
}

function diversifyTopResults(
  scoredItems: RankedRecommendation[],
  topN: number,
): RankedRecommendation[] {
  if (scoredItems.length <= 2) return scoredItems;

  const cut = Math.min(Math.max(2, topN), scoredItems.length);
  const pool = scoredItems.slice(0, cut);
  const remainder = scoredItems.slice(cut);
  const selected: RankedRecommendation[] = [];
  const lambda = 0.74;

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestRank = Number.NEGATIVE_INFINITY;
    let bestPenalty = 0;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];

      let maxSimilarity = 0;
      for (const chosen of selected) {
        maxSimilarity = Math.max(maxSimilarity, recommendationSimilarity(candidate.item, chosen.item));
      }

      const rankValue = lambda * candidate.score - (1 - lambda) * maxSimilarity;
      if (rankValue > bestRank) {
        bestRank = rankValue;
        bestIndex = index;
        bestPenalty = (1 - lambda) * maxSimilarity;
      }
    }

    const chosen = pool.splice(bestIndex, 1)[0];
    const nextBreakdown: ScoreBreakdown = {
      ...chosen.scoreBreakdown,
      diversityPenalty: bestPenalty,
    };

    selected.push({
      ...chosen,
      score: Math.max(0, chosen.score - bestPenalty),
      scoreBreakdown: nextBreakdown,
    });
  }

  return [...selected, ...remainder];
}

function enforceHiddenGemBalance(
  rankedItems: RankedRecommendation[],
  medianPopularity: number,
): RankedRecommendation[] {
  if (rankedItems.length === 0) return rankedItems;

  const windowSize = Math.min(20, rankedItems.length);
  const requiredHiddenGems = Math.ceil(windowSize * 0.3);

  const topSlice = rankedItems.slice(0, windowSize);
  const remainder = rankedItems.slice(windowSize);

  let hiddenCount = topSlice.filter((entry) => isHiddenGem(entry.item, medianPopularity)).length;

  if (hiddenCount >= requiredHiddenGems) {
    return rankedItems;
  }

  const replacementPool = remainder
    .filter((entry) => isHiddenGem(entry.item, medianPopularity))
    .sort((a, b) => b.score - a.score);

  if (replacementPool.length === 0) {
    return rankedItems;
  }

  const replaceableIndexes = topSlice
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !isHiddenGem(entry.item, medianPopularity))
    .map(({ index }) => index)
    .reverse();

  let shortage = requiredHiddenGems - hiddenCount;
  const updatedTop = [...topSlice];

  while (shortage > 0 && replaceableIndexes.length > 0 && replacementPool.length > 0) {
    const replaceIndex = replaceableIndexes.shift();
    const replacement = replacementPool.shift();

    if (replaceIndex === undefined || !replacement) break;

    updatedTop[replaceIndex] = replacement;
    hiddenCount += 1;
    shortage -= 1;
  }

  const pickedKeys = new Set(updatedTop.map((entry) => entry.item.key));
  const tail = rankedItems.filter((entry) => !pickedKeys.has(entry.item.key));

  return [...updatedTop, ...tail];
}

function baseFallbackRanking(
  candidates: UnifiedContentItem[],
  seenKeys: Set<string>,
): RankedRecommendation[] {
  return candidates
    .filter((item) => !seenKeys.has(item.key))
    .map((item) => {
      const qualityComponent = (Math.max(0, item.voteAverage) / 10) * 0.6;
      const popularityComponent = Math.min(1, item.popularity / 150) * 0.4;
      const novelty = seenKeys.has(item.key) ? 0 : 0.05;

      const scoreBreakdown: ScoreBreakdown = {
        genre: 0,
        keywords: 0,
        people: 0,
        year: 0,
        runtime: 0,
        quality: qualityComponent,
        popularity: popularityComponent,
        novelty,
        diversityPenalty: 0,
      };

      return {
        item,
        score: qualityComponent + popularityComponent + novelty,
        reasons: [
          { label: "Highly rated" },
          { label: "Popular pick" },
        ] as RecommendationReason[],
        scoreBreakdown,
        seedKey: null,
        seedTitle: null,
        isHiddenGem: false,
        sourceTags: item.sourceTags,
      } as RankedRecommendation;
    })
    .sort((a, b) => b.score - a.score);
}

export function getRecommendations(
  seedItemsInput: Array<UnifiedContentItem | unknown>,
  candidateItemsInput: Array<UnifiedContentItem | unknown>,
  userContext?: RecommendationUserContext,
): RankedRecommendation[] {
  const normalizedSeeds = toUnifiedItems(seedItemsInput);
  const normalizedCandidates = toUnifiedItems(candidateItemsInput);

  if (normalizedCandidates.length === 0) return [];

  const seenKeys = toStringSet(userContext?.seenIds);
  const displayedKeys = toStringSet(userContext?.displayedIds);

  const maxCandidates = Math.max(1, userContext?.maxCandidates || DEFAULT_MAX_CANDIDATES);
  const deduped = new Map<string, UnifiedContentItem>();

  for (const candidate of normalizedCandidates) {
    if (seenKeys.has(candidate.key)) continue;
    if (displayedKeys.has(candidate.key)) continue;
    if (!deduped.has(candidate.key)) {
      deduped.set(candidate.key, candidate);
    }
    if (deduped.size >= maxCandidates) break;
  }

  const candidates = Array.from(deduped.values());
  if (!candidates.length) return [];

  const popularityCap = userContext?.popularityCap || calculatePopularityCap(candidates);
  const medianPopularity =
    userContext?.popularityMedian || calculatePopularityMedian(candidates);

  if (normalizedSeeds.length === 0) {
    const fallback = baseFallbackRanking(candidates, seenKeys);
    const diversifiedFallback = diversifyTopResults(
      fallback,
      userContext?.diversificationTopN || DEFAULT_DIVERSIFICATION_TOP_N,
    );
    return enforceHiddenGemBalance(diversifiedFallback, medianPopularity);
  }

  const seedWeights = userContext?.seedWeights || {};

  const scored: RankedRecommendation[] = candidates
    .map((candidate) => {
      let bestSeed: UnifiedContentItem | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestReasons: RecommendationReason[] = [];
      let weightedScoreTotal = 0;
      let weightTotal = 0;

      const weightedBreakdownTotals: ScoreBreakdown = {
        genre: 0,
        keywords: 0,
        people: 0,
        year: 0,
        runtime: 0,
        quality: 0,
        popularity: 0,
        novelty: 0,
        diversityPenalty: 0,
      };

      for (const seed of normalizedSeeds) {
        const scoreResult = scoreCandidate(seed, candidate, {
          ...userContext,
          popularityCap,
          popularityMedian: medianPopularity,
        });

        const weight = Math.max(0.01, seedWeights[seed.key] || 1);
        weightedScoreTotal += scoreResult.score * weight;
        weightTotal += weight;

        weightedBreakdownTotals.genre += scoreResult.scoreBreakdown.genre * weight;
        weightedBreakdownTotals.keywords += scoreResult.scoreBreakdown.keywords * weight;
        weightedBreakdownTotals.people += scoreResult.scoreBreakdown.people * weight;
        weightedBreakdownTotals.year += scoreResult.scoreBreakdown.year * weight;
        weightedBreakdownTotals.runtime += scoreResult.scoreBreakdown.runtime * weight;
        weightedBreakdownTotals.quality += scoreResult.scoreBreakdown.quality * weight;
        weightedBreakdownTotals.popularity += scoreResult.scoreBreakdown.popularity * weight;
        weightedBreakdownTotals.novelty += scoreResult.scoreBreakdown.novelty * weight;

        if (scoreResult.score > bestScore) {
          bestScore = scoreResult.score;
          bestSeed = seed;
          bestReasons = scoreResult.reasons;
        }
      }

      const averageScore = weightTotal > 0 ? weightedScoreTotal / weightTotal : 0;
      const blendedScore = bestScore * 0.65 + averageScore * 0.35;

      const scoreBreakdown: ScoreBreakdown = {
        genre: weightTotal > 0 ? weightedBreakdownTotals.genre / weightTotal : 0,
        keywords: weightTotal > 0 ? weightedBreakdownTotals.keywords / weightTotal : 0,
        people: weightTotal > 0 ? weightedBreakdownTotals.people / weightTotal : 0,
        year: weightTotal > 0 ? weightedBreakdownTotals.year / weightTotal : 0,
        runtime: weightTotal > 0 ? weightedBreakdownTotals.runtime / weightTotal : 0,
        quality: weightTotal > 0 ? weightedBreakdownTotals.quality / weightTotal : 0,
        popularity: weightTotal > 0 ? weightedBreakdownTotals.popularity / weightTotal : 0,
        novelty: weightTotal > 0 ? weightedBreakdownTotals.novelty / weightTotal : 0,
        diversityPenalty: 0,
      };

      return {
        item: candidate,
        score: blendedScore,
        reasons: bestReasons.slice(0, 3),
        scoreBreakdown,
        seedKey: bestSeed?.key || null,
        seedTitle: bestSeed?.title || null,
        isHiddenGem: isHiddenGem(candidate, medianPopularity),
        sourceTags: candidate.sourceTags,
      } as RankedRecommendation;
    })
    .sort((a, b) => b.score - a.score);

  const diversified = diversifyTopResults(
    scored,
    userContext?.diversificationTopN || DEFAULT_DIVERSIFICATION_TOP_N,
  );

  return enforceHiddenGemBalance(diversified, medianPopularity);
}

export function recommendationKey(entry: RankedRecommendation): string {
  return getContentKey(entry.item.type, entry.item.id);
}
