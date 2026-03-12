import type { RecommendationExplanation } from "@/frontend/lib/mongodbClient";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

const DEFAULT_ROTATION_INTERVAL_MS = 8 * 60 * 1000;
const DYNAMIC_WINDOW_SIZE = 24;

type RecommendationItem = Movie | TVShow;

type DynamicEntry = {
  item: RecommendationItem;
  key: string;
  type: "movie" | "tv";
  language: string;
  baseScore: number;
  dynamicScore: number;
};

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function deterministicUnit(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function getRecommendationItemType(item: RecommendationItem): "movie" | "tv" {
  return "title" in item ? "movie" : "tv";
}

function getRecommendationKey(item: RecommendationItem): string {
  return `${getRecommendationItemType(item)}_${item.id}`;
}

function fallbackScore(item: RecommendationItem): number {
  const ratingScore = Math.max(0, item.vote_average || 0) / 10;
  const popularityScore = clamp(Math.log1p(Math.max(0, item.popularity || 0)) / 6);
  return ratingScore * 0.72 + popularityScore * 0.28;
}

function getExplanationScore(
  item: RecommendationItem,
  explanationById: Record<string, RecommendationExplanation>,
): number {
  const explanation = explanationById[getRecommendationKey(item)];
  if (typeof explanation?.score === "number" && Number.isFinite(explanation.score)) {
    return explanation.score;
  }

  return fallbackScore(item);
}

export function getRecommendationRotationBucket(
  now = Date.now(),
  intervalMs = DEFAULT_ROTATION_INTERVAL_MS,
): number {
  return Math.floor(now / intervalMs);
}

export function reorderDynamicRecommendations(
  items: RecommendationItem[],
  explanationById: Record<string, RecommendationExplanation>,
  rotationKey: string,
): RecommendationItem[] {
  if (items.length <= 2 || !rotationKey) {
    return items;
  }

  const entries: DynamicEntry[] = items.map((item) => ({
    item,
    key: getRecommendationKey(item),
    type: getRecommendationItemType(item),
    language: (item.original_language || "unknown").toLowerCase(),
    baseScore: getExplanationScore(item, explanationById),
    dynamicScore: 0,
  }));

  const windowSize = Math.min(DYNAMIC_WINDOW_SIZE, entries.length);
  const window = entries.slice(0, windowSize);
  const remainder = entries.slice(windowSize);

  const maxScore = Math.max(...window.map((entry) => entry.baseScore));
  const minScore = Math.min(...window.map((entry) => entry.baseScore));
  const scoreSpread = Math.max(0.06, maxScore - minScore);

  const languageCounts = window.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.language] = (acc[entry.language] || 0) + 1;
    return acc;
  }, {});
  const typeCounts = window.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {});

  const orderedWindow = window
    .map((entry, index) => {
      const normalizedGap = clamp((maxScore - entry.baseScore) / scoreSpread);
      const closeness = 1 - normalizedGap;
      const jitterScale = index < 4 ? 0.014 : index < 12 ? 0.03 : 0.046;
      const jitter =
        (deterministicUnit(`${rotationKey}|${entry.key}|jitter`) - 0.5) *
        jitterScale *
        (0.7 + closeness);
      const languageShare = (languageCounts[entry.language] || 0) / windowSize;
      const typeShare = (typeCounts[entry.type] || 0) / windowSize;
      const languageBonus = languageShare <= 0.18 ? 0.012 : languageShare <= 0.28 ? 0.005 : 0;
      const typeBonus = typeShare <= 0.34 ? 0.004 : 0;
      const anchorPenalty = index < 3 ? closeness * 0.002 : 0;

      return {
        ...entry,
        dynamicScore:
          entry.baseScore + jitter + languageBonus + typeBonus - anchorPenalty,
      };
    })
    .sort((left, right) => {
      if (right.dynamicScore !== left.dynamicScore) {
        return right.dynamicScore - left.dynamicScore;
      }
      return right.baseScore - left.baseScore;
    });

  return [...orderedWindow, ...remainder].map((entry) => entry.item);
}
