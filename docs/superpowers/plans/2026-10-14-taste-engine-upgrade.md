# Taste Engine Upgrade (sub-project 2 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reckon rank accurately on little data by using seed titles, disliked genres, moods, pace and era, a cold-start confidence ramp and a smoothed rating prior, and prove the gain with an offline measurement.

**Architecture:** New signals enter through `TastePreferences` into `buildTasteProfile` (seeds become `seed` evidence, dislikes become negative weights, moods/eras/pace go into a new optional `profile.tone`). Pure helpers live in one new module (`coldStart.ts`). `scoreCandidate` and `hardFilter` in the v2 handler consume them; candidate retrieval adds a seed source and excludes disliked genres from discover queries. All new profile fields are optional so stored profiles and existing fixtures keep working.

**Tech Stack:** TypeScript, Vitest, existing recommendation modules under `src/shared/lib/recommendation/` and `src/backend/`.

**Spec:** `docs/superpowers/specs/2026-10-14-taste-preferences-and-engine-design.md` (section 2). Depends on plan 1 (`2026-10-14-taste-preferences-data-and-api.md`), already implemented: `SeedTitle`, `Mood`, `Pace`, `Era` from `@/shared/lib/recommendation/preferences`, and `user_preferences` fields `disliked_genres`, `seed_titles`, `moods`, `pace`, `eras`.

## Global Constraints

- Constants verbatim from the spec: seed evidence signal `seed`, weight 3, never recency-decayed; disliked genres add 3.0 each to `profile.negative.genres`; mood boost +0.8 per mood-genre capped at 1.6 per genre; mood term `boundedMood * 0.10`; era term `+0.06` when the item's year is inside a selected era; pace term weight `0.04`, only when runtime is known (slow_burn favours runtime 110 or more, fast favours runtime 100 or less, balanced neutral); `confidence = min(1, activityEvidenceCount / 12)` where seed evidence is not counted; `prefMultiplier = 1 + (1 - confidence) * 0.8`; smoothed rating `(v/(v+300))*R + (300/(v+300))*6.5`, `quality = confidence*raw + (1-confidence)*smoothed` (each over 10); explicit-dislike penalty coefficient 0.30 (learned-negative stays 0.08); hard filter drops items whose `primaryGenreId` is disliked unless `filters.genreId` is that genre; seeds feed a `seed` source from TMDB `similar` and `recommendations`, up to 3 seeds per page, rotating; disliked genres go into discover `without_genres` (pipe-separated) unless the user filters to that genre.
- Mood to genre map (verbatim): feel_good 35,10751,10749,16; dark 80,53,27,9648; mind_bending 878,9648,53,14; emotional 18,10749,10402; funny 35,16; intense 28,53,10752,80.
- Era ranges: classics before 1990; nineties_2000s 1990-2009; modern 2010-2019; new 2020 onward.
- Every new field on `TasteProfile` is optional; code reads it with `?.` and defaults. Existing fixtures (`profile()` in `recommendations-v2.test.ts`) have no `learned`, `tone` or new `explicit` keys and must keep passing.
- A user with none of the new fields must get an identical profile fingerprint to today (regression guard in Task 3).
- Do not touch unrelated user work: `src/backend/services/watchSources/`, `src/app/api/`, `src/shared/types/watchSources.ts`, `docs/watch-source-importer.md`, `.env.example`, `vercel.json`, `package.json`, `package-lock.json`, `README.md`.
- `vitest run`, `tsc --noEmit`, `eslint src` clean after every task. Commit only if the user asked.

## Review Focus

- Liked-wins guard in the engine: a stored profile whose preferences have a genre both preferred and disliked (race from plan 1) must not hide that genre's titles (Task 3 builder test and Task 4 hard-filter test).
- A profile loaded from an old stored document (no `tone`, no `explicit.dislikedGenres`, no `explicit.seeds`) must rank and filter without throwing (Task 4 test with the legacy-shaped `profile()` fixture).
- A user who filters to a disliked genre on purpose still sees it (Task 4 and Task 5 tests).
- Seeds whose TMDB calls fail or return junk must not break page generation (Task 5 test).
- Rich-history users must not get worse results from adding seeds or moods (Task 6 non-regression test).

---

## File Structure

- `src/shared/lib/recommendation/coldStart.ts` (create): pure helpers and constants.
- `src/shared/lib/recommendation/coldStart.test.ts` (create).
- `src/shared/lib/recommendation/taste.ts` (modify): types, `buildTasteProfile`, fingerprint, exported signature helper.
- `src/shared/lib/recommendation/taste.preferences.test.ts` (create).
- `src/shared/lib/recommendation/index.ts` (modify): export `coldStart`.
- `src/backend/services/recommendationTaste.ts` (modify): read new preference fields, rebuild when they change, keep `tone` from stored docs.
- `src/backend/services/recommendationTaste.test.ts` (modify): tests for the new boundary helpers.
- `src/backend/api/_handlers/user/recommendations-v2.ts` (modify): scoring, hard filter, retrieval.
- `src/backend/api/_handlers/user/recommendations-v2.cold-start.test.ts` (create): scoring/filter tests.
- `src/backend/api/_handlers/user/recommendations-v2.test.ts` (modify): handler glue tests; stub new tmdbServer exports in its mock.
- `src/shared/lib/tmdb.ts` (modify): `DiscoverFilters.without_genres`.
- `src/test/helpers/coldStartFixture.ts` (create) and `src/test/recommendation-coldstart.test.ts` (create): offline accuracy measurement.
- `src/test/recommendation-feed.integration.test.ts` (modify): stub new tmdbServer exports in its mock.

---

### Task 1: Offline accuracy harness and legacy baseline

**Files:**
- Create: `src/test/helpers/coldStartFixture.ts`
- Create: `src/test/recommendation-coldstart.test.ts`

**Interfaces:**
- Produces (from the fixture module): `buildCatalogue(): { items: UnifiedContentItem[]; relevantKeys: Set<string> }`; `eventsFromItems(items: UnifiedContentItem[], signal?: TasteTitleEvent["signal"]): TasteTitleEvent[]`; `precisionAt(ranked: Array<{ item: UnifiedContentItem }>, relevantKeys: Set<string>, k: number): number`; constants `NOW`, `TRUE_GENRES`, `DISLIKED_GENRE`, `TRUE_LANGUAGES`, `TRUE_MIN_YEAR`. Later tasks add scenarios that use the new engine inputs; this task only records what today's engine scores.

- [ ] **Step 1: Write the fixture**

```ts
// src/test/helpers/coldStartFixture.ts
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

function isRelevant(spec: RawSpec): boolean {
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

export function buildCatalogue(): { items: UnifiedContentItem[]; relevantKeys: Set<string> } {
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
    if (isRelevant(spec)) relevantKeys.add(item.key);
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
```

- [ ] **Step 2: Write the baseline test (constants start as NaN so the first run shows the measured values)**

```ts
// src/test/recommendation-coldstart.test.ts
import { describe, expect, it, vi } from "vitest";
import { buildTasteProfile } from "@/shared/lib/recommendation/taste";
import { rankCandidatesForTaste } from "@/backend/api/_handlers/user/recommendations-v2";
import {
  NOW,
  buildCatalogue,
  eventsFromItems,
  precisionAt,
} from "./helpers/coldStartFixture";

vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/backend/services/tmdbServer", () => ({
  discoverServerMovies: vi.fn(),
  discoverServerTVShows: vi.fn(),
}));

// Measured with the engine as it was before this upgrade (legacy inputs only).
export const LEGACY_BASELINE = { thin: Number.NaN, rich: Number.NaN };

const legacyPreferences = { preferredGenres: [53], preferredLanguages: ["en"] };

describe("cold-start accuracy harness (legacy inputs)", () => {
  const { items, relevantKeys } = buildCatalogue();

  it("catalogue has enough relevant titles and decoys to be meaningful", () => {
    expect(relevantKeys.size).toBeGreaterThanOrEqual(40);
    expect(items.length).toBeGreaterThanOrEqual(880);
  });

  it("records today's precision@10 for a thin-data and a rich-history viewer", () => {
    const thinProfile = buildTasteProfile([], legacyPreferences, null, NOW);
    const thin = precisionAt(rankCandidatesForTaste(items, thinProfile, [], { exploration: "familiar" }), relevantKeys, 10);

    const liked = items.filter((item) => relevantKeys.has(item.key)).slice(0, 40);
    const likedKeys = new Set(liked.map((item) => item.key));
    const richProfile = buildTasteProfile(eventsFromItems(liked), legacyPreferences, null, NOW);
    const richCandidates = items.filter((item) => !likedKeys.has(item.key));
    const rich = precisionAt(rankCandidatesForTaste(richCandidates, richProfile, [], { exploration: "familiar" }), relevantKeys, 10);

    expect({ thin, rich }).toEqual(LEGACY_BASELINE);
  });
});
```

- [ ] **Step 3: Run it against the unmodified engine**

Run: `npx vitest run src/test/recommendation-coldstart.test.ts`
Expected: the first test PASSES; the second FAILS with a diff showing received `thin` and `rich` numbers (expected NaN). Read the two numbers from the output.

- [ ] **Step 4: Record the baseline**

Replace `Number.NaN` for each key in `LEGACY_BASELINE` with the received number (exactly as printed, e.g. `0.3`). Re-run:

