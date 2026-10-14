import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";
import type { TasteTitleEvent } from "@/shared/lib/recommendation/taste";

export const NOW = "2026-09-05T12:00:00.000Z";

// Hidden "true taste" of the synthetic viewer: dark thrillers, crime and
// mystery, in English or Korean, released 2010 or later, never horror.
export const TRUE_GENRES = [53, 80, 9648];
export const DISLIKED_GENRE = 27;
export const TRUE_LANGUAGES = ["en", "ko"];
export const TRUE_MIN_YEAR = 2010;

const GENRE_POOL = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752, 37];
const LANGUAGES = ["en", "en", "en", "ko", "hi", "fr", "ja"];

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

interface RawSpec {
  id: number;
  genres: number[];
  language: string;
  year: number;
  voteAverage: number;
  voteCount: number;
  popularity: number;
}

export interface CatalogueOptions {
  /** A viewer who would not enjoy titles with almost no votes (noisy ratings). */
  qualityAware?: boolean;
}

function isRelevant(spec: RawSpec, options: CatalogueOptions): boolean {
  if (options.qualityAware && spec.voteCount < 60) return false;
  return (
    spec.genres.some((genre) => TRUE_GENRES.includes(genre)) &&
    !spec.genres.includes(DISLIKED_GENRE) &&
    TRUE_LANGUAGES.includes(spec.language) &&
    spec.year >= TRUE_MIN_YEAR
  );
}

function toItem(spec: RawSpec): UnifiedContentItem {
  const item = normalizeTmdbItem(
    {
      id: spec.id,
      title: `Fixture ${spec.id}`,
      overview: "",
      genre_ids: spec.genres,
      original_language: spec.language,
      release_date: `${spec.year}-06-01`,
      vote_average: spec.voteAverage,
      vote_count: spec.voteCount,
      popularity: spec.popularity,
    },
    { typeHint: "movie", useCache: false },
  );
  if (!item) throw new Error(`fixture ${spec.id} must normalize`);
  return item;
}

export function buildCatalogue(options: CatalogueOptions = {}): { items: UnifiedContentItem[]; relevantKeys: Set<string> } {
  const random = lcg(20260914);
  const specs: RawSpec[] = [];
  let nextId = 1000;

  for (let index = 0; index < 800; index += 1) {
    const genres: number[] = [];
    const wanted = 1 + Math.floor(random() * 3);
    while (genres.length < wanted) {
      const genre = GENRE_POOL[Math.floor(random() * GENRE_POOL.length)];
      if (!genres.includes(genre)) genres.push(genre);
    }
    const voteCount = random() < 0.15 ? 5 + Math.floor(random() * 40) : 100 + Math.floor(random() * 5000);
    specs.push({
      id: nextId++,
      genres,
      language: LANGUAGES[Math.floor(random() * LANGUAGES.length)],
      year: 1985 + Math.floor(random() * 41),
      voteCount,
      // A few tiny-vote titles carry near-perfect ratings: the junk a raw
      // average would rank first for someone with no history.
      voteAverage: voteCount < 60 ? 8.5 + random() * 1.4 : 5 + random() * 3.8,
      popularity: 5 + random() ** 2 * 400,
    });
  }

  // Decoys that tempt a genre-only engine.
  for (let index = 0; index < 30; index += 1) {
    specs.push({ id: nextId++, genres: [53, DISLIKED_GENRE], language: "en", year: 2018 + (index % 8), voteAverage: 7, voteCount: 3000, popularity: 350 });
  }
  for (let index = 0; index < 30; index += 1) {
    specs.push({ id: nextId++, genres: [53], language: "en", year: 1990 + (index % 10), voteAverage: 7.4, voteCount: 2500, popularity: 200 });
  }
  for (let index = 0; index < 20; index += 1) {
    specs.push({ id: nextId++, genres: [53], language: "hi", year: 2020 + (index % 5), voteAverage: 7, voteCount: 1800, popularity: 220 });
  }

  const relevantKeys = new Set<string>();
  const items = specs.map((spec) => {
    const item = toItem(spec);
    if (isRelevant(spec, options)) relevantKeys.add(item.key);
    return item;
  });
  return { items, relevantKeys };
}

export function eventsFromItems(
  items: UnifiedContentItem[],
  signal: TasteTitleEvent["signal"] = "liked",
): TasteTitleEvent[] {
  return items.map((item) => ({
    contentId: item.id,
    contentType: item.type,
    title: item.title,
    genres: item.genreIds,
    language: item.originalLanguage,
    occurredAt: "2026-09-04T12:00:00.000Z",
    signal,
  }));
}

export function precisionAt(
  ranked: Array<{ item: UnifiedContentItem }>,
  relevantKeys: Set<string>,
  k: number,
): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter(({ item }) => relevantKeys.has(item.key)).length / top.length;
}

import type { TasteSeed } from "@/shared/lib/recommendation/taste";

/** Picks varied relevant titles (distinct primary genre + language first). */
export function relevantSeeds(
  items: UnifiedContentItem[],
  relevantKeys: Set<string>,
  count: number,
): TasteSeed[] {
  const relevant = items.filter((item) => relevantKeys.has(item.key));
  const chosen: UnifiedContentItem[] = [];
  const seenCombos = new Set<string>();
  for (const item of relevant) {
    const combo = `${item.primaryGenreId}:${item.originalLanguage}`;
    if (seenCombos.has(combo)) continue;
    seenCombos.add(combo);
    chosen.push(item);
    if (chosen.length >= count) break;
  }
  for (const item of relevant) {
    if (chosen.length >= count) break;
    if (!chosen.includes(item)) chosen.push(item);
  }
  return chosen.slice(0, count).map((item) => ({
    contentId: item.id,
    contentType: item.type,
    title: item.title,
    genres: item.genreIds,
    ...(item.originalLanguage ? { language: item.originalLanguage } : {}),
  }));
}
