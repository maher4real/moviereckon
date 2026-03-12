import { getContentKey, normalizeTmdbItem } from "./normalizers";
import {
  calculatePopularityCap,
  calculatePopularityMedian,
  isHiddenGem,
  scoreCandidate,
} from "./scoring";
import {
  ContentType,
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

function languageKey(item: UnifiedContentItem): string {
  return (item.originalLanguage || "unknown").toLowerCase();
}

type SimilarityProfile = {
  genreIds: Set<number>;
  leadActorIds: Set<number>;
  peopleIds: Set<number>;
};

type DiversificationState = {
  dominantLanguage: string | null;
  preferredLanguageSet: Set<string>;
  selectedCount: number;
  languageCounts: Map<string, number>;
  typeCounts: Map<ContentType, number>;
};

const similarityProfileCache = new WeakMap<UnifiedContentItem, SimilarityProfile>();

function getSimilarityProfile(item: UnifiedContentItem): SimilarityProfile {
  const cached = similarityProfileCache.get(item);
  if (cached) return cached;

  const profile: SimilarityProfile = {
    genreIds: new Set(item.genreIds),
    leadActorIds: new Set(item.leadActors.map((person) => person.id)),
    peopleIds: new Set(item.peopleIds),
  };

  similarityProfileCache.set(item, profile);
  return profile;
}

function setJaccard(left: Set<number>, right: Set<number>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;

  const smaller = left.size <= right.size ? left : right;
  const larger = smaller === left ? right : left;

  smaller.forEach((value) => {
    if (larger.has(value)) intersection += 1;
  });

  const union = left.size + right.size - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function recommendationSimilarity(
  a: UnifiedContentItem,
  b: UnifiedContentItem,
  similarityCache: Map<string, number>,
): number {
  if (a.key === b.key) return 1;

  const pairKey = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
  const cached = similarityCache.get(pairKey);
  if (cached !== undefined) return cached;

  const leftProfile = getSimilarityProfile(a);
  const rightProfile = getSimilarityProfile(b);

  const sameCollection =
    a.collectionId && b.collectionId && a.collectionId === b.collectionId ? 1 : 0;
  const samePrimaryGenre =
    a.primaryGenreId && b.primaryGenreId && a.primaryGenreId === b.primaryGenreId ? 1 : 0;
  const genreSimilarity = setJaccard(leftProfile.genreIds, rightProfile.genreIds);
  const leadActorSimilarity = setJaccard(leftProfile.leadActorIds, rightProfile.leadActorIds);
  const peopleSimilarity = setJaccard(leftProfile.peopleIds, rightProfile.peopleIds);

  const similarity = clamp(
    sameCollection * 0.65 +
      samePrimaryGenre * 0.1 +
      genreSimilarity * 0.2 +
      leadActorSimilarity * 0.25 +
      peopleSimilarity * 0.15,
  );

  similarityCache.set(pairKey, similarity);
  return similarity;
}

function selectionBalanceAdjustment(
  candidate: RankedRecommendation,
  state: DiversificationState,
): number {
  if (state.selectedCount === 0) return 0;

  const candidateLanguage = languageKey(candidate.item);
  const dominantLanguage = state.dominantLanguage;
  const sameLanguageCount = state.languageCounts.get(candidateLanguage) || 0;
  const sameTypeCount = state.typeCounts.get(candidate.item.type) || 0;
  const total = state.selectedCount;
  const languageShare = sameLanguageCount / total;
  const typeShare = sameTypeCount / total;

  let adjustment = 0;

  if (sameLanguageCount === 0) {
    adjustment += 0.03;
  }

  if (dominantLanguage && candidateLanguage !== dominantLanguage) {
    adjustment += 0.01;
  }

  if (state.preferredLanguageSet.has(candidateLanguage) && candidateLanguage !== dominantLanguage) {
    adjustment += 0.028;
  }

  if (dominantLanguage && candidateLanguage === dominantLanguage && languageShare >= 0.45) {
    adjustment -= Math.min(0.08, 0.015 + (languageShare - 0.45) * 0.25);
  } else if (languageShare >= 0.4) {
    adjustment -= 0.015;
  }

  if (sameTypeCount === 0) {
    adjustment += 0.006;
  } else if (typeShare >= 0.8) {
    adjustment -= 0.012;
  }

  return adjustment;
}

function createDiversificationState(
  userContext?: RecommendationUserContext,
): DiversificationState {
  return {
    dominantLanguage:
      typeof userContext?.dominantLanguage === "string"
        ? userContext.dominantLanguage.toLowerCase()
        : null,
    preferredLanguageSet: new Set(
      (userContext?.preferredLanguages || []).map((language) => language.toLowerCase()),
    ),
    selectedCount: 0,
    languageCounts: new Map<string, number>(),
    typeCounts: new Map<ContentType, number>(),
  };
}

function registerDiversifiedSelection(
  entry: RankedRecommendation,
  state: DiversificationState,
): void {
  state.selectedCount += 1;
  const entryLanguage = languageKey(entry.item);
  state.languageCounts.set(entryLanguage, (state.languageCounts.get(entryLanguage) || 0) + 1);
  state.typeCounts.set(entry.item.type, (state.typeCounts.get(entry.item.type) || 0) + 1);
}

function diversifyTopResults(
  scoredItems: RankedRecommendation[],
  topN: number,
  userContext?: RecommendationUserContext,
): RankedRecommendation[] {
  if (scoredItems.length <= 2) return scoredItems;

  const cut = Math.min(Math.max(2, topN), scoredItems.length);
  const pool = scoredItems.slice(0, cut).map((entry) => ({
    entry,
    maxSimilarity: 0,
  }));
  const remainder = scoredItems.slice(cut);
  const selected: RankedRecommendation[] = [];
  const similarityCache = new Map<string, number>();
  const diversificationState = createDiversificationState(userContext);
  const lambda = 0.74;

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestRank = Number.NEGATIVE_INFINITY;
    let bestPenalty = 0;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const penalty = (1 - lambda) * candidate.maxSimilarity;

      const rankValue =
        lambda * candidate.entry.score -
        penalty +
        selectionBalanceAdjustment(candidate.entry, diversificationState);
      if (rankValue > bestRank) {
        bestRank = rankValue;
        bestIndex = index;
        bestPenalty = penalty;
      }
    }

    const chosen = pool.splice(bestIndex, 1)[0];
    const nextBreakdown: ScoreBreakdown = {
      ...chosen.entry.scoreBreakdown,
      diversityPenalty: bestPenalty,
    };

    const selectedEntry = {
      ...chosen.entry,
      score: Math.max(0, chosen.entry.score - bestPenalty),
      scoreBreakdown: nextBreakdown,
    };
    selected.push(selectedEntry);
    registerDiversifiedSelection(selectedEntry, diversificationState);

    for (const candidate of pool) {
      const nextSimilarity = recommendationSimilarity(
        candidate.entry.item,
        selectedEntry.item,
        similarityCache,
      );
      if (nextSimilarity > candidate.maxSimilarity) {
        candidate.maxSimilarity = nextSimilarity;
      }
    }
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

function enforcePreferredLanguageCoverage(
  rankedItems: RankedRecommendation[],
  userContext?: RecommendationUserContext,
): RankedRecommendation[] {
  if (rankedItems.length === 0) return rankedItems;

  const dominantLanguage =
    typeof userContext?.dominantLanguage === "string"
      ? userContext.dominantLanguage.toLowerCase()
      : null;
  const preferredLanguages = Array.from(
    new Set(
      (userContext?.preferredLanguages || [])
        .map((language) => language.toLowerCase())
        .filter((language) => language && language !== dominantLanguage),
    ),
  );

  if (preferredLanguages.length === 0) {
    return rankedItems;
  }

  const windowSize = Math.min(12, rankedItems.length);
  const updatedTop = rankedItems.slice(0, windowSize);
  const preferredLanguageSet = new Set(preferredLanguages);
  const availableCounts = new Map<string, number>();
  const currentCounts = new Map<string, number>();
  const selectedKeys = new Set(updatedTop.map((entry) => entry.item.key));
  const replacementQueues = new Map<string, RankedRecommendation[]>();

  for (const entry of rankedItems) {
    const entryLanguage = languageKey(entry.item);
    availableCounts.set(entryLanguage, (availableCounts.get(entryLanguage) || 0) + 1);

    if (!preferredLanguageSet.has(entryLanguage) || selectedKeys.has(entry.item.key)) {
      continue;
    }

    const queue = replacementQueues.get(entryLanguage);
    if (queue) {
      queue.push(entry);
    } else {
      replacementQueues.set(entryLanguage, [entry]);
    }
  }

  for (const entry of updatedTop) {
    const entryLanguage = languageKey(entry.item);
    currentCounts.set(entryLanguage, (currentCounts.get(entryLanguage) || 0) + 1);
  }

  const desiredCoverage = preferredLanguages
    .map((language) => {
      const available = availableCounts.get(language) || 0;
      return {
        language,
        desired: available >= 2 ? 2 : available > 0 ? 1 : 0,
      };
    })
    .filter((entry) => entry.desired > 0);

  if (desiredCoverage.length === 0) {
    return rankedItems;
  }

  const replaceableIndexes = updatedTop
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !preferredLanguageSet.has(languageKey(entry.item)))
    .sort((left, right) => left.entry.score - right.entry.score)
    .map(({ index }) => index);

  for (const { language, desired } of desiredCoverage) {
    let existingCount = currentCounts.get(language) || 0;
    if (existingCount >= desired) continue;

    const replacements = replacementQueues.get(language) || [];

    while (existingCount < desired && replacements.length > 0 && replaceableIndexes.length > 0) {
      const replacement = replacements.shift();
      const replaceIndex = replaceableIndexes.shift();
      if (!replacement || replaceIndex === undefined || selectedKeys.has(replacement.item.key)) {
        break;
      }

      const replacedLanguage = languageKey(updatedTop[replaceIndex].item);
      updatedTop[replaceIndex] = replacement;
      selectedKeys.add(replacement.item.key);
      currentCounts.set(replacedLanguage, Math.max(0, (currentCounts.get(replacedLanguage) || 0) - 1));
      currentCounts.set(language, existingCount + 1);
      existingCount += 1;
    }
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
      const novelty = 0.05;

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
      userContext,
    );
    const languageBalancedFallback = enforcePreferredLanguageCoverage(
      diversifiedFallback,
      userContext,
    );
    return enforceHiddenGemBalance(languageBalancedFallback, medianPopularity);
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
    userContext,
  );

  const languageBalanced = enforcePreferredLanguageCoverage(diversified, userContext);

  return enforceHiddenGemBalance(languageBalanced, medianPopularity);
}

export function recommendationKey(entry: RankedRecommendation): string {
  return getContentKey(entry.item.type, entry.item.id);
}
