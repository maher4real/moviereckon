/**
 * Adds the franchise signals discover results lack (collection, keywords,
 * directors) to the head of a ranked feed page. Bounded by count and time, and
 * cached per process, so a slow TMDB never delays the feed: titles that are
 * not enriched in time are simply left ungrouped.
 */
import { getServerMovieRecommendationProfile } from "@/backend/services/tmdbServer";
import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";

type FranchiseFields = Pick<UnifiedContentItem, "collectionId" | "keywords" | "keywordTokens" | "directors">;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5_000;
const cache = new Map<number, { fields: FranchiseFields | null; at: number }>();

export const FRANCHISE_ENRICH_LIMIT = 32;
export const FRANCHISE_ENRICH_DEADLINE_MS = 1_500;

export function clearFranchiseCache(): void {
  cache.clear();
}

function remember(id: number, fields: FranchiseFields | null): void {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(id, { fields, at: Date.now() });
}

async function loadFields(id: number): Promise<FranchiseFields | null> {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.fields;
  try {
    const details = await getServerMovieRecommendationProfile(id);
    const normalized = normalizeTmdbItem(details, { typeHint: "movie", useCache: false });
    const fields = normalized
      ? {
          collectionId: normalized.collectionId,
          keywords: normalized.keywords,
          keywordTokens: normalized.keywordTokens,
          directors: normalized.directors,
        }
      : null;
    remember(id, fields);
    return fields;
  } catch {
    // Not cached: a transient TMDB failure should be retried next request.
    return null;
  }
}

/**
 * Returns the same items with franchise fields filled in where they could be
 * loaded in time. Display data (`raw`) is left untouched so batch payloads do
 * not grow with credits and keyword lists.
 */
export async function enrichFranchiseMetadata(
  items: UnifiedContentItem[],
  { limit = FRANCHISE_ENRICH_LIMIT, deadlineMs = FRANCHISE_ENRICH_DEADLINE_MS } = {},
): Promise<UnifiedContentItem[]> {
  const targets = items
    .filter((item) => item.type === "movie" && item.keywords.length === 0)
    .slice(0, limit);
  if (targets.length === 0) return items;
  const loaded = new Map<string, FranchiseFields>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => { timer = setTimeout(resolve, deadlineMs); });
  await Promise.race([
    Promise.all(targets.map(async (item) => {
      const fields = await loadFields(item.id);
      if (fields) loaded.set(item.key, fields);
    })),
    deadline,
  ]);
  clearTimeout(timer);
  if (loaded.size === 0) return items;
  return items.map((item) => {
    const fields = loaded.get(item.key);
    return fields ? { ...item, ...fields, collectionId: item.collectionId ?? fields.collectionId } : item;
  });
}