Run: `npx vitest run src/test/recommendation-coldstart.test.ts`
Expected: PASS (2 tests). These numbers are the legacy baseline later tasks must beat (thin) or keep (rich). If `thin` is already 1.0 the fixture is too easy: reduce the share of relevant titles among popular items (raise the decoy popularity or add decoys) until `thin` is at most 0.6, then re-record. Do not continue with a baseline of 1.0.

- [ ] **Step 5: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/test/helpers/coldStartFixture.ts src/test/recommendation-coldstart.test.ts
git commit -m "test: offline cold-start accuracy harness with legacy baseline"
```

---

### Task 2: Pure cold-start helpers

**Files:**
- Create: `src/shared/lib/recommendation/coldStart.ts`
- Create: `src/shared/lib/recommendation/coldStart.test.ts`
- Modify: `src/shared/lib/recommendation/index.ts`

**Interfaces:**
- Consumes: `Era`, `Mood`, `Pace` from `./preferences`; `TasteProfile` type from `./taste` (type-only import; `taste.ts` will import values from this module in Task 3, so keep this module's import of `./taste` type-only to avoid a runtime cycle).
- Produces:
  - constants `CONFIDENCE_EVIDENCE_TARGET = 12`, `COLD_START_BOOST = 0.8`, `MOOD_GENRE_BOOST = 0.8`, `MOOD_GENRE_CAP = 1.6`, `RATING_PRIOR_VOTES = 300`, `RATING_PRIOR_MEAN = 6.5`, `MOOD_GENRES`, `MOOD_LABELS`, `ERA_LABELS`
  - `buildMoodGenreBoost(moods: Mood[]): Record<string, number>`
  - `activityEvidenceCount(profile: { evidence: Array<{ signal: string }> }): number`
  - `tasteConfidence(profile): number`, `preferenceMultiplier(profile): number`
  - `matchedEra(year: number | null, eras: Era[] | undefined): Era | null`
  - `smoothedRating(voteAverage: number, voteCount: number): number`
  - `coldStartQuality(item: { voteAverage: number; voteCount: number }, confidence: number): number`
  - `paceScore(pace: Pace | null | undefined, runtime: number | null): number`
  - `moodGenreSum(boost: Record<string, number> | undefined, genreIds: number[]): number`
  - `strongestMood(moods: Mood[] | undefined, genreIds: number[]): Mood | null`
  - `pickSeedsForPage<T>(seeds: T[] | undefined, page: number, max?: number): T[]`
  - `discoverExclusions(profile: { explicit: { dislikedGenres?: number[] } }, filterGenreId: number | null): string | undefined`

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/lib/recommendation/coldStart.test.ts
import { describe, expect, it } from "vitest";
import {
  activityEvidenceCount,
  buildMoodGenreBoost,
  coldStartQuality,
  discoverExclusions,
  matchedEra,
  moodGenreSum,
  paceScore,
  pickSeedsForPage,
  preferenceMultiplier,
  smoothedRating,
  strongestMood,
  tasteConfidence,
} from "./coldStart";

const evidence = (signal: string, count: number) =>
  ({ evidence: Array.from({ length: count }, () => ({ signal })) });

describe("confidence ramp", () => {
  it("does not count seed evidence as activity", () => {
    expect(activityEvidenceCount({ evidence: [{ signal: "seed" }, { signal: "liked" }, { signal: "skip" }] })).toBe(2);
  });

  it("is 0 with no activity, 0.5 at six, and caps at 1 from twelve", () => {
    expect(tasteConfidence(evidence("liked", 0))).toBe(0);
    expect(tasteConfidence(evidence("liked", 6))).toBeCloseTo(0.5);
    expect(tasteConfidence(evidence("liked", 12))).toBe(1);
    expect(tasteConfidence(evidence("liked", 400))).toBe(1);
  });

  it("boosts explicit weight up to 1.8x at zero confidence and 1x at full confidence", () => {
    expect(preferenceMultiplier(evidence("seed", 10))).toBeCloseTo(1.8);
    expect(preferenceMultiplier(evidence("liked", 6))).toBeCloseTo(1.4);
    expect(preferenceMultiplier(evidence("liked", 12))).toBe(1);
  });
});

describe("mood boosts", () => {
  it("adds 0.8 per mood-genre and caps at 1.6", () => {
    expect(buildMoodGenreBoost(["dark"])).toMatchObject({ "80": 0.8, "53": 0.8, "27": 0.8, "9648": 0.8 });
    // 53 and 9648 appear in dark, mind_bending and intense: capped.
    const stacked = buildMoodGenreBoost(["dark", "mind_bending", "intense"]);
    expect(stacked["53"]).toBe(1.6);
    expect(stacked["9648"]).toBe(1.6);
  });

  it("returns an empty map for no moods and ignores unknown moods", () => {
    expect(buildMoodGenreBoost([])).toEqual({});
    expect(buildMoodGenreBoost(["bogus" as never])).toEqual({});
  });

  it("sums boosts over an item's genres and names the strongest mood", () => {
    const boost = buildMoodGenreBoost(["dark", "funny"]);
    expect(moodGenreSum(boost, [80, 35, 18])).toBeCloseTo(1.6);
    expect(moodGenreSum(undefined, [80])).toBe(0);
    expect(strongestMood(["dark", "funny"], [80, 53])).toBe("dark");
    expect(strongestMood(["dark", "funny"], [35])).toBe("funny");
    expect(strongestMood(["dark"], [18])).toBeNull();
    expect(strongestMood(undefined, [80])).toBeNull();
  });
});

describe("eras", () => {
  it("matches boundaries exactly", () => {
    expect(matchedEra(1989, ["classics"])).toBe("classics");
    expect(matchedEra(1990, ["classics"])).toBeNull();
    expect(matchedEra(1990, ["nineties_2000s"])).toBe("nineties_2000s");
    expect(matchedEra(2009, ["nineties_2000s"])).toBe("nineties_2000s");
    expect(matchedEra(2010, ["modern"])).toBe("modern");
    expect(matchedEra(2019, ["modern"])).toBe("modern");
    expect(matchedEra(2020, ["new"])).toBe("new");
  });

  it("returns null for unknown year or no eras", () => {
    expect(matchedEra(null, ["new"])).toBeNull();
    expect(matchedEra(2024, [])).toBeNull();
    expect(matchedEra(2024, undefined)).toBeNull();
  });
});

describe("quality prior", () => {
  it("pulls tiny-sample ratings toward 6.5 and leaves large samples alone", () => {
    expect(smoothedRating(10, 3)).toBeCloseTo(6.5 + (10 - 6.5) * (3 / 303), 5);
    expect(smoothedRating(8, 100000)).toBeCloseTo(8, 1);
    expect(smoothedRating(9, 0)).toBe(6.5);
  });

  it("uses the smoothed value with no history and the raw value with full history", () => {
    const junk = { voteAverage: 9.8, voteCount: 6 };
    const solid = { voteAverage: 7.6, voteCount: 4000 };
    expect(coldStartQuality(junk, 0)).toBeLessThan(coldStartQuality(solid, 0));
    expect(coldStartQuality(junk, 1)).toBeGreaterThan(coldStartQuality(solid, 1));
    expect(coldStartQuality(junk, 1)).toBeCloseTo(0.98);
  });

  it("stays within 0..1 for odd inputs", () => {
    expect(coldStartQuality({ voteAverage: 99, voteCount: -5 }, 0.5)).toBeLessThanOrEqual(1);
    expect(coldStartQuality({ voteAverage: -3, voteCount: 10 }, 0.5)).toBeGreaterThanOrEqual(0);
  });
});

describe("pace", () => {
  it("favours long films for slow_burn and short for fast, neutral otherwise", () => {
    expect(paceScore("slow_burn", 130)).toBe(1);
    expect(paceScore("slow_burn", 95)).toBe(0);
    expect(paceScore("fast", 90)).toBe(1);
    expect(paceScore("fast", 140)).toBe(0);
    expect(paceScore("balanced", 120)).toBe(0);
  });

  it("is neutral when runtime or pace is unknown", () => {
    expect(paceScore("slow_burn", null)).toBe(0);
    expect(paceScore(null, 120)).toBe(0);
    expect(paceScore(undefined, 120)).toBe(0);
    expect(paceScore("fast", Number.NaN)).toBe(0);
  });
});

describe("pickSeedsForPage", () => {
  const seeds = ["a", "b", "c", "d", "e"];

  it("rotates three at a time across pages", () => {
    expect(pickSeedsForPage(seeds, 1)).toEqual(["a", "b", "c"]);
    expect(pickSeedsForPage(seeds, 2)).toEqual(["d", "e", "a"]);
    expect(pickSeedsForPage(seeds, 3)).toEqual(["b", "c", "d"]);
  });

  it("handles few, none and weird pages", () => {
    expect(pickSeedsForPage(["a"], 5)).toEqual(["a"]);
    expect(pickSeedsForPage([], 1)).toEqual([]);
    expect(pickSeedsForPage(undefined, 1)).toEqual([]);
    expect(pickSeedsForPage(seeds, 0)).toEqual(["a", "b", "c"]);
    expect(pickSeedsForPage(seeds, -4)).toEqual(["a", "b", "c"]);
  });
});

describe("discoverExclusions", () => {
  it("joins disliked genres with a pipe (any-of) for TMDB without_genres", () => {
    expect(discoverExclusions({ explicit: { dislikedGenres: [27, 53] } }, null)).toBe("27|53");
  });

  it("drops the genre the user is explicitly filtering to", () => {
    expect(discoverExclusions({ explicit: { dislikedGenres: [27, 53] } }, 27)).toBe("53");
    expect(discoverExclusions({ explicit: { dislikedGenres: [27] } }, 27)).toBeUndefined();
  });

  it("returns undefined when nothing is disliked or the profile is legacy-shaped", () => {
    expect(discoverExclusions({ explicit: {} }, null)).toBeUndefined();
    expect(discoverExclusions({ explicit: { dislikedGenres: [] } }, null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/lib/recommendation/coldStart.test.ts`
