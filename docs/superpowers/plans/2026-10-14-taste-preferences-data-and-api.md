# Taste Preferences: Data and API (sub-project 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store and serve the new taste preference fields (disliked genres, seed titles, moods, pace, eras) through `/api/user/preferences` and the client types, with strict validation.

**Architecture:** One browser-safe shared module owns the allowed values, types and a pure validator. The existing preferences handler calls it, reconciles liked-vs-disliked genres, stores the fields, marks the taste profile stale, and returns defaults for old accounts. Client types are widened to match. The engine, UI and Home adaptation are later sub-projects (plans 2-4) and are not touched here.

**Tech Stack:** TypeScript, Next.js route handlers (Vercel-style `req/res`), MongoDB driver, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-taste-preferences-and-engine-design.md` (section 1)

## Global Constraints

- New fields and limits, verbatim from the spec: `disliked_genres` max 12, positive integers, de-duplicated, may not overlap `preferred_genres` (preferred wins); `seed_titles` max 12, de-duplicated by `content_type:content_id`, each `{ content_id, content_type: "movie"|"tv", title (max 220, single line), poster_path (string max 300 or null), genres (max 24), language? (2-3 letters) }`; `moods` subset of `feel_good, dark, mind_bending, emotional, funny, intense`, max 6; `pace` one of `slow_burn, balanced, fast` or null; `eras` subset of `classics, nineties_2000s, modern, new`, max 4.
- `GET` defaults every new field to `[]` / `null`; old accounts keep working.
- `PUT` accepts any subset; a non-array list or a bad `pace` is 400 `Invalid preference payload format`; no recognised field is 400 `At least one preference field is required`; existing rate limits unchanged.
- A successful write marks the taste profile stale (`markTasteProfileStale`).
- The shared module must be browser-safe (no `server-only`, no Node APIs, no backend imports).
- Do not touch unrelated user work: `src/backend/services/watchSources/`, `src/app/api/`, `src/shared/types/watchSources.ts`, `docs/watch-source-importer.md`, `.env.example`, `vercel.json`, `package.json`, `package-lock.json`, `README.md`.
- `vitest run`, `tsc --noEmit`, `eslint src` stay clean after every task. Commit only if the user asked.

## Review Focus

- A legacy preferences document with none of the new fields must return defaults and accept a PUT of the old two fields (Task 2 tests).
- Partial update that makes liked and disliked overlap: PUT `preferred_genres` containing a genre already disliked, and PUT `disliked_genres` containing an already-liked genre; preferred must win both ways (Task 2 tests).
- `pace: null` clears the stored pace, while omitting `pace` leaves it unchanged (Task 1 and Task 2 tests).
- Hostile or sloppy seed titles: newlines, 10k-character titles, non-numeric ids, duplicate picks, bad `poster_path` such as `https://evil` or `../x` (Task 1 tests).
- Oversized or duplicated lists: 500 genre ids, 40 seeds, repeated moods (Task 1 tests).

---

## File Structure

- `src/shared/lib/recommendation/preferences.ts` (create): constants, types, `parseTastePreferenceFields`, `reconcileGenres`.
- `src/shared/lib/recommendation/preferences.test.ts` (create).
- `src/shared/lib/recommendation/index.ts` (modify): re-export.
- `src/backend/api/_handlers/user/preferences.ts` (modify): GET/PUT use the shared module, stale marking.
- `src/backend/api/_handlers/user/preferences.test.ts` (modify): new tests, mock `markTasteProfileStale`.
- `src/frontend/lib/mongodbClient.ts` (modify `UserPreferences`), `src/frontend/hooks/useUserData.tsx` (modify types).

---

### Task 1: Shared preference module

**Files:**
- Create: `src/shared/lib/recommendation/preferences.ts`
- Create: `src/shared/lib/recommendation/preferences.test.ts`
- Modify: `src/shared/lib/recommendation/index.ts`

**Interfaces:**
- Produces:
  - `MOODS`, `PACES`, `ERAS` (readonly tuples) and types `Mood`, `Pace`, `Era`
  - `interface SeedTitle { content_id: number; content_type: "movie" | "tv"; title: string; poster_path: string | null; genres: number[]; language?: string }`
  - `interface TastePreferenceExtras { disliked_genres: number[]; seed_titles: SeedTitle[]; moods: Mood[]; pace: Pace | null; eras: Era[] }`
  - `type TastePreferenceUpdate = Partial<TastePreferenceExtras>`
  - `parseTastePreferenceFields(body: unknown): { ok: true; updates: TastePreferenceUpdate } | { ok: false }`
  - `reconcileGenres(preferred: number[], disliked: number[]): number[]` (returns disliked without anything preferred)
  - limits `MAX_DISLIKED_GENRES = 12`, `MAX_SEED_TITLES = 12`, `MAX_MOODS = 6`, `MAX_ERAS = 4`

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/lib/recommendation/preferences.test.ts
import { describe, expect, it } from "vitest";
import {
  ERAS,
  MOODS,
  PACES,
  parseTastePreferenceFields,
  reconcileGenres,
} from "./preferences";

