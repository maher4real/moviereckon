import {
  ContentType,
  UnifiedContentItem,
  UnifiedKeyword,
  UnifiedPerson,
} from "./types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "this",
  "these",
  "those",
  "their",
  "his",
  "her",
  "our",
  "your",
  "you",
  "he",
  "she",
  "they",
  "we",
  "them",
  "was",
  "were",
  "will",
  "would",
  "can",
  "could",
  "should",
  "about",
  "after",
  "before",
  "over",
  "under",
  "than",
  "then",
  "also",
]);

const MAX_TOKEN_COUNT = 90;
const MAX_CAST_COUNT = 12;
const MAX_LEAD_COUNT = 6;

const normalizedFeatureCache = new Map<string, UnifiedContentItem>();

type AnyRecord = Record<string, unknown>;

function isObject(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  const unique: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function uniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value) || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function tokenizeText(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= MAX_TOKEN_COUNT) break;
  }
  return unique;
}

function parseYearFromDate(date?: string): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function detectType(raw: AnyRecord, typeHint?: ContentType): ContentType | null {
  if (typeHint === "movie" || typeHint === "tv") return typeHint;

  const contentType = asString(raw._content_type);
  if (contentType === "movie" || contentType === "tv") return contentType;

  const mediaType = asString(raw.media_type);
  if (mediaType === "movie" || mediaType === "tv") return mediaType;

  if ("title" in raw || "release_date" in raw) return "movie";
  if ("name" in raw || "first_air_date" in raw) return "tv";

  return null;
}

function normalizeGenres(raw: AnyRecord): number[] {
  const directIds = toArray(raw.genre_ids)
    .map((value) => asNumber(value))
    .filter((value): value is number => value !== null);

  const namedGenres = toArray(raw.genres)
    .map((value) => {
      if (!isObject(value)) return null;
      return asNumber(value.id);
    })
    .filter((value): value is number => value !== null);

  return uniqueNumbers([...directIds, ...namedGenres]);
}

function normalizeRuntime(raw: AnyRecord, type: ContentType): number | null {
  const runtime = asNumber(raw.runtime);
  if (runtime && runtime > 0) return runtime;

  const episodeRuntimeArray = toArray(raw.episode_run_time)
    .map((value) => asNumber(value))
    .filter((value): value is number => value !== null && value > 0);

  if (episodeRuntimeArray.length > 0) {
    const sum = episodeRuntimeArray.reduce((acc, value) => acc + value, 0);
    return sum / episodeRuntimeArray.length;
  }

  const singleEpisodeRuntime = asNumber(raw.episode_run_time);
  if (singleEpisodeRuntime && singleEpisodeRuntime > 0) return singleEpisodeRuntime;

  if (type === "movie") {
    const inferred = asNumber(raw.length_minutes);
    if (inferred && inferred > 0) return inferred;
  }

  return null;
}

function normalizePeople(value: unknown, limit = MAX_CAST_COUNT): UnifiedPerson[] {
  const people = toArray(value)
    .map((entry) => {
      if (!isObject(entry)) return null;
      const id = asNumber(entry.id);
      if (!id) return null;

      return {
        id,
        name: asString(entry.name),
        role: asString(entry.character) || asString(entry.job),
        order: asNumber(entry.order) ?? undefined,
      } as UnifiedPerson;
    })
    .filter((person): person is UnifiedPerson => person !== null)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

  return uniqueById(people).slice(0, limit);
}

function normalizeDirectors(raw: AnyRecord): UnifiedPerson[] {
  const credits = isObject(raw.credits) ? raw.credits : null;
  const crewSource = raw.crew ?? credits?.crew;
  const crew = toArray(crewSource)
    .map((entry) => {
      if (!isObject(entry)) return null;
      const id = asNumber(entry.id);
      if (!id) return null;

      return {
        id,
        name: asString(entry.name),
        role: asString(entry.job),
      } as UnifiedPerson;
    })
    .filter((person): person is UnifiedPerson => person !== null)
    .filter((person) => (person.role || "").toLowerCase().includes("director"));

  return uniqueById(crew).slice(0, 3);
}