Expected: FAIL (module `./coldStart` not found).

- [ ] **Step 3: Implement**

```ts
// src/shared/lib/recommendation/coldStart.ts
import type { Era, Mood, Pace } from "./preferences";
import type { TasteProfile } from "./taste";

export const CONFIDENCE_EVIDENCE_TARGET = 12;
export const COLD_START_BOOST = 0.8;
export const MOOD_GENRE_BOOST = 0.8;
export const MOOD_GENRE_CAP = 1.6;
export const RATING_PRIOR_VOTES = 300;
export const RATING_PRIOR_MEAN = 6.5;

export const MOOD_GENRES: Record<Mood, number[]> = {
  feel_good: [35, 10751, 10749, 16],
  dark: [80, 53, 27, 9648],
  mind_bending: [878, 9648, 53, 14],
  emotional: [18, 10749, 10402],
  funny: [35, 16],
  intense: [28, 53, 10752, 80],
};

export const MOOD_LABELS: Record<Mood, string> = {
  feel_good: "feel-good",
  dark: "dark",
  mind_bending: "mind-bending",
  emotional: "emotional",
  funny: "funny",
  intense: "intense",
};

export const ERA_LABELS: Record<Era, string> = {
  classics: "classics",
  nineties_2000s: "1990s and 2000s",
  modern: "2010s",
  new: "2020s",
};

const ERA_RANGES: Record<Era, [number, number]> = {
  classics: [0, 1989],
  nineties_2000s: [1990, 2009],
  modern: [2010, 2019],
  new: [2020, 9999],
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function buildMoodGenreBoost(moods: Mood[]): Record<string, number> {
  const boost: Record<string, number> = {};
  for (const mood of moods) {
    for (const genreId of MOOD_GENRES[mood] ?? []) {
      const key = String(genreId);
      boost[key] = Math.min(MOOD_GENRE_CAP, (boost[key] || 0) + MOOD_GENRE_BOOST);
    }
  }
  return boost;
}

export function activityEvidenceCount(profile: { evidence: Array<{ signal: string }> }): number {
  return profile.evidence.filter((entry) => entry.signal !== "seed").length;
}

export function tasteConfidence(profile: { evidence: Array<{ signal: string }> }): number {
  return Math.min(1, activityEvidenceCount(profile) / CONFIDENCE_EVIDENCE_TARGET);
}

export function preferenceMultiplier(profile: { evidence: Array<{ signal: string }> }): number {
  return 1 + (1 - tasteConfidence(profile)) * COLD_START_BOOST;
}

export function matchedEra(year: number | null, eras: Era[] | undefined): Era | null {
  if (year === null || !Number.isFinite(year) || !eras?.length) return null;
  return eras.find((era) => {
    const range = ERA_RANGES[era];
    return Boolean(range) && year >= range[0] && year <= range[1];
  }) ?? null;
}

export function smoothedRating(voteAverage: number, voteCount: number): number {
  const votes = Math.max(0, voteCount);
  return (votes / (votes + RATING_PRIOR_VOTES)) * voteAverage +
    (RATING_PRIOR_VOTES / (votes + RATING_PRIOR_VOTES)) * RATING_PRIOR_MEAN;
}

export function coldStartQuality(
  item: { voteAverage: number; voteCount: number },
  confidence: number,
): number {
  const raw = clamp01(item.voteAverage / 10);
  const smoothed = clamp01(smoothedRating(item.voteAverage, item.voteCount) / 10);
  const weight = clamp01(confidence);
  return clamp01(weight * raw + (1 - weight) * smoothed);
}

export function paceScore(pace: Pace | null | undefined, runtime: number | null): number {
  if (!pace || runtime === null || !Number.isFinite(runtime)) return 0;
  if (pace === "slow_burn") return runtime >= 110 ? 1 : 0;
  if (pace === "fast") return runtime <= 100 ? 1 : 0;
  return 0;
}

export function moodGenreSum(
  boost: Record<string, number> | undefined,
  genreIds: number[],
): number {
  if (!boost) return 0;
  return genreIds.reduce((total, genreId) => total + (boost[String(genreId)] || 0), 0);
}

export function strongestMood(moods: Mood[] | undefined, genreIds: number[]): Mood | null {
  let best: Mood | null = null;
  let bestScore = 0;
  for (const mood of moods ?? []) {
    const genres = MOOD_GENRES[mood] ?? [];
    const score = genreIds.filter((genreId) => genres.includes(genreId)).length;
    if (score > bestScore) {
      best = mood;
      bestScore = score;
    }
  }
  return best;
}

export function pickSeedsForPage<T>(seeds: T[] | undefined, page: number, max = 3): T[] {
  if (!seeds?.length) return [];
  const count = Math.min(max, seeds.length);
  const start = ((Math.max(1, Math.floor(page)) - 1) * count) % seeds.length;
  return Array.from({ length: count }, (_, offset) => seeds[(start + offset) % seeds.length]);
}

export function discoverExclusions(
  profile: Pick<TasteProfile, "explicit"> | { explicit: { dislikedGenres?: number[] } },
  filterGenreId: number | null,
): string | undefined {
  const disliked = (profile.explicit.dislikedGenres ?? []).filter((genreId) => genreId !== filterGenreId);
  return disliked.length > 0 ? disliked.join("|") : undefined;
}
```

- [ ] **Step 4: Re-export**

Append to `src/shared/lib/recommendation/index.ts`:

```ts
export * from "./coldStart";
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run src/shared/lib/recommendation/coldStart.test.ts && npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: PASS and clean. (`tsc` may flag `TasteProfile["explicit"]` lacking `dislikedGenres` until Task 3 adds it; the `discoverExclusions` parameter type already accepts the structural shape, so no error is expected here. If `tsc` does complain, widen the first union member to the structural type only.)

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/shared/lib/recommendation/coldStart.ts src/shared/lib/recommendation/coldStart.test.ts src/shared/lib/recommendation/index.ts
git commit -m "feat: pure cold-start helpers (confidence, moods, eras, quality prior)"
```

---

### Task 3: Taste profile and persistence boundary

**Files:**
- Modify: `src/shared/lib/recommendation/taste.ts`
- Create: `src/shared/lib/recommendation/taste.preferences.test.ts`
- Modify: `src/backend/services/recommendationTaste.ts`
- Modify: `src/backend/services/recommendationTaste.test.ts`

**Interfaces:**
- Consumes: `buildMoodGenreBoost` from `./coldStart`; `Era`, `Mood`, `Pace` from `./preferences`.
- Produces:
  - `interface TasteSeed { contentId: number; contentType: "movie" | "tv"; title: string; genres: number[]; language?: string }`
  - `TastePreferences` gains optional `dislikedGenres?: number[]`, `seedTitles?: TasteSeed[]`, `moods?: Mood[]`, `pace?: Pace | null`, `eras?: Era[]`
  - `TasteTitleEvent["signal"]` and `TasteEvidence["signal"]` gain `"seed"`
  - `TasteProfile.explicit` gains optional `dislikedGenres?: number[]` and `seeds?: TasteSeed[]`; `TasteProfile.tone?: { moodGenreBoost: Record<string, number>; moods: Mood[]; eras: Era[]; pace: Pace | null }`
  - `tasteExtrasSignature(preferences: TastePreferences): string` and `profileExtrasSignature(profile: TasteProfile): string` (equal strings mean the stored profile already reflects the preferences; empty extras give `""`)
  - `toPreferences(doc)` exported from `recommendationTaste.ts`, now reading `disliked_genres`, `seed_titles`, `moods`, `pace`, `eras`

- [ ] **Step 1: Record today's legacy fingerprint**

Run a one-off check (not committed):

```bash
cat > /tmp/fp.test.ts <<'EOF'
import { it } from "vitest";
import { buildTasteProfile } from "/Users/maheralivijapura/Desktop/Development/projects/moviereckon/src/shared/lib/recommendation/taste";
it("print", () => {
  const p = buildTasteProfile([], { preferredGenres: [28], preferredLanguages: ["en"] }, null, "2026-09-05T12:00:00.000Z");
  console.log("LEGACY_FINGERPRINT=" + p.sourceFingerprint);
});
EOF
cp /tmp/fp.test.ts src/shared/lib/recommendation/zz-fp.test.ts && npx vitest run src/shared/lib/recommendation/zz-fp.test.ts 2>&1 | grep LEGACY_FINGERPRINT; rm src/shared/lib/recommendation/zz-fp.test.ts
```

Expected: one line `LEGACY_FINGERPRINT=<8 hex chars>`. Note the value; it goes into the test below. Make sure the temporary file is deleted.

