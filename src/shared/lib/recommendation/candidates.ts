import { addSourceTag, mergeNormalizedItems, normalizeTmdbItems } from "./normalizers";
import { calculatePopularityMedian } from "./scoring";
import {
  CandidateSourceInput,
  CandidateUnionResult,
  DEFAULT_MAX_CANDIDATES,
  UnifiedContentItem,
} from "./types";

function candidatePriority(item: UnifiedContentItem): number {
  const metadataDepth =
    (item.keywords.length > 0 ? 8 : 0) +
    (item.cast.length > 0 ? 4 : 0) +
    (item.directors.length + item.creators.length > 0 ? 4 : 0) +
    (item.runtime ? 2 : 0);

  return item.popularity * 0.6 + item.voteAverage * 4 + metadataDepth;
}

function languageBucketKey(item: UnifiedContentItem): string {
  return (item.originalLanguage || "unknown").toLowerCase();
}

function balanceCandidatesByLanguage(
  ranked: UnifiedContentItem[],
  maxCandidates: number,
): UnifiedContentItem[] {
  if (ranked.length <= maxCandidates) {
    return ranked;
  }

  const buckets = new Map<string, UnifiedContentItem[]>();
  ranked.forEach((item) => {
    const key = languageBucketKey(item);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(item);
      return;
    }

    buckets.set(key, [item]);
  });

  const orderedBuckets = Array.from(buckets.values())
    .sort((left, right) => {
      const sizeDelta = right.length - left.length;
      if (sizeDelta !== 0) return sizeDelta;
      return candidatePriority(right[0]) - candidatePriority(left[0]);
    })
    .map((bucket) => [...bucket]);

  const balanced: UnifiedContentItem[] = [];

  while (balanced.length < maxCandidates) {
    let pickedInRound = false;

    for (const bucket of orderedBuckets) {
      const nextItem = bucket.shift();
      if (!nextItem) continue;

      balanced.push(nextItem);
      pickedInRound = true;

      if (balanced.length >= maxCandidates) {
        break;
      }
    }

    if (!pickedInRound) {
      break;
    }
  }

  return balanced;
}

export function buildCandidateUnion(
  sources: CandidateSourceInput[],
  maxCandidates = DEFAULT_MAX_CANDIDATES,
): CandidateUnionResult {
  const deduped = new Map<string, UnifiedContentItem>();

  for (const source of sources) {
    if (!source.items?.length) continue;

    const normalized = normalizeTmdbItems(source.items, {
      typeHint: source.typeHint,
      sourceTag: source.source,
    });

    for (const item of normalized) {
      const tagged = addSourceTag(item, source.source);
      const existing = deduped.get(tagged.key);
      if (!existing) {
        deduped.set(tagged.key, tagged);
        continue;
      }

      deduped.set(tagged.key, mergeNormalizedItems(existing, tagged));
    }
  }

  const ranked = Array.from(deduped.values()).sort(
    (a, b) => candidatePriority(b) - candidatePriority(a),
  );

  const capped = balanceCandidatesByLanguage(ranked, Math.max(1, maxCandidates));

  return {
    items: capped,
    popularityMedian: calculatePopularityMedian(capped),
  };
}
