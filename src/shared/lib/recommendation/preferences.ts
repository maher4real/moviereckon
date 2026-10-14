export const MOODS = ["feel_good", "dark", "mind_bending", "emotional", "funny", "intense"] as const;
export const PACES = ["slow_burn", "balanced", "fast"] as const;
export const ERAS = ["classics", "nineties_2000s", "modern", "new"] as const;

export type Mood = (typeof MOODS)[number];
export type Pace = (typeof PACES)[number];
export type Era = (typeof ERAS)[number];

export const MAX_DISLIKED_GENRES = 12;
export const MAX_SEED_TITLES = 12;
export const MAX_MOODS = 6;
export const MAX_ERAS = 4;

const MAX_SEED_TITLE_LENGTH = 220;
const MAX_SEED_GENRES = 24;
const MAX_POSTER_PATH_LENGTH = 300;
const POSTER_PATH_PATTERN = /^\/[A-Za-z0-9._-]+$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}$/;

export interface SeedTitle {
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres: number[];
  language?: string;
}

export interface TastePreferenceExtras {
  disliked_genres: number[];
  seed_titles: SeedTitle[];
  moods: Mood[];
  pace: Pace | null;
  eras: Era[];
}

export type TastePreferenceUpdate = Partial<TastePreferenceExtras>;

export type TastePreferenceParseResult =
  | { ok: true; updates: TastePreferenceUpdate }
  | { ok: false };

function positiveIntegers(values: unknown[], max: number): number[] {
  const result: number[] = [];
  for (const value of values) {
    const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isInteger(numeric) && numeric > 0 && !result.includes(numeric)) {
      result.push(numeric);
      if (result.length >= max) break;
    }
  }
  return result;
}

function allowedValues<T extends string>(values: unknown[], allowed: readonly T[], max: number): T[] {
  const result: T[] = [];
  for (const value of values) {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value) && !result.includes(value as T)) {
      result.push(value as T);
      if (result.length >= max) break;
    }
  }
  return result;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEED_TITLE_LENGTH)
    .trim();
  return cleaned || null;
}

function parseSeed(value: unknown): SeedTitle | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const contentId = typeof raw.content_id === "number" || typeof raw.content_id === "string" ? Number(raw.content_id) : Number.NaN;
  if (!Number.isInteger(contentId) || contentId <= 0) return null;
  if (raw.content_type !== "movie" && raw.content_type !== "tv") return null;
  const title = cleanTitle(raw.title);
  if (!title) return null;

  const poster =
    typeof raw.poster_path === "string" &&
    raw.poster_path.length <= MAX_POSTER_PATH_LENGTH &&
    POSTER_PATH_PATTERN.test(raw.poster_path)
      ? raw.poster_path
      : null;
  const genres = Array.isArray(raw.genres) ? positiveIntegers(raw.genres, MAX_SEED_GENRES) : [];
  const language = typeof raw.language === "string" ? raw.language.trim().toLowerCase() : "";

  return {
    content_id: contentId,
    content_type: raw.content_type,
    title,
    poster_path: poster,
    genres,
    ...(LANGUAGE_PATTERN.test(language) ? { language } : {}),
  };
}

/**
 * A non-empty list that yields nothing valid is a client bug, not a request to
 * clear the field. An explicit empty list still clears it.
 */
function isGarbled(input: unknown, kept: unknown[]): boolean {
  return Array.isArray(input) && input.length > 0 && kept.length === 0;
}

/**
 * Validates only the new taste fields. A field that is absent is left out of
 * the update; a field of the wrong shape fails the whole payload.
 */
export function parseTastePreferenceFields(body: unknown): TastePreferenceParseResult {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const updates: TastePreferenceUpdate = {};

  if (source.disliked_genres !== undefined) {
    if (!Array.isArray(source.disliked_genres)) return { ok: false };
    const disliked = positiveIntegers(source.disliked_genres, MAX_DISLIKED_GENRES);
    if (isGarbled(source.disliked_genres, disliked)) return { ok: false };
    updates.disliked_genres = disliked;
  }

  if (source.seed_titles !== undefined) {
    if (!Array.isArray(source.seed_titles)) return { ok: false };
    const seeds: SeedTitle[] = [];
    const seen = new Set<string>();
    for (const item of source.seed_titles) {
      const seed = parseSeed(item);
      if (!seed) continue;
      const key = `${seed.content_type}:${seed.content_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push(seed);
      if (seeds.length >= MAX_SEED_TITLES) break;
    }
    if (isGarbled(source.seed_titles, seeds)) return { ok: false };
    updates.seed_titles = seeds;
  }

  if (source.moods !== undefined) {
    if (!Array.isArray(source.moods)) return { ok: false };
    const moods = allowedValues(source.moods, MOODS, MAX_MOODS);
    if (isGarbled(source.moods, moods)) return { ok: false };
    updates.moods = moods;
  }

  if (source.pace !== undefined) {
    if (source.pace !== null && !(PACES as readonly unknown[]).includes(source.pace)) return { ok: false };
    updates.pace = source.pace as Pace | null;
  }

  if (source.eras !== undefined) {
    if (!Array.isArray(source.eras)) return { ok: false };
    const eras = allowedValues(source.eras, ERAS, MAX_ERAS);
    if (isGarbled(source.eras, eras)) return { ok: false };
    updates.eras = eras;
  }

  return { ok: true, updates };
}

/** Liked beats disliked: a genre that is preferred can never also be disliked. */
export function reconcileGenres(preferred: number[], disliked: number[]): number[] {
  const liked = new Set(preferred);
  return disliked.filter((genreId) => !liked.has(genreId));
}