- [ ] **Step 2: Write the failing tests**

```ts
// src/shared/lib/recommendation/taste.preferences.test.ts
import { describe, expect, it } from "vitest";
import {
  buildTasteProfile,
  getTasteGenreWeight,
  getTasteLanguageWeight,
  profileExtrasSignature,
  tasteExtrasSignature,
  type TasteSeed,
} from "./taste";

const NOW = "2026-09-05T12:00:00.000Z";
const LEGACY_FINGERPRINT = "REPLACE_WITH_VALUE_FROM_STEP_1";

const seed = (id: number, genres: number[], language = "en"): TasteSeed => ({
  contentId: id,
  contentType: "movie",
  title: `Seed ${id}`,
  genres,
  language,
});

describe("legacy compatibility", () => {
  it("keeps the exact fingerprint for users with none of the new fields", () => {
    const base = { preferredGenres: [28], preferredLanguages: ["en"] };
    const legacy = buildTasteProfile([], base, null, NOW);
    expect(legacy.sourceFingerprint).toBe(LEGACY_FINGERPRINT);
    const withEmptyExtras = buildTasteProfile(
      [],
      { ...base, dislikedGenres: [], seedTitles: [], moods: [], pace: null, eras: [] },
      null,
      NOW,
    );
    expect(withEmptyExtras.sourceFingerprint).toBe(LEGACY_FINGERPRINT);
  });

  it("does not invent interests when only soft preferences are given", () => {
    const profile = buildTasteProfile([], { moods: ["dark"], eras: ["new"], pace: "fast" }, null, NOW);
    expect(profile.inferred).toEqual({ genres: {}, languages: {} });
    expect(profile.evidence).toEqual([]);
  });
});

describe("seed titles", () => {
  it("become undecayed positive evidence and feed genre and language affinity", () => {
    const profile = buildTasteProfile([], { seedTitles: [seed(1, [53, 80], "ko")] }, null, NOW);
    expect(profile.evidence).toEqual([
      expect.objectContaining({ key: "movie_1", signal: "seed", weight: 3, language: "ko" }),
    ]);
    expect(getTasteGenreWeight(profile, 53)).toBe(3);
    expect(getTasteGenreWeight(profile, 80)).toBe(3);
    expect(getTasteLanguageWeight(profile, "ko")).toBe(3);
    expect(profile.explicit.seeds).toHaveLength(1);
  });

  it("lose to a real like on the same title", () => {
    const profile = buildTasteProfile(
      [{ contentId: 1, contentType: "movie", title: "Seed 1", genres: [53], language: "en", occurredAt: "2026-09-04T12:00:00.000Z", signal: "liked" }],
      { seedTitles: [seed(1, [53])] },
      null,
      NOW,
    );
    expect(profile.evidence).toHaveLength(1);
    expect(profile.evidence[0]).toMatchObject({ signal: "liked", weight: 3.5 });
  });

  it("are not shifted by the age of the profile build time", () => {
    const early = buildTasteProfile([], { seedTitles: [seed(1, [53])] }, null, "2026-01-01T00:00:00.000Z");
    const late = buildTasteProfile([], { seedTitles: [seed(1, [53])] }, null, "2026-12-31T00:00:00.000Z");
    expect(getTasteGenreWeight(early, 53)).toBe(getTasteGenreWeight(late, 53));
  });
});

describe("disliked genres", () => {
  it("create strong negative weight", () => {
    const profile = buildTasteProfile([], { dislikedGenres: [27, 53] }, null, NOW);
    expect(profile.negative.genres["27"]).toBe(3);
    expect(profile.negative.genres["53"]).toBe(3);
    expect(profile.explicit.dislikedGenres).toEqual([27, 53]);
  });

  it("lose to an explicitly preferred genre (liked wins)", () => {
    const profile = buildTasteProfile([], { preferredGenres: [28], dislikedGenres: [28, 27] }, null, NOW);
    expect(profile.explicit.dislikedGenres).toEqual([27]);
    expect(profile.negative.genres["28"]).toBeUndefined();
    expect(profile.negative.genres["27"]).toBe(3);
  });

  it("ignore junk values", () => {
    const profile = buildTasteProfile([], { dislikedGenres: [27, 27, -1, 0, 1.5] }, null, NOW);
    expect(profile.explicit.dislikedGenres).toEqual([27]);
  });
});

describe("tone", () => {
  it("stores moods, eras and pace with a mood genre boost", () => {
    const profile = buildTasteProfile([], { moods: ["dark"], eras: ["modern", "new"], pace: "slow_burn" }, null, NOW);
    expect(profile.tone).toEqual({
      moods: ["dark"],
      eras: ["modern", "new"],
      pace: "slow_burn",
      moodGenreBoost: expect.objectContaining({ "53": 0.8, "80": 0.8 }),
    });
  });

  it("is omitted when nothing soft was chosen", () => {
    expect(buildTasteProfile([], { preferredGenres: [28] }, null, NOW).tone).toBeUndefined();
  });
});

describe("fingerprint and signatures", () => {
  const base = { preferredGenres: [28], preferredLanguages: ["en"] };

  it.each([
    ["dislikedGenres", { dislikedGenres: [27] }],
    ["seedTitles", { seedTitles: [seed(1, [53])] }],
    ["moods", { moods: ["dark" as const] }],
    ["pace", { pace: "fast" as const }],
    ["eras", { eras: ["new" as const] }],
  ])("changes when %s changes", (_name, extra) => {
    const without = buildTasteProfile([], base, null, NOW);
    const withExtra = buildTasteProfile([], { ...base, ...extra }, null, NOW);
    expect(withExtra.sourceFingerprint).not.toBe(without.sourceFingerprint);
  });

  it("produces matching signatures for preferences and the profile built from them", () => {
    const preferences = {
      ...base,
      dislikedGenres: [27],
      seedTitles: [seed(1, [53]), seed(2, [80], "ko")],
      moods: ["dark" as const],
      pace: "fast" as const,
      eras: ["new" as const],
    };
    const profile = buildTasteProfile([], preferences, null, NOW);
    expect(profileExtrasSignature(profile)).toBe(tasteExtrasSignature(preferences));
  });

  it("detects a change in any new field and is empty for none", () => {
    const profile = buildTasteProfile([], { ...base, moods: ["dark"] }, null, NOW);
    expect(profileExtrasSignature(profile)).not.toBe(tasteExtrasSignature({ ...base, moods: ["funny"] }));
    expect(profileExtrasSignature(profile)).not.toBe(tasteExtrasSignature(base));
    expect(tasteExtrasSignature(base)).toBe("");
    expect(profileExtrasSignature(buildTasteProfile([], base, null, NOW))).toBe("");
  });

  it("treats a legacy stored profile without new fields as having no extras", () => {
    const legacy = buildTasteProfile([], base, null, NOW);
    delete (legacy as { tone?: unknown }).tone;
    delete (legacy.explicit as { seeds?: unknown }).seeds;
    delete (legacy.explicit as { dislikedGenres?: unknown }).dislikedGenres;
    expect(profileExtrasSignature(legacy)).toBe("");
  });
});
```

Append to `src/backend/services/recommendationTaste.test.ts` (inside the file, new top-level `describe`), after adding `toPreferences` to its import list from `./recommendationTaste`:

```ts
describe("preference document boundary", () => {
  it("reads the new fields and sanitizes them", () => {
    const preferences = toPreferences({
      preferred_genres: [28],
      preferred_languages: ["EN"],
      disliked_genres: [27, "27", -2, "abc"],
      seed_titles: [
        { content_id: 603, content_type: "movie", title: "The Matrix", poster_path: "/a.jpg", genres: [28, 878], language: "en" },
        { content_id: "x", content_type: "movie", title: "Broken" },
      ],
      moods: ["dark", "sad"],
      pace: "fast",
      eras: ["new", "future"],
    });
    expect(preferences).toMatchObject({
      preferredGenres: [28],
      preferredLanguages: ["en"],
      dislikedGenres: [27],
      moods: ["dark"],
      pace: "fast",
      eras: ["new"],
    });
    expect(preferences.seedTitles).toEqual([
      { contentId: 603, contentType: "movie", title: "The Matrix", genres: [28, 878], language: "en" },
    ]);
  });

  it("falls back to empty values for legacy documents and missing docs", () => {
    for (const doc of [null, { preferred_genres: [28], preferred_languages: ["en"] }]) {
      expect(toPreferences(doc)).toMatchObject({
        dislikedGenres: [],
        seedTitles: [],
        moods: [],
        pace: null,
        eras: [],
      });
    }
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/shared/lib/recommendation/taste.preferences.test.ts src/backend/services/recommendationTaste.test.ts`
Replace `REPLACE_WITH_VALUE_FROM_STEP_1` in the test with the recorded value first. Expected: FAIL (new exports missing; `toPreferences` not exported).

- [ ] **Step 4: Implement in `taste.ts`**

1. Add imports at the top: `import { buildMoodGenreBoost } from "./coldStart";` and `import type { Era, Mood, Pace } from "./preferences";`.
2. Extend types:

```ts
export interface TasteSeed {
  contentId: number;
  contentType: TasteContentType;
  title: string;
  genres: number[];
  language?: string;
}

export interface TasteTone {
  moodGenreBoost: Record<string, number>;
  moods: Mood[];
  eras: Era[];
  pace: Pace | null;
}
```