const seed = (overrides: Record<string, unknown> = {}) => ({
  content_id: 603,
  content_type: "movie",
  title: "The Matrix",
  poster_path: "/abc.jpg",
  genres: [28, 878],
  language: "en",
  ...overrides,
});

function ok(body: unknown) {
  const result = parseTastePreferenceFields(body);
  if (!result.ok) throw new Error("expected ok");
  return result.updates;
}

describe("parseTastePreferenceFields", () => {
  it("returns no updates when no new field is present", () => {
    expect(ok({ preferred_genres: [28] })).toEqual({});
    expect(ok(undefined)).toEqual({});
  });

  it("exposes the allowed values", () => {
    expect(MOODS).toEqual(["feel_good", "dark", "mind_bending", "emotional", "funny", "intense"]);
    expect(PACES).toEqual(["slow_burn", "balanced", "fast"]);
    expect(ERAS).toEqual(["classics", "nineties_2000s", "modern", "new"]);
  });

  describe("disliked_genres", () => {
    it("keeps unique positive integers, drops junk", () => {
      expect(ok({ disliked_genres: [27, "27", 27.5, -1, 0, "abc", 53] }).disliked_genres).toEqual([27, 53]);
    });

    it("caps at 12", () => {
      const ids = Array.from({ length: 500 }, (_, i) => i + 1);
      expect(ok({ disliked_genres: ids }).disliked_genres).toHaveLength(12);
    });

    it("rejects a non-array", () => {
      expect(parseTastePreferenceFields({ disliked_genres: "27" })).toEqual({ ok: false });
    });
  });

  describe("seed_titles", () => {
    it("normalizes a valid seed", () => {
      expect(ok({ seed_titles: [seed()] }).seed_titles).toEqual([
        { content_id: 603, content_type: "movie", title: "The Matrix", poster_path: "/abc.jpg", genres: [28, 878], language: "en" },
      ]);
    });

    it("drops invalid seeds and keeps valid ones", () => {
      const result = ok({
        seed_titles: [
          seed({ content_id: "x" }),
          seed({ content_id: 0 }),
          seed({ content_type: "person" }),
          seed({ title: "   " }),
          seed({ content_id: 11 }),
        ],
      }).seed_titles;
      expect(result?.map((s) => s.content_id)).toEqual([11]);
    });

    it("collapses newlines and control characters and caps the title at 220", () => {
      const [first] = ok({ seed_titles: [seed({ title: `Line one\nLine\ttwo\u0000${"x".repeat(10_000)}` })] }).seed_titles!;
      expect(first.title.startsWith("Line one Line two")).toBe(true);
      expect(first.title).not.toMatch(/[\n\t\u0000]/);
      expect(first.title.length).toBeLessThanOrEqual(220);
    });

    it("only accepts TMDB-style poster paths", () => {
      const paths = ["/ok_1.jpg", "https://evil.example/x.jpg", "../x.jpg", "/a/b.jpg", `/${"a".repeat(400)}.jpg`, 42, undefined];
      const result = ok({ seed_titles: paths.map((p, i) => seed({ content_id: i + 1, poster_path: p })) }).seed_titles!;
      expect(result.map((s) => s.poster_path)).toEqual(["/ok_1.jpg", null, null, null, null, null, null]);
    });

    it("sanitizes genres and language", () => {
      const [first] = ok({ seed_titles: [seed({ genres: [28, "28", -3, "x", ...Array.from({ length: 40 }, (_, i) => 1000 + i)], language: "EN" })] }).seed_titles!;
      expect(first.genres).toHaveLength(24);
      expect(first.genres.slice(0, 1)).toEqual([28]);
      expect(first.language).toBe("en");
      const [bad] = ok({ seed_titles: [seed({ language: "english!" })] }).seed_titles!;
      expect(bad.language).toBeUndefined();
    });

    it("de-duplicates by type and id, and caps at 12", () => {
      const duplicates = ok({ seed_titles: [seed(), seed(), seed({ content_type: "tv" })] }).seed_titles!;
      expect(duplicates.map((s) => `${s.content_type}:${s.content_id}`)).toEqual(["movie:603", "tv:603"]);
      const many = Array.from({ length: 40 }, (_, i) => seed({ content_id: i + 1 }));
      expect(ok({ seed_titles: many }).seed_titles).toHaveLength(12);
    });

    it("rejects a non-array", () => {
      expect(parseTastePreferenceFields({ seed_titles: {} })).toEqual({ ok: false });
    });
  });

  describe("moods and eras", () => {
    it("keeps only allowed values, de-duplicated", () => {
      expect(ok({ moods: ["dark", "dark", "sad", "funny"] }).moods).toEqual(["dark", "funny"]);
      expect(ok({ eras: ["new", "new", "future", "classics"] }).eras).toEqual(["new", "classics"]);
    });

    it("rejects non-arrays", () => {
      expect(parseTastePreferenceFields({ moods: "dark" })).toEqual({ ok: false });
      expect(parseTastePreferenceFields({ eras: 1 })).toEqual({ ok: false });
    });
  });

  describe("pace", () => {
    it("accepts allowed values and null (null clears)", () => {
      expect(ok({ pace: "fast" }).pace).toBe("fast");
      expect(ok({ pace: null })).toEqual({ pace: null });
    });

    it("leaves pace out of the update when omitted", () => {
      expect("pace" in ok({ moods: [] })).toBe(false);
    });

    it("rejects anything else", () => {
      expect(parseTastePreferenceFields({ pace: "warp" })).toEqual({ ok: false });
      expect(parseTastePreferenceFields({ pace: 3 })).toEqual({ ok: false });
    });
  });
});