function normalizeCreators(raw: AnyRecord): UnifiedPerson[] {
  const createdBy = normalizePeople(raw.created_by, 5);
  if (createdBy.length > 0) {
    return createdBy;
  }

  const creators = toArray(raw.creators)
    .map((entry) => {
      if (!isObject(entry)) return null;
      const id = asNumber(entry.id);
      if (!id) return null;

      return {
        id,
        name: asString(entry.name),
        role: asString(entry.job) || "Creator",
      } as UnifiedPerson;
    })
    .filter((person): person is UnifiedPerson => person !== null);

  return uniqueById(creators).slice(0, 5);
}

function normalizeKeywords(raw: AnyRecord): UnifiedKeyword[] {
  const directKeywords = toArray(raw.keywords)
    .map((entry) => {
      if (!isObject(entry)) return null;
      const name = asString(entry.name);
      if (!name) return null;
      const id = asNumber(entry.id) ?? undefined;
      return { id, name } as UnifiedKeyword;
    })
    .filter((entry): entry is UnifiedKeyword => entry !== null);

  const keywordObject = isObject(raw.keywords) ? raw.keywords : null;
  const nestedKeywords = toArray(keywordObject?.keywords)
    .concat(toArray(keywordObject?.results))
    .map((entry) => {
      if (!isObject(entry)) return null;
      const name = asString(entry.name);
      if (!name) return null;
      const id = asNumber(entry.id) ?? undefined;
      return { id, name } as UnifiedKeyword;
    })
    .filter((entry): entry is UnifiedKeyword => entry !== null);

  const keywordIds = toArray(raw.keyword_ids)
    .map((entry) => asNumber(entry))
    .filter((entry): entry is number => entry !== null)
    .map((id) => ({ id, name: `keyword_${id}` }));

  const all = [...directKeywords, ...nestedKeywords, ...keywordIds];
  const seen = new Set<string>();
  const unique: UnifiedKeyword[] = [];

  for (const keyword of all) {
    const key = keyword.id ? `id:${keyword.id}` : `name:${keyword.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(keyword);
  }

  return unique.slice(0, 24);
}

function itemRichness(item: UnifiedContentItem): number {
  return [
    item.genreIds.length > 0 ? 1 : 0,
    item.keywords.length > 0 ? 2 : 0,
    item.cast.length > 0 ? 1 : 0,
    item.directors.length > 0 || item.creators.length > 0 ? 2 : 0,
    item.runtime ? 1 : 0,
    item.overview.length > 120 ? 1 : 0,
  ].reduce((acc, value) => acc + value, 0);
}

export function getContentKey(type: ContentType, id: number): string {
  return `${type}_${id}`;
}

function mergeSourceTags(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

export function mergeNormalizedItems(
  base: UnifiedContentItem,
  incoming: UnifiedContentItem,
): UnifiedContentItem {
  const keepIncoming = itemRichness(incoming) >= itemRichness(base);
  const preferred = keepIncoming ? incoming : base;
  const fallback = keepIncoming ? base : incoming;

  return {
    ...preferred,
    title: preferred.title || fallback.title,
    overview: preferred.overview || fallback.overview,
    originalTitle: preferred.originalTitle || fallback.originalTitle,
    genreIds:
      preferred.genreIds.length >= fallback.genreIds.length
        ? preferred.genreIds
        : fallback.genreIds,
    releaseDate: preferred.releaseDate || fallback.releaseDate,
    year: preferred.year ?? fallback.year,
    runtime: preferred.runtime ?? fallback.runtime,
    keywords:
      preferred.keywords.length >= fallback.keywords.length
        ? preferred.keywords
        : fallback.keywords,
    keywordTokens:
      preferred.keywordTokens.length >= fallback.keywordTokens.length
        ? preferred.keywordTokens
        : fallback.keywordTokens,
    cast: preferred.cast.length >= fallback.cast.length ? preferred.cast : fallback.cast,
    directors:
      preferred.directors.length >= fallback.directors.length
        ? preferred.directors
        : fallback.directors,
    creators:
      preferred.creators.length >= fallback.creators.length
        ? preferred.creators
        : fallback.creators,
    leadActors:
      preferred.leadActors.length >= fallback.leadActors.length
        ? preferred.leadActors
        : fallback.leadActors,
    peopleIds:
      preferred.peopleIds.length >= fallback.peopleIds.length
        ? preferred.peopleIds
        : fallback.peopleIds,
    primaryGenreId: preferred.primaryGenreId ?? fallback.primaryGenreId,
    collectionId: preferred.collectionId ?? fallback.collectionId,
    voteAverage: Math.max(preferred.voteAverage, fallback.voteAverage),
    voteCount: Math.max(preferred.voteCount, fallback.voteCount),
    popularity: Math.max(preferred.popularity, fallback.popularity),
    sourceTags: mergeSourceTags(base.sourceTags, incoming.sourceTags),
    raw: preferred.raw ?? fallback.raw,
  };
}

export function normalizeTmdbItem(
  raw: unknown,
  options: { typeHint?: ContentType; sourceTag?: string; useCache?: boolean } = {},
): UnifiedContentItem | null {
  if (!isObject(raw)) return null;

  const type = detectType(raw, options.typeHint);
  const id = asNumber(raw.id);
  if (!type || !id) return null;

  const key = getContentKey(type, id);
  const title =
    (type === "movie"
      ? asString(raw.title) || asString(raw.original_title) || asString(raw.name)
      : asString(raw.name) || asString(raw.original_name) || asString(raw.title)) ||
    "Untitled";

  const overview = asString(raw.overview) || "";
  const releaseDate =
    (type === "movie" ? asString(raw.release_date) : asString(raw.first_air_date)) ||
    asString(raw.release_date) ||
    asString(raw.first_air_date);

  const genres = normalizeGenres(raw);
  const keywords = normalizeKeywords(raw);
  const castSource = raw.cast ?? (isObject(raw.credits) ? raw.credits.cast : undefined);
  const cast = normalizePeople(castSource, MAX_CAST_COUNT);
  const directors = normalizeDirectors(raw);
  const creators = normalizeCreators(raw);
  const leadActors = cast.slice(0, MAX_LEAD_COUNT);

  const peopleIds = uniqueNumbers([
    ...leadActors.map((person) => person.id),
    ...directors.map((person) => person.id),
    ...creators.map((person) => person.id),
  ]);

  const keywordTokens = uniqueTokens(
    keywords.length > 0
      ? tokenizeText(keywords.map((keyword) => keyword.name).join(" "))
      : tokenizeText(`${title} ${overview}`),
  );

  const sourceTags = options.sourceTag ? [options.sourceTag] : [];

  const normalized: UnifiedContentItem = {
    type,
    id,
    key,
    title,
    overview,
    originalTitle: asString(raw.original_title) || asString(raw.original_name),
    genreIds: genres,
    releaseDate,
    year: parseYearFromDate(releaseDate),
    voteAverage: asNumber(raw.vote_average) ?? 0,
    voteCount: asNumber(raw.vote_count) ?? 0,
    popularity: asNumber(raw.popularity) ?? 0,
    runtime: normalizeRuntime(raw, type),
    keywords,
    keywordTokens,
    cast,
    directors,
    creators,
    leadActors,
    peopleIds,
    primaryGenreId: genres[0] ?? null,
    collectionId: asNumber((raw.belongs_to_collection as AnyRecord | undefined)?.id) ?? null,
    originalLanguage: asString(raw.original_language),
    sourceTags,
    raw,
  };

  const useCache = options.useCache !== false;
  if (!useCache) return normalized;

  const existing = normalizedFeatureCache.get(key);
  if (!existing) {
    normalizedFeatureCache.set(key, normalized);
    return normalized;
  }

  const merged = mergeNormalizedItems(existing, normalized);
  normalizedFeatureCache.set(key, merged);
  return merged;
}

export function normalizeTmdbItems(
  items: unknown[] | undefined | null,
  options: { typeHint?: ContentType; sourceTag?: string; useCache?: boolean } = {},
): UnifiedContentItem[] {
  if (!items?.length) return [];

  return items
    .map((item) => normalizeTmdbItem(item, options))
    .filter((item): item is UnifiedContentItem => item !== null);
}

export function addSourceTag(item: UnifiedContentItem, sourceTag: string): UnifiedContentItem {
  if (!sourceTag) return item;

  const updated = {
    ...item,
    sourceTags: mergeSourceTags(item.sourceTags, [sourceTag]),
  };

  normalizedFeatureCache.set(item.key, updated);
  return updated;
}

export function clearRecommendationFeatureCache(): void {
  normalizedFeatureCache.clear();
}

export function ensureContentKey(value: {
  type: ContentType;
  id: number;
}): string {
  return getContentKey(value.type, value.id);
}