In `TasteTitleEvent` change `signal` to `"watched" | "liked" | "watchlist" | "give_it_a_go" | "one_time_watch" | "must_watch" | "skip" | "seed"`. In `TasteEvidence` change `signal` to `"liked" | "watchlist" | "give_it_a_go" | "one_time_watch" | "must_watch" | "seed"`. In `TastePreferences` add:

```ts
  dislikedGenres?: number[];
  seedTitles?: TasteSeed[];
  moods?: Mood[];
  pace?: Pace | null;
  eras?: Era[];
```

In `TasteProfile` change `explicit` to `{ genres: number[]; languages: string[]; dislikedGenres?: number[]; seeds?: TasteSeed[] }` and add `tone?: TasteTone;`.
3. Add `seed: 3,` to `SIGNAL_WEIGHT`.
4. Add normalizers and signatures (place above `fingerprint`):

```ts
function normalizeDislikedGenres(values: number[] | undefined, preferred: number[]): number[] {
  return normalizeGenres(values).filter((genreId) => !preferred.includes(genreId)).slice(0, 12);
}

function normalizeSeeds(values: TasteSeed[] | undefined): TasteSeed[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const seeds: TasteSeed[] = [];
  for (const seed of values) {
    if (!seed || !Number.isInteger(seed.contentId) || seed.contentId <= 0) continue;
    if (seed.contentType !== "movie" && seed.contentType !== "tv") continue;
    const key = tasteContentKey(seed.contentType, seed.contentId);
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({
      contentId: seed.contentId,
      contentType: seed.contentType,
      title: seed.title?.trim() || "Untitled",
      genres: normalizeGenres(seed.genres),
      ...(normalizeLanguage(seed.language) ? { language: normalizeLanguage(seed.language)! } : {}),
    });
    if (seeds.length >= 12) break;
  }
  return seeds;
}

function extrasSignature(
  disliked: number[],
  seeds: TasteSeed[],
  moods: Mood[],
  pace: Pace | null | undefined,
  eras: Era[],
): string {
  if (disliked.length === 0 && seeds.length === 0 && moods.length === 0 && !pace && eras.length === 0) {
    return "";
  }
  return [
    `dislikes:${[...disliked].sort((a, b) => a - b).join(",")}`,
    `seeds:${seeds.map((seed) => tasteContentKey(seed.contentType, seed.contentId)).sort().join(",")}`,
    `moods:${[...moods].sort().join(",")}`,
    `pace:${pace || ""}`,
    `eras:${[...eras].sort().join(",")}`,
  ].join("|");
}

export function tasteExtrasSignature(preferences: TastePreferences): string {
  const preferred = normalizeGenres(preferences.preferredGenres);
  return extrasSignature(
    normalizeDislikedGenres(preferences.dislikedGenres, preferred),
    normalizeSeeds(preferences.seedTitles),
    [...(preferences.moods ?? [])],
    preferences.pace,
    [...(preferences.eras ?? [])],
  );
}

export function profileExtrasSignature(profile: TasteProfile): string {
  return extrasSignature(
    profile.explicit.dislikedGenres ?? [],
    profile.explicit.seeds ?? [],
    profile.tone?.moods ?? [],
    profile.tone?.pace,
    profile.tone?.eras ?? [],
  );
}
```

5. In `fingerprint(...)`, change the `input` line so the extras only appear when non-empty:

```ts
  const extras = tasteExtrasSignature(preferences);
  const input = `${normalized.join("|")}|preferences:${genres}|${languages}|time:${now.slice(0, 10)}${extras ? `|extras:${extras}` : ""}`;
```

6. In `buildTasteProfile`, after `const explicitLanguages = ...` add:

```ts
  const dislikedGenres = normalizeDislikedGenres(preferences.dislikedGenres, explicitGenres);
  const seeds = normalizeSeeds(preferences.seedTitles);
  const moods = [...new Set(preferences.moods ?? [])];
  const eras = [...new Set(preferences.eras ?? [])];
```

   Seeds must join the event list **before** `strongestByTitle` is built. Change the line `const normalizedEvents = normalizeEvents(events);` (the first line of the function body) to build the seed events up front (the explicit-genre lines below can stay where they are, but `normalizeSeeds` is pure so calling it twice is fine):

```ts
  const seedEvents: TasteTitleEvent[] = normalizeSeeds(preferences.seedTitles).map((seed) => ({
    contentId: seed.contentId,
    contentType: seed.contentType,
    title: seed.title,
    genres: seed.genres,
    language: seed.language,
    signal: "seed" as const,
  }));
  const normalizedEvents = normalizeEvents([...events, ...seedEvents]);
```

   After the loop that fills `negativeGenreWeights` from events (before `explicitGenres` clusters), add:

```ts
  for (const genreId of dislikedGenres) addWeight(negativeGenreWeights, String(genreId), 3);
```

   In the returned object change `explicit` and add `tone`:

```ts
    explicit: {
      genres: explicitGenres,
      languages: explicitLanguages,
      ...(dislikedGenres.length > 0 ? { dislikedGenres } : {}),
      ...(seeds.length > 0 ? { seeds } : {}),
    },
```

   and, after the `evidence: ...` line inside the returned object:

```ts
    ...(moods.length > 0 || eras.length > 0 || preferences.pace
      ? { tone: { moodGenreBoost: buildMoodGenreBoost(moods), moods, eras, pace: preferences.pace ?? null } }
      : {}),
```

   (`recencyMultiplier` already returns 1 for events without `occurredAt`, so seeds never decay.)

- [ ] **Step 5: Implement in `recommendationTaste.ts`**

1. Import the new helpers: add `profileExtrasSignature`, `tasteExtrasSignature` to the import from `@/shared/lib/recommendation/taste`, and `type TasteSeed`. Import the allowed lists: `import { ERAS, MOODS, PACES } from "@/shared/lib/recommendation/preferences";`.
2. Replace `toPreferences` with an exported version:

```ts
export function toPreferences(doc: RawDoc | null): TastePreferences {
  const preferredGenres = Array.isArray(doc?.preferred_genres)
    ? [...new Set(doc.preferred_genres.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
    : [];
  const preferredLanguages = readPreferenceList(doc?.preferred_languages, 10)
    .map((value) => value.toLowerCase())
    .filter((value) => /^[a-z]{2,3}$/.test(value));
  const dislikedGenres = Array.isArray(doc?.disliked_genres)
    ? [...new Set(doc.disliked_genres.map(Number).filter((value) => Number.isInteger(value) && value > 0))].slice(0, 12)
    : [];
  const seedTitles: TasteSeed[] = [];
  if (Array.isArray(doc?.seed_titles)) {
    for (const entry of doc.seed_titles as RawDoc[]) {
      const id = positiveInteger(entry?.content_id);
      const type = contentType(entry?.content_type);
      if (!id || !type) continue;
      const seedLanguage = language(entry.language);
      seedTitles.push({
        contentId: id,
        contentType: type,
        title: title(entry.title),
        genres: genres(entry.genres),
        ...(seedLanguage ? { language: seedLanguage } : {}),
      });
    }
  }
  const moods = Array.isArray(doc?.moods)
    ? [...new Set(doc.moods.filter((value): value is (typeof MOODS)[number] => (MOODS as readonly unknown[]).includes(value)))]
    : [];
  const eras = Array.isArray(doc?.eras)
    ? [...new Set(doc.eras.filter((value): value is (typeof ERAS)[number] => (ERAS as readonly unknown[]).includes(value)))]
    : [];
  const pace = (PACES as readonly unknown[]).includes(doc?.pace) ? (doc?.pace as (typeof PACES)[number]) : null;
  return { preferredGenres, preferredLanguages, dislikedGenres, seedTitles, moods, pace, eras };
}
```

3. In `profileFromDocument` add `tone: doc.tone as TasteProfile["tone"],` to the returned object (undefined for old docs).
4. In `loadRecommendationTaste`: extend the preferences projection to `{ preferred_genres: 1, preferred_languages: 1, disliked_genres: 1, seed_titles: 1, moods: 1, pace: 1, eras: 1 }` and extend `preferencesMatch`:

```ts
  const preferencesMatch = Boolean(
    storedProfile &&
    JSON.stringify(storedProfile.explicit.genres) === JSON.stringify(currentPreferences.preferredGenres) &&
    JSON.stringify(storedProfile.explicit.languages) === JSON.stringify(currentPreferences.preferredLanguages) &&
    profileExtrasSignature(storedProfile) === tasteExtrasSignature(currentPreferences),
  );
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/shared/lib/recommendation/taste.preferences.test.ts src/backend/services/recommendationTaste.test.ts src/test/recommendation-taste.qa.test.ts`
Expected: PASS.

- [ ] **Step 7: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean. A `tsc` error in a UI file that switches exhaustively on evidence `signal` means that file needs a `seed` case or default; fix it there (label text `Picked favourite`).

- [ ] **Step 8: Commit (only if user asked)**

```bash
git add src/shared/lib/recommendation/taste.ts src/shared/lib/recommendation/taste.preferences.test.ts src/backend/services/recommendationTaste.ts src/backend/services/recommendationTaste.test.ts
git commit -m "feat: taste profile learns seeds, dislikes, moods, eras and pace"
```

---

