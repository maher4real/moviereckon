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

  const capped = ranked.slice(0, Math.max(1, maxCandidates));

  return {
    items: capped,
    popularityMedian: calculatePopularityMedian(capped),
  };
}
