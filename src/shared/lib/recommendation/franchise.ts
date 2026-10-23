/**
 * Franchise grouping for the feed. TMDB collections only cover one numbered
 * series, so related series (The Lord of the Rings and The Hobbit, separate
 * Marvel collections) are also linked when they share a director and specific
 * story keywords, or many specific keywords on their own. Pure, no I/O.
 */
import type { UnifiedContentItem } from "./types";

// Keywords too broad to say two films belong together.
const GENERIC_KEYWORDS = new Set([
  "based on novel or book",
  "based on comic",
  "based on manga",
  "based on true story",
  "based on video game",
  "based on young adult novel",
  "based on play or musical",
  "based on short story",
  "biography",
  "sequel",
  "prequel",
  "remake",
  "reboot",
  "duringcreditsstinger",
  "aftercreditsstinger",
  "woman director",
  "3d",
  "imax",
  "anime",
  "musical",
  "superhero",
  "friendship",
  "love",
  "romance",
  "murder",
  "revenge",
  "family",
  "death",
  "violence",
  "dystopia",
  "christmas",
  "high school",
  "new york city",
  "london, england",
  "los angeles, california",
  "husband wife relationship",
  "father son relationship",
  "father daughter relationship",
  "mother son relationship",
  "mother daughter relationship",
  "brother brother relationship",
  "sister sister relationship",
  "lgbt",
  "gay theme",
  "short film",
]);

export const SHARED_KEYWORDS_WITH_DIRECTOR = 2;
export const SHARED_KEYWORDS_ALONE = 4;

function specificKeywords(item: UnifiedContentItem): Set<string> {
  return new Set(
    item.keywords
      .map((keyword) => keyword.name.trim().toLowerCase())
      .filter((name) => name && !GENERIC_KEYWORDS.has(name)),
  );
}

function directorIds(item: UnifiedContentItem): Set<string> {
  return new Set(
    [...item.directors, ...item.creators].map((person) => String(person.id ?? person.name).toLowerCase()),
  );
}

export function sameFranchise(left: UnifiedContentItem, right: UnifiedContentItem): boolean {
  if (left.key === right.key || left.type !== right.type) return false;
  if (left.collectionId !== null && left.collectionId === right.collectionId) return true;
  const leftKeywords = specificKeywords(left);
  if (leftKeywords.size === 0) return false;
  let shared = 0;
  for (const keyword of specificKeywords(right)) if (leftKeywords.has(keyword)) shared += 1;
  if (shared >= SHARED_KEYWORDS_ALONE) return true;
  if (shared < SHARED_KEYWORDS_WITH_DIRECTOR) return false;
  const leftDirectors = directorIds(left);
  return [...directorIds(right)].some((id) => leftDirectors.has(id));
}

/**
 * Map each item key to a franchise key. Titles with no link to another title
 * get no entry. Linking is transitive, so Fellowship, Two Towers and the
 * Hobbit films share one key even though they sit in two TMDB collections.
 */
export function assignFranchiseKeys(items: UnifiedContentItem[]): Map<string, string> {
  const parent = new Map<string, string>(items.map((item) => [item.key, item.key]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      if (!sameFranchise(items[left]!, items[right]!)) continue;
      const leftRoot = find(items[left]!.key);
      const rightRoot = find(items[right]!.key);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    }
  }
  const members = new Map<string, UnifiedContentItem[]>();
  for (const item of items) {
    const root = find(item.key);
    members.set(root, [...(members.get(root) || []), item]);
  }
  const keys = new Map<string, string>();
  for (const group of members.values()) {
    if (group.length < 2) continue;
    const collection = group.map((item) => item.collectionId).find((id) => id !== null);
    const groupKey = collection != null
      ? `collection:${collection}`
      : `group:${group.map((item) => item.key).sort()[0]}`;
    group.forEach((item) => keys.set(item.key, groupKey));
  }
  return keys;
}

function releaseValue(item: UnifiedContentItem): number {
  const value = item.releaseDate ? Date.parse(item.releaseDate) : Number.NaN;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * Keep one title per franchise on a page. The kept title is the earliest
 * release still unseen (the natural next entry to watch) and takes the slot of
 * the franchise's best-ranked member. Other members move past the page
 * boundary, so later pages can still offer them.
 */
export function limitPerFranchise<T extends { item: UnifiedContentItem }>(
  ranked: T[],
  limit: number,
  franchiseKeys: ReadonlyMap<string, string>,
): T[] {
  if (franchiseKeys.size === 0 || limit <= 0) return ranked;
  const entryPoint = new Map<string, T>();
  for (const entry of ranked) {
    const franchise = franchiseKeys.get(entry.item.key);
    if (!franchise) continue;
    const current = entryPoint.get(franchise);
    if (!current || releaseValue(entry.item) < releaseValue(current.item)) entryPoint.set(franchise, entry);
  }
  const placed = new Set<string>();
  const head: T[] = [];
  const deferred: T[] = [];
  for (const entry of ranked) {
    const franchise = franchiseKeys.get(entry.item.key);
    if (!franchise) {
      (head.length < limit ? head : deferred).push(entry);
      continue;
    }
    const representative = entryPoint.get(franchise)!;
    if (!placed.has(franchise) && head.length < limit) {
      placed.add(franchise);
      head.push(representative);
      if (representative !== entry) deferred.push(entry);
    } else if (entry !== representative || !placed.has(franchise)) {
      deferred.push(entry);
    }
  }
  while (head.length < limit && deferred.length > 0) head.push(deferred.shift()!);
  return [...head, ...deferred];
}