### Task 4: Scoring, hard filter and reasons

**Files:**
- Modify: `src/backend/api/_handlers/user/recommendations-v2.ts` (`scoreCandidate`, `hardFilter`, call sites, engine context)
- Create: `src/backend/api/_handlers/user/recommendations-v2.cold-start.test.ts`

**Interfaces:**
- Consumes: helpers from `@/shared/lib/recommendation/coldStart`; profile fields from Task 3.
- Produces: `scoreCandidate(item, profile, exploration)` (same signature) with new terms; `export function hardFilter(item, filters, profile?)`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/api/_handlers/user/recommendations-v2.cold-start.test.ts
import { describe, expect, it, vi } from "vitest";
import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";
import { buildTasteProfile, type TasteProfile } from "@/shared/lib/recommendation/taste";
import { hardFilter, rankCandidatesForTaste, scoreCandidate } from "./recommendations-v2";

vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/backend/services/tmdbServer", () => ({
  discoverServerMovies: vi.fn(),
  discoverServerTVShows: vi.fn(),
}));

const NOW = "2026-09-05T12:00:00.000Z";

function item(overrides: Record<string, unknown> = {}): UnifiedContentItem {
  const normalized = normalizeTmdbItem(
    {
      id: 1,
      title: "Candidate",
      genre_ids: [18],
      original_language: "en",
      release_date: "2015-06-01",
      vote_average: 7,
      vote_count: 2000,
      popularity: 80,
      ...overrides,
    },
    { typeHint: "movie", useCache: false },
  );
  if (!normalized) throw new Error("fixture must normalize");
  return normalized;
}

const filters = (overrides: Record<string, unknown> = {}) =>
  ({
    contentType: "all",
    recommendationType: "all",
    genreId: null,
    language: null,
    sort: "relevance",
    direction: "desc",
    exploration: "familiar",
    ...overrides,
  }) as Parameters<typeof hardFilter>[1];

describe("scoreCandidate: new terms", () => {
  it("scores a mood-matching genre above a non-matching one", () => {
    const profile = buildTasteProfile([], { moods: ["dark"] }, null, NOW);
    const dark = scoreCandidate(item({ genre_ids: [53] }), profile);
    const plain = scoreCandidate(item({ genre_ids: [18] }), profile);
    expect(dark.score).toBeGreaterThan(plain.score);
    expect(dark.explanation.reasons.map((r) => r.label)).toContain("Matches your dark mood");
  });

  it("adds a small era bonus only inside a selected era", () => {
    const profile = buildTasteProfile([], { eras: ["modern"] }, null, NOW);
    const inEra = scoreCandidate(item({ release_date: "2015-06-01" }), profile);
    const outside = scoreCandidate(item({ release_date: "1995-06-01" }), profile);
    expect(inEra.score - outside.score).toBeCloseTo(0.06, 5);
    expect(inEra.explanation.reasons.map((r) => r.label)).toContain("From the 2010s you like");
    expect(outside.explanation.reasons.map((r) => r.label)).not.toContain("From the 2010s you like");
  });

  it("applies pace only when runtime is known", () => {
    const profile = buildTasteProfile([], { pace: "slow_burn" }, null, NOW);
    const unknown = scoreCandidate(item(), profile);
    const long = scoreCandidate({ ...item(), runtime: 140 }, profile);
    const short = scoreCandidate({ ...item(), runtime: 90 }, profile);
    expect(long.score - unknown.score).toBeCloseTo(0.04, 5);
    expect(short.score).toBeCloseTo(unknown.score, 5);
  });

  it("penalizes an explicitly disliked genre much harder than a learned negative", () => {
    const disliked = buildTasteProfile([], { dislikedGenres: [27] }, null, NOW);
    const clean = buildTasteProfile([], {}, null, NOW);
    const horror = item({ genre_ids: [27] });
    expect(scoreCandidate(horror, clean).score - scoreCandidate(horror, disliked).score).toBeGreaterThan(0.25);
  });

  it("names the seed a candidate came from", () => {
    const profile = buildTasteProfile(
      [],
      { seedTitles: [{ contentId: 603, contentType: "movie", title: "The Matrix", genres: [878], language: "en" }] },
      null,
      NOW,
    );
    const fromSeed = { ...item({ genre_ids: [878] }), sourceTags: ["seed:movie_603"] };
    const reasons = scoreCandidate(fromSeed, profile).explanation.reasons.map((r) => r.label);
    expect(reasons[0]).toBe("Because you picked The Matrix");
    expect(reasons.length).toBeLessThanOrEqual(3);
  });
});

describe("scoreCandidate: cold start", () => {
  it("trusts explicit picks more with no activity than with plenty", () => {
    const cold = buildTasteProfile([], { preferredGenres: [53] }, null, NOW);
    const events = Array.from({ length: 12 }, (_, index) => ({
      contentId: 500 + index,
      contentType: "movie" as const,
      title: `Liked ${index}`,
      genres: [18],
      language: "en",
      occurredAt: "2026-09-04T12:00:00.000Z",
      signal: "liked" as const,
    }));
    const warm = buildTasteProfile(events, { preferredGenres: [53] }, null, NOW);
    const thriller = item({ genre_ids: [53] });
    const drama = item({ genre_ids: [18] });
    const coldGap = scoreCandidate(thriller, cold).score - scoreCandidate(drama, cold).score;
    // Same explicit pick, but the warm profile also loves drama, so compare the thriller's own lead over a neutral item.
    const neutral = item({ genre_ids: [37] });
    const coldLead = scoreCandidate(thriller, cold).score - scoreCandidate(neutral, cold).score;
    const warmLead = scoreCandidate(thriller, warm).score - scoreCandidate(neutral, warm).score;
    expect(coldGap).toBeGreaterThan(0);
    expect(coldLead).toBeGreaterThan(warmLead);
  });

  it("keeps a 9.8-rated 6-vote title below a solid 7.6-rated title for a cold user", () => {
    const cold = buildTasteProfile([], {}, null, NOW);
    const junk = item({ id: 2, vote_average: 9.8, vote_count: 6, popularity: 80 });
    const solid = item({ id: 3, vote_average: 7.6, vote_count: 4000, popularity: 80 });
    expect(scoreCandidate(junk, cold).score).toBeLessThan(scoreCandidate(solid, cold).score);
  });
});

describe("legacy-shaped profiles", () => {
  const legacy = {
    version: 1,
    sourceFingerprint: "legacy",
    updatedAt: NOW,
    exploration: 0.12,
    explicit: { genres: [], languages: [] },
    inferred: { genres: {}, languages: {} },
    negative: { genres: {}, languages: {} },
    clusters: [],
    evidence: [],
  } as unknown as TasteProfile;

  it("scores, ranks and filters without the new fields", () => {
    const candidate = item();
    expect(() => scoreCandidate(candidate, legacy)).not.toThrow();
    expect(rankCandidatesForTaste([candidate], legacy)).toHaveLength(1);
    expect(hardFilter(candidate, filters(), legacy)).toBe(true);
  });
});