describe("reconcileGenres", () => {
  it("drops disliked genres that are also preferred", () => {
    expect(reconcileGenres([28, 35], [28, 27, 35, 53])).toEqual([27, 53]);
  });

  it("returns disliked unchanged when there is no overlap", () => {
    expect(reconcileGenres([28], [27])).toEqual([27]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/lib/recommendation/preferences.test.ts`
Expected: FAIL (module `./preferences` not found).

- [ ] **Step 3: Implement the module**

```ts
// src/shared/lib/recommendation/preferences.ts
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
 * Validates only the new taste fields. A field that is absent is left out of
 * the update; a field of the wrong shape fails the whole payload.
 */
export function parseTastePreferenceFields(body: unknown): TastePreferenceParseResult {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const updates: TastePreferenceUpdate = {};

  if (source.disliked_genres !== undefined) {
    if (!Array.isArray(source.disliked_genres)) return { ok: false };
    updates.disliked_genres = positiveIntegers(source.disliked_genres, MAX_DISLIKED_GENRES);
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
    updates.seed_titles = seeds;
  }

  if (source.moods !== undefined) {
    if (!Array.isArray(source.moods)) return { ok: false };
    updates.moods = allowedValues(source.moods, MOODS, MAX_MOODS);
  }

  if (source.pace !== undefined) {
    if (source.pace !== null && !(PACES as readonly unknown[]).includes(source.pace)) return { ok: false };
    updates.pace = source.pace as Pace | null;
  }

  if (source.eras !== undefined) {
    if (!Array.isArray(source.eras)) return { ok: false };
    updates.eras = allowedValues(source.eras, ERAS, MAX_ERAS);
  }

  return { ok: true, updates };
}

/** Liked beats disliked: a genre that is preferred can never also be disliked. */
export function reconcileGenres(preferred: number[], disliked: number[]): number[] {
  const liked = new Set(preferred);
  return disliked.filter((genreId) => !liked.has(genreId));
}
```

- [ ] **Step 4: Re-export**

Append to `src/shared/lib/recommendation/index.ts`:

```ts
export * from "./preferences";
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/shared/lib/recommendation/preferences.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean. If `tsc` reports a name collision from the new re-export, rename the colliding export in `preferences.ts` (not the existing one) and update the test.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/shared/lib/recommendation/preferences.ts src/shared/lib/recommendation/preferences.test.ts src/shared/lib/recommendation/index.ts
git commit -m "feat: shared taste preference types and validator"
```

---

### Task 2: Preferences handler

**Files:**
- Modify: `src/backend/api/_handlers/user/preferences.ts`
- Modify: `src/backend/api/_handlers/user/preferences.test.ts`

**Interfaces:**
- Consumes: `parseTastePreferenceFields`, `reconcileGenres`, `TastePreferenceExtras` from `@/shared/lib/recommendation/preferences`; `markTasteProfileStale(db, userId)` from `@/backend/services/recommendationTaste`.
- Produces: GET/PUT response `data` shape gains `disliked_genres`, `seed_titles`, `moods`, `pace`, `eras`.

- [ ] **Step 1: Write the failing tests**

In `preferences.test.ts` add to the hoisted `mocks` object `markTasteProfileStale: vi.fn()`, add this mock below the other `vi.mock` calls, and reset it in `beforeEach` (`mocks.markTasteProfileStale.mockResolvedValue(undefined);`):

```ts
vi.mock("@/backend/services/recommendationTaste", () => ({
  markTasteProfileStale: mocks.markTasteProfileStale,
}));
```

Append these tests inside the existing `describe`:

```ts
  const baseDoc = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => "pref-1" },
    user_id: "user-1",
    preferred_languages: ["en"],
    preferred_genres: [28],
    inferred_languages: [],
    inferred_genres: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  function mockPut(existing: Record<string, unknown> | null) {
    const updateOne = vi.fn(async () => ({ acknowledged: true }));
    const findOne = vi.fn(async () => existing);
    mocks.connectToDatabase.mockResolvedValue({
      db: { collection: vi.fn(() => ({ updateOne, findOne })) },
    });
    return { updateOne, findOne };
  }

  async function put(body: unknown) {
    const res = createResponse();
    await handler({ method: "PUT", headers: {}, body } as any, res);
    return res;
  }

  it("returns defaults for the new fields on a legacy document", async () => {
    mocks.connectToDatabase.mockResolvedValue({
      db: { collection: vi.fn(() => ({ findOneAndUpdate: vi.fn(async () => baseDoc()) })) },
    });
    const res = createResponse();
    await handler({ method: "GET", headers: {} } as any, res);
    expect(res.body).toMatchObject({
      data: { disliked_genres: [], seed_titles: [], moods: [], pace: null, eras: [] },
    });
  });

  it("stores the new fields, returns them and marks the profile stale", async () => {
    const stored = baseDoc({ disliked_genres: [27], moods: ["dark"], pace: "slow_burn", eras: ["modern"] });
    const { updateOne, findOne } = mockPut(baseDoc());
    findOne.mockResolvedValueOnce(baseDoc()).mockResolvedValueOnce(stored);

    const res = await put({ disliked_genres: [27], moods: ["dark"], pace: "slow_burn", eras: ["modern"] });

    expect(res.statusCode).toBe(200);
    const update = (updateOne.mock.calls[0] as unknown as [unknown, Record<string, Record<string, unknown>>])[1];
    expect(update.$set).toMatchObject({ disliked_genres: [27], moods: ["dark"], pace: "slow_burn", eras: ["modern"] });
    expect(update.$setOnInsert).not.toHaveProperty("moods");
    expect(update.$setOnInsert).toHaveProperty("seed_titles", []);
    expect(res.body).toMatchObject({ data: { disliked_genres: [27], moods: ["dark"], pace: "slow_burn" } });
    expect(mocks.markTasteProfileStale).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("accepts a PUT with only new fields", async () => {
    mockPut(baseDoc());
    expect((await put({ moods: ["funny"] })).statusCode).toBe(200);
  });

  it("rejects an empty body and malformed new fields", async () => {
    mockPut(baseDoc());
    expect((await put({})).statusCode).toBe(400);
    expect((await put({ moods: "dark" })).statusCode).toBe(400);
    expect((await put({ pace: "warp" })).statusCode).toBe(400);
    expect((await put({ seed_titles: {} })).statusCode).toBe(400);
  });

  it("pace null clears the pace; omitting pace leaves it out of the update", async () => {
    const { updateOne } = mockPut(baseDoc({ pace: "fast" }));
    await put({ pace: null });
    expect((updateOne.mock.calls[0] as any)[1].$set).toHaveProperty("pace", null);

    updateOne.mockClear();
    await put({ moods: ["dark"] });
    expect((updateOne.mock.calls[0] as any)[1].$set).not.toHaveProperty("pace");
  });

  it("liked wins: a preferred genre that is already disliked is removed from dislikes", async () => {
    const { updateOne } = mockPut(baseDoc({ disliked_genres: [28, 35] }));
    await put({ preferred_genres: [28, 12] });
    expect((updateOne.mock.calls[0] as any)[1].$set).toMatchObject({
      preferred_genres: [28, 12],
      disliked_genres: [35],
    });
  });

  it("liked wins: disliking an already preferred genre drops it", async () => {
    const { updateOne } = mockPut(baseDoc({ preferred_genres: [28] }));
    await put({ disliked_genres: [28, 27] });
    expect((updateOne.mock.calls[0] as any)[1].$set).toMatchObject({ disliked_genres: [27] });
  });

  it("does not rewrite dislikes when nothing overlaps", async () => {
    const { updateOne } = mockPut(baseDoc({ disliked_genres: [27] }));
    await put({ preferred_genres: [28, 12] });
    expect((updateOne.mock.calls[0] as any)[1].$set).not.toHaveProperty("disliked_genres");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/backend/api/_handlers/user/preferences.test.ts`
Expected: the new tests FAIL (new fields not returned/stored); the three original tests still pass.

- [ ] **Step 3: Implement**

Replace the imports block at the top of `preferences.ts` with:

```ts
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { sanitizeLanguageCode } from "../../lib/input.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";
import { markTasteProfileStale } from "@/backend/services/recommendationTaste";
import {
  parseTastePreferenceFields,
  reconcileGenres,
  type TastePreferenceExtras,
} from "@/shared/lib/recommendation/preferences";
```

Add this helper above `export default async function handler`:

```ts
const EXTRA_DEFAULTS: TastePreferenceExtras = {
  disliked_genres: [],
  seed_titles: [],
  moods: [],
  pace: null,
  eras: [],
};

function serializePreferences(prefs: Record<string, any> | null | undefined, userId: string) {
  return {
    id: prefs?._id?.toString(),
    user_id: prefs?.user_id ?? userId,
    preferred_languages: prefs?.preferred_languages || [],
    preferred_genres: prefs?.preferred_genres || [],
    inferred_languages: prefs?.inferred_languages || [],
    inferred_genres: prefs?.inferred_genres || [],
    disliked_genres: prefs?.disliked_genres || EXTRA_DEFAULTS.disliked_genres,
    seed_titles: prefs?.seed_titles || EXTRA_DEFAULTS.seed_titles,
    moods: prefs?.moods || EXTRA_DEFAULTS.moods,
    pace: prefs?.pace ?? EXTRA_DEFAULTS.pace,
    eras: prefs?.eras || EXTRA_DEFAULTS.eras,
    created_at: prefs?.created_at,
    updated_at: prefs?.updated_at,
  };
}
```

In the `GET` branch, replace the `$setOnInsert` object's content so it also seeds the new defaults (add `...EXTRA_DEFAULTS,` after `inferred_genres: [],`) and replace the final `return res.status(200).json({ data: { ... } })` with:

```ts
      return res.status(200).json({ data: serializePreferences(prefs, user.id) });
```

Replace the entire `PUT` branch body (from `const body = req.body || {};` to its closing `return res.status(200).json({ data: {...} });`) with:

```ts
      const body = req.body || {};
      const preferredLanguages = normalizeLanguages(body.preferred_languages);
      const preferredGenres = normalizeGenres(body.preferred_genres);
      const extras = parseTastePreferenceFields(body);

      if (
        !extras.ok ||
        (body.preferred_languages !== undefined && preferredLanguages === null) ||
        (body.preferred_genres !== undefined && preferredGenres === null)
      ) {
        return res.status(400).json({ error: "Invalid preference payload format" });
      }

      if (
        preferredLanguages === null &&
        preferredGenres === null &&
        Object.keys(extras.updates).length === 0
      ) {
        return res.status(400).json({ error: "At least one preference field is required" });
      }

      const collection = db.collection("user_preferences");
      const existing = await collection.findOne({ user_id: user.id });

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updated_at: now, ...extras.updates };
      const insertDefaults: Record<string, unknown> = {
        user_id: user.id,
        inferred_languages: [],
        inferred_genres: [],
        created_at: now,
      };
      if (preferredLanguages !== null) updates.preferred_languages = preferredLanguages;
      else insertDefaults.preferred_languages = [];
      if (preferredGenres !== null) updates.preferred_genres = preferredGenres;
      else insertDefaults.preferred_genres = [];

      // Liked beats disliked, whichever list this request touched.
      const finalPreferred =
        preferredGenres ?? ((existing?.preferred_genres as number[] | undefined) || []);
      const requestedDisliked =
        extras.updates.disliked_genres ??
        ((existing?.disliked_genres as number[] | undefined) || []);
      const reconciled = reconcileGenres(finalPreferred, requestedDisliked);
      if (
        extras.updates.disliked_genres !== undefined ||
        reconciled.length !== requestedDisliked.length
      ) {
        updates.disliked_genres = reconciled;
      }

      for (const [field, value] of Object.entries(EXTRA_DEFAULTS)) {
        if (!(field in updates)) insertDefaults[field] = value;
      }

      await collection.updateOne(
        { user_id: user.id },
        { $set: updates, $setOnInsert: insertDefaults },
        { upsert: true },
      );

      await markTasteProfileStale(db, user.id).catch((error) => {
        console.error("Failed to mark taste profile stale:", error);
      });

      const prefs = await collection.findOne({ user_id: user.id });
      return res.status(200).json({ data: serializePreferences(prefs, user.id) });
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/backend/api/_handlers/user/preferences.test.ts`
Expected: PASS (original 3 + 8 new). If a pre-existing test fails because it now calls `findOne` before `updateOne`, add a `findOne` mock to that test (the second original test already has one).

- [ ] **Step 5: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/backend/api/_handlers/user/preferences.ts src/backend/api/_handlers/user/preferences.test.ts
git commit -m "feat: preferences API stores seeds, dislikes, moods, pace and eras"
```

---

### Task 3: Client types

**Files:**
- Modify: `src/frontend/lib/mongodbClient.ts:209-216`
- Modify: `src/frontend/hooks/useUserData.tsx:43-50` and `:95`, `:570-573`

**Interfaces:**
- Consumes: `SeedTitle`, `Mood`, `Pace`, `Era`, `TastePreferenceUpdate` from `@/shared/lib/recommendation/preferences`.
- Produces: `UserPreferences` (both files) with optional new fields; `updatePreferences` accepts `PreferenceUpdate = { preferred_languages?: string[]; preferred_genres?: number[] } & TastePreferenceUpdate`.

- [ ] **Step 1: Widen `UserPreferences` in `mongodbClient.ts`**

Add the import near the top of the file:

```ts
import type { Era, Mood, Pace, SeedTitle } from "@/shared/lib/recommendation/preferences";
```

Replace the `UserPreferences` interface with:

```ts
export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_languages: string[];
  preferred_genres: number[];
  inferred_languages?: string[];
  inferred_genres?: number[];
  disliked_genres?: number[];
  seed_titles?: SeedTitle[];
  moods?: Mood[];
  pace?: Pace | null;
  eras?: Era[];
}
```

(`updateUserPreferences(prefs: Partial<UserPreferences>)` already accepts the new keys.)

- [ ] **Step 2: Widen the hook types in `useUserData.tsx`**

Add the import:

```ts
import type { Era, Mood, Pace, SeedTitle } from "@/shared/lib/recommendation/preferences";
```

Replace the `UserPreferences` interface with the same fields as above, and add above it:

```ts
export type PreferenceUpdate = Partial<
  Pick<
    UserPreferences,
    | "preferred_languages"
    | "preferred_genres"
    | "disliked_genres"
    | "seed_titles"
    | "moods"
    | "pace"
    | "eras"
  >
>;
```

Change the context type `updatePreferences: (prefs: { preferred_languages?: string[]; preferred_genres?: number[] }) => Promise<UserPreferences>;` to `updatePreferences: (prefs: PreferenceUpdate) => Promise<UserPreferences>;` and the `useCallback` parameter `async (prefs: { preferred_languages?: string[]; preferred_genres?: number[] }) => {` to `async (prefs: PreferenceUpdate) => {`.

- [ ] **Step 3: Checks**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src`
Expected: clean (existing callers pass the two old fields, which stay valid).

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add src/frontend/lib/mongodbClient.ts src/frontend/hooks/useUserData.tsx
git commit -m "feat: client types for new taste preference fields"
```

---

### Task 4: Verification

**Files:** none modified.

- [ ] **Step 1: Whole-suite run**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: all clean; new tests present (`preferences.test.ts` in shared and handler).

- [ ] **Step 2: Live contract check against a local dev server**

Start the dev server (`npx next dev --webpack -p 3111`) only if a Mongo connection is configured in `.env`; otherwise skip and say so in the report. With a signed-in session cookie, `curl` `PUT /api/user/preferences` with `{"moods":["dark"],"pace":"fast"}` and `GET` it back; confirm both fields round-trip and `preferred_*` are untouched.

- [ ] **Step 3: Report**

Summarize tasks done, test counts, whether the live check ran, and that plans 2-4 (engine, preference screen, adaptation) are next. Do not commit unless asked.