describe("hardFilter: disliked genres", () => {
  const profile = buildTasteProfile([], { dislikedGenres: [27] }, null, NOW);

  it("hides items whose primary genre is disliked", () => {
    expect(hardFilter(item({ genre_ids: [27, 53] }), filters(), profile)).toBe(false);
  });

  it("keeps items that only carry the disliked genre as a secondary genre", () => {
    expect(hardFilter(item({ genre_ids: [53, 27] }), filters(), profile)).toBe(true);
  });

  it("shows the genre when the user filters to it on purpose", () => {
    expect(hardFilter(item({ genre_ids: [27] }), filters({ genreId: 27 }), profile)).toBe(true);
  });

  it("never hides a genre the user also prefers (liked wins even for stale profiles)", () => {
    const stale = { ...profile, explicit: { ...profile.explicit, genres: [27], dislikedGenres: [27] } } as TasteProfile;
    expect(hardFilter(item({ genre_ids: [27] }), filters(), stale)).toBe(true);
  });

  it("behaves as before without a profile", () => {
    expect(hardFilter(item({ genre_ids: [27] }), filters())).toBe(true);
    expect(hardFilter(item(), filters({ contentType: "tv" }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/backend/api/_handlers/user/recommendations-v2.cold-start.test.ts`
Expected: FAIL (`hardFilter` not exported; new terms and reasons missing).

- [ ] **Step 3: Implement in `recommendations-v2.ts`**

1. Add to the imports:

```ts
import {
  ERA_LABELS,
  MOOD_LABELS,
  coldStartQuality,
  matchedEra,
  moodGenreSum,
  paceScore,
  preferenceMultiplier,
  strongestMood,
  tasteConfidence,
} from "@/shared/lib/recommendation/coldStart";
```

2. Replace the body of `scoreCandidate` (keep its signature and return shape) with:

```ts
  const confidence = tasteConfidence(profile);
  const multiplier = preferenceMultiplier(profile);
  const genre = item.genreIds.reduce((total, genreId) => total + getTasteGenreWeight(profile, genreId), 0);
  const language = getTasteLanguageWeight(profile, item.originalLanguage);
  const negativeGenre = item.genreIds.reduce(
    (total, genreId) => total + (profile.negative.genres[String(genreId)] || 0),
    0,
  );
  const negativeLanguage = item.originalLanguage
    ? profile.negative.languages[item.originalLanguage] || 0
    : 0;
  // Affinity totals grow with activity volume. Saturate each feature before
  // blending so a prolific account cannot drown out metadata similarity or
  // exploration simply by repeating the same kind of event.
  const bounded = (value: number, scale: number): number =>
    value > 0 ? 1 - Math.exp(-value / scale) : 0;
  // With little activity the explicit picks and seeds are all we know, so they
  // count for more; the multiplier fades to 1 as real activity accumulates.
  const boundedGenre = bounded(genre * multiplier, 4);
  const boundedLanguage = bounded(language * multiplier, 3);
  const boundedNegativeGenre = bounded(negativeGenre, 4);
  const boundedNegativeLanguage = bounded(negativeLanguage, 3);
  const dislikedHits = item.genreIds.filter((genreId) =>
    (profile.explicit.dislikedGenres ?? []).includes(genreId),
  ).length;
  const dislikePenalty = dislikedHits > 0 ? 0.3 : 0;
  const quality = coldStartQuality(item, confidence);
  const popularity = Math.max(0, Math.min(1, Math.log1p(item.popularity) / Math.log1p(500)));
  const moodSum = moodGenreSum(profile.tone?.moodGenreBoost, item.genreIds);
  const boundedMood = bounded(moodSum, 1.6);
  const era = matchedEra(item.year, profile.tone?.eras);
  const eraBonus = era ? 0.06 : 0;
  const paceBonus = paceScore(profile.tone?.pace, item.runtime) * 0.04;
  const seedTag = item.sourceTags.find((tag) => tag.startsWith("seed:"));
  const seedSourceBonus = seedTag ? 0.08 * (1 + (1 - confidence)) : 0;
  const profileMatch = boundedGenre * 0.46 + boundedLanguage * 0.24;
  const explorationBoost = exploration === "adventurous"
    ? quality * 0.18 + popularity * 0.08 + 0.18
    : quality * 0.1 + popularity * 0.04 + 0.04;
  const score = profileMatch + explorationBoost + boundedMood * 0.1 + eraBonus + paceBonus + seedSourceBonus -
    (boundedNegativeGenre * 0.08 + boundedNegativeLanguage * 0.06 + dislikePenalty);
  const reasons: Array<{ label: string; evidence?: string }> = [];
  const seedKey = seedTag?.slice("seed:".length);
  const seedTitle = seedKey
    ? (profile.explicit.seeds ?? []).find(
        (seed) => `${seed.contentType}_${seed.contentId}` === seedKey,
      )?.title
    : undefined;
  if (seedTitle) reasons.push({ label: `Because you picked ${seedTitle}` });
```

   Keep the existing "strongestGenre", "language" and "negative" reason blocks exactly as they are after this point, then, before the `if (reasons.length === 0)` fallback, add:

```ts
  const topMood = strongestMood(profile.tone?.moods, item.genreIds);
  if (topMood) reasons.push({ label: `Matches your ${MOOD_LABELS[topMood]} mood` });
  if (era) reasons.push({ label: `From the ${ERA_LABELS[era]} you like` });
```

   In the returned `scoreBreakdown` set `year: eraBonus`, `runtime: paceBonus`, and `preference: boundedGenre + boundedLanguage + boundedMood`; keep the remaining keys. `explanation.reasons` keeps `.slice(0, 3)`.

3. Export and extend `hardFilter`:

```ts
export function hardFilter(item: UnifiedContentItem, filters: FeedFilters, profile?: TasteProfile): boolean {
  if (filters.contentType !== "all" && item.type !== filters.contentType) return false;
  if (filters.genreId && !item.genreIds.includes(filters.genreId)) return false;
  // Explicit dislikes hide an item only when its primary genre is disliked and
  // the person has not asked for that genre. Liked wins over disliked.
  const disliked = (profile?.explicit.dislikedGenres ?? []).filter(
    (genreId) => !(profile?.explicit.genres ?? []).includes(genreId),
  );
  if (
    item.primaryGenreId !== null &&
    disliked.includes(item.primaryGenreId) &&
    filters.genreId !== item.primaryGenreId
  ) {
    return false;
  }
```

   (keep the rest of the function body unchanged, starting at `if (filters.language && ...)`). Update its call site in `generatePage` to `hardFilter(normalized, filters, profile)`.

4. In `generatePage`, add `negativeGenreIds: profile.explicit.dislikedGenres ?? [],` to the `getRecommendations(...)` context object.

- [ ] **Step 4: Run the new and existing tests**

Run: `npx vitest run src/backend/api/_handlers/user/recommendations-v2.cold-start.test.ts src/backend/api/_handlers/user/recommendations-v2.test.ts src/test/recommendation-ranking.qa.test.ts src/test/dynamic-recommendations.test.ts`
Expected: PASS. If an existing ranking QA test fails because the quality prior changed an ordering, check the cause: only change the test when the new order is correct under the spec (smoothed rating for a thin-data profile); record the change as a ruling.

- [ ] **Step 5: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/backend/api/_handlers/user/recommendations-v2.ts src/backend/api/_handlers/user/recommendations-v2.cold-start.test.ts
git commit -m "feat: cold-start aware scoring, mood/era/pace terms and dislike filter"
```

---

### Task 5: Retrieval: seed source and disliked-genre exclusion

**Files:**
- Modify: `src/shared/lib/tmdb.ts` (`DiscoverFilters`)
- Modify: `src/backend/api/_handlers/user/recommendations-v2.ts` (`fetchSource`, `generatePage`)
- Modify: `src/backend/api/_handlers/user/recommendations-v2.test.ts` (mock stubs and new tests)
- Modify: `src/test/recommendation-feed.integration.test.ts` (mock stubs)

**Interfaces:**
- Consumes: `pickSeedsForPage`, `discoverExclusions` from `@/shared/lib/recommendation/coldStart`; `getServerMovieRecommendations`, `getServerSimilarMovies`, `getServerTVShowRecommendations`, `getServerSimilarTVShows` from `@/backend/services/tmdbServer` (all already exist).
- Produces: candidates tagged `seed:<type>_<id>`; discover calls carry `without_genres` when the profile has dislikes.

- [ ] **Step 1: Add the discover field**

In `DiscoverFilters` (tmdb.ts) add `without_genres?: string;`.

- [ ] **Step 2: Stub the new exports in both existing mocks**

In `recommendations-v2.test.ts` extend the hoisted `mocks` object with `getServerMovieRecommendations: vi.fn(), getServerSimilarMovies: vi.fn(), getServerTVShowRecommendations: vi.fn(), getServerSimilarTVShows: vi.fn(),`, extend the `tmdbServer` mock to export them, and in `beforeEach` add:

```ts
    mocks.getServerMovieRecommendations.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.getServerSimilarMovies.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.getServerTVShowRecommendations.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.getServerSimilarTVShows.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
```

In `recommendation-feed.integration.test.ts` extend its hoisted mocks and `tmdbServer` mock the same way (each resolving `{ results: [] }`). This file is opt-in (skipped without `MOVIERECKON_RUN_DB_QA=1`); the edit keeps it valid if someone runs it.

- [ ] **Step 3: Write the failing glue tests (append inside the existing `describe` in `recommendations-v2.test.ts`)**

```ts
  describe("seed retrieval and dislikes", () => {
    const seededProfile = () => ({
      ...profile(),
      explicit: {
        genres: [],
        languages: [],
        dislikedGenres: [27],
        seeds: [
          { contentId: 603, contentType: "movie", title: "The Matrix", genres: [878], language: "en" },
          { contentId: 604, contentType: "tv", title: "Dark Show", genres: [9648], language: "en" },
        ],
      },
      evidence: [
        { key: "movie_603", contentType: "movie", title: "The Matrix", signal: "seed", weight: 3, language: "en", genreIds: [878] },
      ],
    });

    it("adds TMDB similar and recommended titles for the picked seeds, tagged by seed", async () => {
      mocks.tasteState.profile = seededProfile();
      mocks.getServerMovieRecommendations.mockResolvedValue({ page: 1, total_pages: 1, results: [{ ...movie(9001), title: "Seed recommended" }] });
      mocks.getServerSimilarMovies.mockResolvedValue({ page: 1, total_pages: 1, results: [{ ...movie(9002), title: "Seed similar" }] });

      const res = await call("/api/user/recommendations/v2?limit=24&content_type=movie");

      expect(mocks.getServerMovieRecommendations).toHaveBeenCalledWith(603);
      expect(mocks.getServerSimilarMovies).toHaveBeenCalledWith(603);
      const ids = pageData(res).items.map((entry) => entry.id);
      expect(ids).toEqual(expect.arrayContaining([9001, 9002]));
      const explanation = res.body.data.explanationById;
      expect(explanation["movie_9001"].reasons.map((r: { label: string }) => r.label)).toContain("Because you picked The Matrix");
    });

    it("rotates seeds across pages instead of querying all of them every time", async () => {
      mocks.tasteState.profile = seededProfile();
      await call("/api/user/recommendations/v2?limit=24&content_type=all");
      expect(mocks.getServerMovieRecommendations).toHaveBeenCalledTimes(1);
      expect(mocks.getServerTVShowRecommendations).toHaveBeenCalledTimes(1);
    });

    it("survives failing or junk seed responses", async () => {
      mocks.tasteState.profile = seededProfile();
      mocks.getServerMovieRecommendations.mockRejectedValue(new Error("tmdb down"));
      mocks.getServerSimilarMovies.mockResolvedValue({ page: 1, total_pages: 1, results: [null, 5, { nope: true }] });
      const res = await call("/api/user/recommendations/v2?limit=24&content_type=movie");
      expect(res.statusCode).toBe(200);
      expect(pageData(res).items.length).toBeGreaterThan(0);
    });

    it("skips seed calls for other content types and when there are no seeds", async () => {
      mocks.tasteState.profile = seededProfile();
      await call("/api/user/recommendations/v2?limit=24&content_type=tv");
      expect(mocks.getServerMovieRecommendations).not.toHaveBeenCalled();

      vi.clearAllMocks();
      mocks.tasteState.profile = profile();
      await call("/api/user/recommendations/v2?limit=24&content_type=movie");
      expect(mocks.getServerMovieRecommendations).not.toHaveBeenCalled();
    });

    it("excludes disliked genres from discover queries unless the user filters to one", async () => {
      mocks.tasteState.profile = seededProfile();
      await call("/api/user/recommendations/v2?limit=24&content_type=movie");
      const calls = mocks.discoverServerMovies.mock.calls.map(([params]) => params as { without_genres?: string });
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((params) => params.without_genres === "27")).toBe(true);

      vi.clearAllMocks();
      mocks.discoverServerMovies.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
      mocks.discoverServerTVShows.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
      await call("/api/user/recommendations/v2?limit=24&content_type=movie&genre=27");
      const filtered = mocks.discoverServerMovies.mock.calls.map(([params]) => params as { without_genres?: string });
      expect(filtered.every((params) => params.without_genres === undefined)).toBe(true);
    });
  });
```

(`parseFilters` reads the genre filter from the `genre` query parameter.)

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/backend/api/_handlers/user/recommendations-v2.test.ts`
Expected: the new tests FAIL (no seed calls, no `without_genres`); the existing 7 tests still PASS.

- [ ] **Step 5: Implement**

1. Add `discoverExclusions` and `pickSeedsForPage` to the coldStart import in `recommendations-v2.ts`; import the four seed fetchers from `@/backend/services/tmdbServer` (extend the existing import).
2. In `fetchSource`, add to `params`: `without_genres: discoverExclusions(profile, filters.genreId),` (the `profile` argument is already passed in).
3. Add above `generatePage`:

```ts
async function fetchSeedCandidates(
  profile: TasteProfile,
  page: number,
  filters: FeedFilters,
): Promise<Array<{ type: ContentType; seedKey: string; results: unknown[] }>> {
  const seeds = pickSeedsForPage(profile.explicit.seeds, page).filter(
    (seed) => filters.contentType === "all" || filters.contentType === seed.contentType,
  );
  const settle = async (load: () => Promise<{ results?: unknown[] }>): Promise<unknown[]> => {
    try {
      const response = await load();
      return Array.isArray(response?.results) ? response.results.slice(0, 20) : [];
    } catch {
      return [];
    }
  };
  return Promise.all(
    seeds.map(async (seed) => {
      const [recommended, similar] = await Promise.all(
        seed.contentType === "movie"
          ? [settle(() => getServerMovieRecommendations(seed.contentId)), settle(() => getServerSimilarMovies(seed.contentId))]
          : [settle(() => getServerTVShowRecommendations(seed.contentId)), settle(() => getServerSimilarTVShows(seed.contentId))],
      );
      return {
        type: seed.contentType,
        seedKey: `${seed.contentType}_${seed.contentId}`,
        results: [...recommended, ...similar],
      };
    }),
  );
}
```

4. In `generatePage`, immediately before the `while (attempts < MAX_REFILL_PAGES ...)` loop add:

```ts
  const seedSources = await fetchSeedCandidates(profile, page, filters);
  for (const source of seedSources) {
    for (const raw of source.results) {
      const normalized = normalizeTmdbItem(raw, {
        typeHint: source.type,
        sourceTag: `seed:${source.seedKey}`,
      });
      if (!normalized || !hardFilter(normalized, filters, profile)) continue;
      if (excludedKeys.has(normalized.key) || candidateMap.has(normalized.key)) continue;
      candidateMap.set(normalized.key, normalized);
    }
  }
```

   Candidates already in `candidateMap` from the buffer keep their existing tags; the `seed:` tag only decorates newly added items, which matches the "Because you picked" reason.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/backend/api/_handlers/user/recommendations-v2.test.ts src/backend/api/_handlers/user/recommendations-v2.cold-start.test.ts`
Expected: PASS (existing 7 + 5 new).

- [ ] **Step 7: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean.

- [ ] **Step 8: Commit (only if user asked)**

```bash
git add src/shared/lib/tmdb.ts src/backend/api/_handlers/user/recommendations-v2.ts src/backend/api/_handlers/user/recommendations-v2.test.ts src/test/recommendation-feed.integration.test.ts
git commit -m "feat: seed retrieval and disliked-genre exclusion in the feed"
```

---

### Task 6: Accuracy proof and verification

**Files:**
- Modify: `src/test/recommendation-coldstart.test.ts`
- Modify: `src/test/helpers/coldStartFixture.ts` (seed helper)

**Interfaces:**
- Consumes: Task 1 fixture and `LEGACY_BASELINE`; new preference fields.
- Produces: assertions that the new engine beats the legacy baseline with thin data and does not regress with rich history.

- [ ] **Step 1: Add the seed helper to the fixture**

Append to `coldStartFixture.ts`:

```ts
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
```

- [ ] **Step 2: Add the scenarios and assertions (append to `recommendation-coldstart.test.ts`)**

```ts
import { DISLIKED_GENRE, relevantSeeds } from "./helpers/coldStartFixture";

describe("cold-start accuracy: new engine inputs", () => {
  const { items, relevantKeys } = buildCatalogue();
  const rank = (profile: ReturnType<typeof buildTasteProfile>, candidates = items) =>
    precisionAt(rankCandidatesForTaste(candidates, profile, [], { exploration: "familiar" }), relevantKeys, 10);

  const soft = {
    dislikedGenres: [DISLIKED_GENRE],
    moods: ["dark" as const],
    eras: ["modern" as const, "new" as const],
  };

  function thinWithSeeds(count: number) {
    const seeds = relevantSeeds(items, relevantKeys, count);
    const seedKeys = new Set(seeds.map((seed) => `movie_${seed.contentId}`));
    const profile = buildTasteProfile([], { ...legacyPreferences, ...soft, seedTitles: seeds }, null, NOW);
    return rank(profile, items.filter((item) => !seedKeys.has(item.key)));
  }

  it("beats the legacy baseline by at least 0.10 precision@10 with 3 seeds and soft picks", () => {
    expect(thinWithSeeds(3)).toBeGreaterThanOrEqual(LEGACY_BASELINE.thin + 0.1);
  });

  it("does not get worse with 10 seeds than with 3", () => {
    expect(thinWithSeeds(10)).toBeGreaterThanOrEqual(thinWithSeeds(3) - 0.02);
  });

  it("improves on legacy even with only soft picks and no seeds", () => {
    const profile = buildTasteProfile([], { ...legacyPreferences, ...soft }, null, NOW);
    expect(rank(profile)).toBeGreaterThan(LEGACY_BASELINE.thin);
  });

  it("does not regress a rich-history viewer by more than 0.02 when seeds and soft picks are added", () => {
    const liked = items.filter((item) => relevantKeys.has(item.key)).slice(0, 40);
    const likedKeys = new Set(liked.map((item) => item.key));
    const candidates = items.filter((item) => !likedKeys.has(item.key));
    const seeds = relevantSeeds(candidates, relevantKeys, 3);
    const profile = buildTasteProfile(
      eventsFromItems(liked),
      { ...legacyPreferences, ...soft, seedTitles: seeds },
      null,
      NOW,
    );
    expect(rank(profile, candidates)).toBeGreaterThanOrEqual(LEGACY_BASELINE.rich - 0.02);
  });

  it("keeps disliked-genre decoys out of a thin viewer's top 10 once the genre is disliked", () => {
    const profile = buildTasteProfile([], { ...legacyPreferences, ...soft }, null, NOW);
    const top = rankCandidatesForTaste(items, profile, [], { exploration: "familiar" }).slice(0, 10);
    expect(top.filter(({ item }) => item.genreIds.includes(DISLIKED_GENRE))).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run src/test/recommendation-coldstart.test.ts`
Expected: PASS. If a "beats the baseline" assertion fails, do not lower the threshold or reshape the fixture: it means the engine terms are not delivering the spec'd gain. Diagnose with `systematic-debugging`, adjust the scoring terms within the spec's stated constants only if the spec allows, otherwise record a ruling and report the measured numbers to the user. Print the measured values (`console.log`) while diagnosing and remove the logging afterwards.

- [ ] **Step 4: Full verification**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: all clean.

- [ ] **Step 5: Report**

State the legacy baseline, the new measured precision@10 values for 3 seeds, 10 seeds, soft-only and rich history, and say plainly that this is a synthetic-catalogue measurement of the mechanism, not a claim about live TMDB accuracy. List what is verified by unit tests (profile, scoring, filter, retrieval glue with mocked TMDB) and what is not (real TMDB responses, real Mongo, UI). Do not commit unless asked.
