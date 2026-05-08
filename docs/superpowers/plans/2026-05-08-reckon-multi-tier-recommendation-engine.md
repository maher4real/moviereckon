# Reckon Multi-Tier Recommendation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TMDB-only, non-AI, multi-tier Reckon recommendation engine with hard no-repeat rules, keyword matching parity, contextual "Show More Like This," and low-user fallback behavior.

**Architecture:** Keep `/api/user/recommendations` as the primary API and keep the shared recommendation scorer as the core ranking surface. Strengthen the backend candidate and metadata tiers, pass richer scoring context into the shared ranker, and change the frontend show-more path to request contextual backend recommendations instead of direct TMDB discover pagination.

**Tech Stack:** Next.js API handler on Vercel, MongoDB collections, TMDB server service functions, React 19, TanStack Query, Vitest, TypeScript.

---

## Scope Check

This is one feature: a production recommendation engine upgrade. The work spans backend ranking, backend data collection, frontend show-more integration, and tests, but each task leaves the app in a working state and does not introduce AI ranking or external APIs beyond TMDB.

## File Structure

- Modify `src/shared/lib/recommendation/types.ts`: add scoring context fields for source boosts, collaborative boosts, and negative signals.
- Modify `src/shared/lib/recommendation/ranking.ts`: apply preference, source, collaborative, and negative adjustments after base content scoring.
- Add `src/backend/api/_handlers/user/recommendation-metadata.ts`: bounded TMDB keyword enrichment helper shared by main feed and show-more.
- Add `src/backend/api/_handlers/user/recommendation-collaborative.ts`: optional local-only collaborative boost helper gated by minimum local data.
- Modify `src/backend/api/_handlers/user/recommendations.ts`: add watchlist exclusions, request parsing, multi-tier TMDB candidate sources, keyword enrichment, contextual show-more mode, and collaborative boosts.
- Modify `src/frontend/lib/mongodbClient.ts`: expose contextual recommendation request options.
- Modify `src/frontend/hooks/useRecommendations.tsx`: expose a fetch-more helper if the page should keep recommendation logic in the hook.
- Modify `src/frontend/features/recommendations/Reckon.tsx`: replace direct discover pagination with contextual show-more.
- Modify tests:
  - `src/test/recommendation-engine.test.ts`
  - `src/backend/api/_handlers/user/recommendations.test.ts`
  - new `src/backend/api/_handlers/user/recommendation-metadata.test.ts`
  - new `src/backend/api/_handlers/user/recommendation-collaborative.test.ts`

---

### Task 1: Shared Ranking Controls

**Files:**
- Modify: `src/shared/lib/recommendation/types.ts`
- Modify: `src/shared/lib/recommendation/ranking.ts`
- Test: `src/test/recommendation-engine.test.ts`

- [ ] **Step 1: Add failing ranking tests**

Add these tests to `src/test/recommendation-engine.test.ts`:

```ts
it("applies source and collaborative boosts without overriding hard exclusions", () => {
  const seed = normalizeTmdbItem(buildMovie(1200, { genre_ids: [18, 53] }))!;
  const excluded = normalizeTmdbItem(buildMovie(1201, { title: "Already Seen" }))!;
  const sourceMatched = normalizeTmdbItem(
    buildMovie(1202, { title: "TMDB Similar Match", genre_ids: [18] }),
    { sourceTag: "similar:movie:1200" },
  )!;
  const collaborativeMatched = normalizeTmdbItem(
    buildMovie(1203, { title: "Local Taste Match", genre_ids: [35] }),
  )!;

  const ranked = getRecommendations(
    [seed],
    [excluded, sourceMatched, collaborativeMatched],
    {
      seenIds: [excluded.key],
      sourceBoosts: { "similar:": 0.12 },
      collaborativeBoosts: { [collaborativeMatched.key]: 0.16 },
      maxCandidates: 20,
    },
  );

  expect(ranked.map((entry) => entry.item.key)).not.toContain(excluded.key);
  expect(ranked.slice(0, 2).map((entry) => entry.item.key)).toEqual(
    expect.arrayContaining([sourceMatched.key, collaborativeMatched.key]),
  );
  expect(
    ranked.find((entry) => entry.item.key === collaborativeMatched.key)
      ?.scoreBreakdown.collaborative,
  ).toBeGreaterThan(0);
  expect(
    ranked.find((entry) => entry.item.key === sourceMatched.key)?.scoreBreakdown
      .source,
  ).toBeGreaterThan(0);
});

it("penalizes candidates near skipped genre and keyword signals", () => {
  const seed = normalizeTmdbItem(
    buildMovie(1300, {
      title: "Drama Seed",
      genre_ids: [18],
      keywords: [{ id: 99, name: "revenge" }],
    }),
  )!;
  const skippedLike = normalizeTmdbItem(
    buildMovie(1301, {
      title: "Skipped-Like Candidate",
      genre_ids: [27],
      keywords: [{ id: 99, name: "revenge" }],
    }),
  )!;
  const cleanCandidate = normalizeTmdbItem(
    buildMovie(1302, {
      title: "Cleaner Candidate",
      genre_ids: [18],
      keywords: [{ id: 101, name: "family" }],
    }),
  )!;

  const ranked = getRecommendations(
    [seed],
    [skippedLike, cleanCandidate],
    {
      negativeGenreIds: [27],
      negativeKeywordTokens: ["revenge"],
      maxCandidates: 20,
    },
  );

  expect(ranked[0]?.item.key).toBe(cleanCandidate.key);
  expect(
    ranked.find((entry) => entry.item.key === skippedLike.key)?.scoreBreakdown
      .negativePenalty,
  ).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the targeted failing tests**

Run:

```bash
npm run test -- src/test/recommendation-engine.test.ts
```

Expected: FAIL because `sourceBoosts`, `collaborativeBoosts`, `negativeGenreIds`, `negativeKeywordTokens`, and new score breakdown fields are not implemented.

- [ ] **Step 3: Extend shared recommendation types**

In `src/shared/lib/recommendation/types.ts`, update `ScoreBreakdown` and `RecommendationUserContext`:

```ts
export interface ScoreBreakdown {
  genre: number;
  keywords: number;
  people: number;
  year: number;
  runtime: number;
  quality: number;
  popularity: number;
  novelty: number;
  diversityPenalty: number;
  preference?: number;
  source?: number;
  collaborative?: number;
  negativePenalty?: number;
}
```

```ts
export interface RecommendationUserContext {
  seenIds?: Iterable<string>;
  displayedIds?: Iterable<string>;
  seedWeights?: Record<string, number>;
  preferredLanguages?: string[];
  preferredGenres?: number[];
  dominantLanguage?: string | null;
  popularityCap?: number;
  popularityMedian?: number;
  maxCandidates?: number;
  diversificationTopN?: number;
  sourceBoosts?: Record<string, number>;
  collaborativeBoosts?: Record<string, number>;
  negativeGenreIds?: number[];
  negativeKeywordTokens?: string[];
  debug?: boolean;
}
```

- [ ] **Step 4: Add adjustment helpers to ranking**

In `src/shared/lib/recommendation/ranking.ts`, add these helpers near `languageKey`:

```ts
function getSourceBoost(
  item: UnifiedContentItem,
  sourceBoosts?: Record<string, number>,
): number {
  if (!sourceBoosts || item.sourceTags.length === 0) return 0;

  let boost = 0;
  for (const tag of item.sourceTags) {
    const exact = sourceBoosts[tag] || 0;
    const prefix = Object.entries(sourceBoosts)
      .filter(([key]) => key.endsWith(":") && tag.startsWith(key))
      .reduce((sum, [, value]) => sum + value, 0);
    boost += exact + prefix;
  }

  return clamp(boost, 0, 0.24);
}

function getCollaborativeBoost(
  item: UnifiedContentItem,
  collaborativeBoosts?: Record<string, number>,
): number {
  if (!collaborativeBoosts) return 0;
  return clamp(collaborativeBoosts[item.key] || 0, 0, 0.18);
}

function getPreferenceBoost(
  item: UnifiedContentItem,
  userContext: RecommendationUserContext | undefined,
  preferredGenreMatches: number,
): number {
  const genreBoost =
    preferredGenreMatches > 0
      ? Math.min(0.36, 0.28 + preferredGenreMatches * 0.04)
      : 0;
  const preferredLanguageSet = new Set(
    (userContext?.preferredLanguages || []).map((language) =>
      language.toLowerCase(),
    ),
  );
  const languageBoost =
    item.originalLanguage &&
    preferredLanguageSet.has(item.originalLanguage.toLowerCase())
      ? 0.12
      : 0;

  return clamp(genreBoost + languageBoost, 0, 0.42);
}

function getNegativePenalty(
  item: UnifiedContentItem,
  userContext?: RecommendationUserContext,
): number {
  const negativeGenres = new Set(userContext?.negativeGenreIds || []);
  const negativeKeywords = new Set(
    (userContext?.negativeKeywordTokens || []).map((token) =>
      token.toLowerCase(),
    ),
  );
  const genreHits = item.genreIds.filter((genreId) =>
    negativeGenres.has(genreId),
  ).length;
  const keywordHits = item.keywordTokens.filter((token) =>
    negativeKeywords.has(token.toLowerCase()),
  ).length;

  return clamp(genreHits * 0.08 + keywordHits * 0.05, 0, 0.26);
}
```

- [ ] **Step 5: Apply the helpers in `getRecommendations`**

In the scored candidate mapping inside `getRecommendations`, replace the existing `preferenceBoost` and `blendedScore` block with this block:

```ts
const preferredGenreMatches = candidate.genreIds.filter((genreId) =>
  preferredGenreSet.has(genreId),
).length;
const preferenceBoost = getPreferenceBoost(
  candidate,
  userContext,
  preferredGenreMatches,
);
const sourceBoost = getSourceBoost(candidate, userContext?.sourceBoosts);
const collaborativeBoost = getCollaborativeBoost(
  candidate,
  userContext?.collaborativeBoosts,
);
const negativePenalty = getNegativePenalty(candidate, userContext);
const blendedScore =
  bestScore * 0.65 +
  averageScore * 0.35 +
  preferenceBoost +
  sourceBoost +
  collaborativeBoost -
  negativePenalty;
```

Then include the new score fields in `scoreBreakdown`:

```ts
const scoreBreakdown: ScoreBreakdown = {
  genre: weightTotal > 0 ? weightedBreakdownTotals.genre / weightTotal : 0,
  keywords: weightTotal > 0 ? weightedBreakdownTotals.keywords / weightTotal : 0,
  people: weightTotal > 0 ? weightedBreakdownTotals.people / weightTotal : 0,
  year: weightTotal > 0 ? weightedBreakdownTotals.year / weightTotal : 0,
  runtime: weightTotal > 0 ? weightedBreakdownTotals.runtime / weightTotal : 0,
  quality: weightTotal > 0 ? weightedBreakdownTotals.quality / weightTotal : 0,
  popularity: weightTotal > 0 ? weightedBreakdownTotals.popularity / weightTotal : 0,
  novelty: weightTotal > 0 ? weightedBreakdownTotals.novelty / weightTotal : 0,
  diversityPenalty: 0,
  preference: preferenceBoost,
  source: sourceBoost,
  collaborative: collaborativeBoost,
  negativePenalty,
};
```

- [ ] **Step 6: Run the shared recommendation tests**

Run:

```bash
npm run test -- src/test/recommendation-engine.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/shared/lib/recommendation/types.ts src/shared/lib/recommendation/ranking.ts src/test/recommendation-engine.test.ts
git commit -m "feat: add recommendation ranking controls"
```

---

### Task 2: User Context, Watchlist Exclusions, And Hard No-Repeat Rules

**Files:**
- Modify: `src/backend/api/_handlers/user/recommendations.ts`
- Test: `src/backend/api/_handlers/user/recommendations.test.ts`

- [ ] **Step 1: Add failing endpoint tests for watchlist and hard exclusions**

In `src/backend/api/_handlers/user/recommendations.test.ts`, extend `createMockDb` options:

```ts
function createMockDb(options?: {
  watchHistory?: unknown[];
  likedItems?: unknown[];
  watchlistItems?: unknown[];
  feedbackItems?: unknown[];
  preferences?: Record<string, unknown>;
}) {
  const watchHistory = options?.watchHistory || [];
  const likedItems = options?.likedItems || [];
  const watchlistItems = options?.watchlistItems || [];
  const feedbackItems = options?.feedbackItems || [];
  const preferences = options?.preferences || { preferred_genres: [] };
```

Add this branch in the test collection mock:

```ts
if (name === "watchlist") {
  return {
    find: vi.fn(() => makeCursor(watchlistItems)),
  };
}
```

Add this test:

```ts
it("excludes watched, liked, watchlisted, and skipped content from recommendations", async () => {
  mocks.connectToDatabase.mockResolvedValue({
    db: createMockDb({
      watchHistory: [
        {
          content_id: 10,
          content_type: "movie",
          title: "Already Watched",
          genres: [18],
          language: "en",
          watched_at: new Date().toISOString(),
        },
      ],
      likedItems: [
        {
          content_id: 20,
          content_type: "tv",
          title: "Already Liked",
          liked_at: new Date().toISOString(),
        },
      ],
      watchlistItems: [
        {
          content_id: 30,
          content_type: "movie",
          title: "Already Saved",
          added_at: new Date().toISOString(),
        },
      ],
      feedbackItems: [
        {
          content_id: 40,
          content_type: "movie",
          feedback_type: "skip",
          title: "Skipped",
          genres: [27],
        },
      ],
    }),
  });

  mocks.getServerTrendingMovies.mockResolvedValue([
    {
      id: 10,
      title: "Already Watched",
      original_title: "Already Watched",
      overview: "Watched movie",
      poster_path: null,
      backdrop_path: null,
      release_date: "2024-01-01",
      vote_average: 8,
      vote_count: 1000,
      popularity: 150,
      genre_ids: [18],
      original_language: "en",
      adult: false,
      video: false,
    },
    {
      id: 30,
      title: "Already Saved",
      original_title: "Already Saved",
      overview: "Saved movie",
      poster_path: null,
      backdrop_path: null,
      release_date: "2024-02-01",
      vote_average: 8,
      vote_count: 900,
      popularity: 130,
      genre_ids: [18],
      original_language: "en",
      adult: false,
      video: false,
    },
    {
      id: 40,
      title: "Skipped",
      original_title: "Skipped",
      overview: "Skipped movie",
      poster_path: null,
      backdrop_path: null,
      release_date: "2024-03-01",
      vote_average: 8,
      vote_count: 900,
      popularity: 125,
      genre_ids: [27],
      original_language: "en",
      adult: false,
      video: false,
    },
    {
      id: 50,
      title: "Fresh Pick",
      original_title: "Fresh Pick",
      overview: "Fresh recommendation",
      poster_path: null,
      backdrop_path: null,
      release_date: "2024-04-01",
      vote_average: 8,
      vote_count: 900,
      popularity: 120,
      genre_ids: [18],
      original_language: "en",
      adult: false,
      video: false,
    },
  ]);

  mocks.getServerTrendingTVShows.mockResolvedValue([
    {
      id: 20,
      name: "Already Liked",
      original_name: "Already Liked",
      overview: "Liked show",
      poster_path: null,
      backdrop_path: null,
      first_air_date: "2024-01-01",
      vote_average: 8,
      vote_count: 800,
      popularity: 110,
      genre_ids: [18],
      original_language: "en",
      origin_country: ["US"],
    },
  ]);

  const req = createMockReq("6.6.6.6");
  const { res } = createMockRes();

  await handler(req, res);

  const ids = ((res.body as any)?.data?.items || []).map((item: any) => item.id);
  expect(res.statusCode).toBe(200);
  expect(ids).not.toContain(10);
  expect(ids).not.toContain(20);
  expect(ids).not.toContain(30);
  expect(ids).not.toContain(40);
  expect(ids).toContain(50);
});
```

- [ ] **Step 2: Run the failing endpoint test**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendations.test.ts
```

Expected: FAIL because the recommendation handler does not read `watchlist` and does not exclude watchlist items.

- [ ] **Step 3: Add watchlist parsing to the handler**

In `src/backend/api/_handlers/user/recommendations.ts`, add:

```ts
interface WatchlistItem {
  content_id: number;
  content_type: ContentType;
  title: string;
  added_at: string;
}
```

Add this normalizer near `toLikedItems`:

```ts
function toWatchlistItems(items: unknown[]): WatchlistItem[] {
  return items
    .map((item) => {
      const doc = (item || {}) as Record<string, unknown>;
      const contentId = toPositiveInteger(doc.content_id);
      const contentType = toContentType(doc.content_type);
      if (!contentId || !contentType) return null;

      return {
        content_id: contentId,
        content_type: contentType,
        title: toTrimmedString(doc.title, "Untitled"),
        added_at: toTrimmedString(doc.added_at, new Date(0).toISOString()),
      } satisfies WatchlistItem;
    })
    .filter((item): item is WatchlistItem => item !== null)
    .sort((a, b) => b.added_at.localeCompare(a.added_at));
}
```

- [ ] **Step 4: Query watchlist with the existing user data batch**

In the handler DB batch, change:

```ts
const [watchHistoryDocs, likedItemsDocs, feedbackDocs, preferencesDoc] = await withTimeout(
```

to:

```ts
const [
  watchHistoryDocs,
  likedItemsDocs,
  watchlistDocs,
  feedbackDocs,
  preferencesDoc,
] = await withTimeout(
```

Add this query after `liked_items`:

```ts
db
  .collection("watchlist")
  .find(
    { user_id: user.id },
    {
      projection: {
        content_id: 1,
        content_type: 1,
        title: 1,
        added_at: 1,
      },
    },
  )
  .sort({ added_at: -1, _id: -1 })
  .limit(180)
  .toArray(),
```

Then add:

```ts
const watchlistItems = toWatchlistItems(watchlistDocs);
```

- [ ] **Step 5: Include watchlist in revision, seeds, and exclusions**

Change `buildRecommendationRevision` to accept `watchlistItems: WatchlistItem[]`, add this slice:

```ts
const watchlistSlice = toSeedSlice(
  watchlistItems.map((item) => `${item.content_type}:${item.content_id}:${item.added_at}`),
);
```

Add this revision segment:

```ts
`wl:${watchlistItems.length}:${getLatest(watchlistItems, (item) => item.added_at)}:${watchlistSlice}`,
```

Add a weight:

```ts
WATCHLIST: 1.2,
```

Add watchlist seeds:

```ts
watchlistItems.forEach((item) => {
  pushSeed(seedMap, {
    id: item.content_id,
    type: item.content_type,
    title: item.title,
    weight: WEIGHTS.WATCHLIST * recencyMultiplier(item.added_at),
  });
});
```

Add hard exclusions before ranking:

```ts
watchlistItems.forEach((item) => {
  seenIds.add(getContentKey(item.content_type, item.content_id));
});
```

- [ ] **Step 6: Pass stronger negative feedback context to ranking**

Before calling `getRecommendations`, derive:

```ts
const negativeGenreIds = Array.from(
  new Set(
    feedbackItems
      .filter((item) => item.feedback_type === "skip")
      .flatMap((item) => item.genres),
  ),
);
```

Pass it to `getRecommendations`:

```ts
negativeGenreIds,
```

- [ ] **Step 7: Run endpoint tests**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendations.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add src/backend/api/_handlers/user/recommendations.ts src/backend/api/_handlers/user/recommendations.test.ts
git commit -m "feat: exclude owned content from recommendations"
```

---

### Task 3: TMDB Keyword Enrichment And Main Feed Multi-Tier Sources

**Files:**
- Create: `src/backend/api/_handlers/user/recommendation-metadata.ts`
- Create: `src/backend/api/_handlers/user/recommendation-metadata.test.ts`
- Modify: `src/backend/api/_handlers/user/recommendations.ts`

- [ ] **Step 1: Add failing keyword enrichment tests**

Create `src/backend/api/_handlers/user/recommendation-metadata.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { normalizeTmdbItem } from "@/shared/lib/recommendation";
import { enrichCandidatesWithKeywords } from "./recommendation-metadata";

function movie(id: number) {
  return normalizeTmdbItem(
    {
      id,
      title: `Movie ${id}`,
      overview: "A contained thriller.",
      genre_ids: [53],
      release_date: "2024-01-01",
      vote_average: 7.5,
      vote_count: 1000,
      popularity: 80,
      original_language: "en",
    },
    { typeHint: "movie", sourceTag: "test" },
  )!;
}

describe("recommendation metadata enrichment", () => {
  it("adds TMDB keywords to bounded candidates", async () => {
    const fetchMovieKeywords = vi.fn(async () => [
      { id: 1, name: "time loop" },
      { id: 2, name: "survival" },
    ]);
    const fetchTVKeywords = vi.fn(async () => []);

    const enriched = await enrichCandidatesWithKeywords([movie(1)], {
      fetchMovieKeywords,
      fetchTVKeywords,
      limit: 1,
    });

    expect(fetchMovieKeywords).toHaveBeenCalledWith(1);
    expect(enriched[0].keywords.map((keyword) => keyword.name)).toContain(
      "time loop",
    );
    expect(enriched[0].keywordTokens).toContain("survival");
  });

  it("keeps original candidates when keyword lookup fails", async () => {
    const candidate = movie(2);
    const enriched = await enrichCandidatesWithKeywords([candidate], {
      fetchMovieKeywords: vi.fn(async () => {
        throw new Error("tmdb failed");
      }),
      fetchTVKeywords: vi.fn(async () => []),
      limit: 1,
    });

    expect(enriched[0].key).toBe(candidate.key);
    expect(enriched[0].keywords).toEqual(candidate.keywords);
  });
});
```

- [ ] **Step 2: Run the failing metadata tests**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendation-metadata.test.ts
```

Expected: FAIL because `recommendation-metadata.ts` does not exist.

- [ ] **Step 3: Implement bounded keyword enrichment**

Create `src/backend/api/_handlers/user/recommendation-metadata.ts`:

```ts
import {
  mergeNormalizedItems,
  normalizeTmdbItem,
  type UnifiedContentItem,
} from "@/shared/lib/recommendation";
import type { MovieKeyword } from "@/shared/lib/tmdb";

type KeywordFetchers = {
  fetchMovieKeywords: (id: number) => Promise<MovieKeyword[]>;
  fetchTVKeywords: (id: number) => Promise<MovieKeyword[]>;
  limit: number;
};

export async function enrichCandidatesWithKeywords(
  candidates: UnifiedContentItem[],
  fetchers: KeywordFetchers,
): Promise<UnifiedContentItem[]> {
  if (!candidates.length || fetchers.limit <= 0) return candidates;

  const enrichedByKey = new Map<string, UnifiedContentItem>();
  const bounded = candidates.slice(0, fetchers.limit);

  await Promise.all(
    bounded.map(async (candidate) => {
      if (candidate.keywords.length > 0) return;

      try {
        const keywords =
          candidate.type === "movie"
            ? await fetchers.fetchMovieKeywords(candidate.id)
            : await fetchers.fetchTVKeywords(candidate.id);
        if (!keywords.length) return;

        const raw =
          candidate.raw && typeof candidate.raw === "object"
            ? candidate.raw
            : {};
        const normalized = normalizeTmdbItem(
          {
            ...raw,
            id: candidate.id,
            title: candidate.type === "movie" ? candidate.title : undefined,
            name: candidate.type === "tv" ? candidate.title : undefined,
            genre_ids: candidate.genreIds,
            original_language: candidate.originalLanguage,
            release_date:
              candidate.type === "movie" ? candidate.releaseDate : undefined,
            first_air_date:
              candidate.type === "tv" ? candidate.releaseDate : undefined,
            vote_average: candidate.voteAverage,
            vote_count: candidate.voteCount,
            popularity: candidate.popularity,
            keywords,
            _content_type: candidate.type,
          },
          {
            typeHint: candidate.type,
            sourceTag: "metadata:keywords",
            useCache: false,
          },
        );

        if (normalized) {
          enrichedByKey.set(candidate.key, mergeNormalizedItems(candidate, normalized));
        }
      } catch {
        return;
      }
    }),
  );

  return candidates.map((candidate) => enrichedByKey.get(candidate.key) || candidate);
}
```

- [ ] **Step 4: Wire keyword enrichment into the main feed**

In `src/backend/api/_handlers/user/recommendations.ts`, import:

```ts
import {
  getServerMovieKeywords,
  getServerNowPlayingMovies,
  getServerPopularTVShows,
  getServerTopRatedMovies,
  getServerTVShowKeywords,
  getServerUpcomingMovies,
} from "@/backend/services/tmdbServer";
import { enrichCandidatesWithKeywords } from "./recommendation-metadata";
```

Add constants:

```ts
const KEYWORD_ENRICHMENT_LIMIT = 90;
const SOURCE_BOOSTS: Record<string, number> = {
  "recommendations:": 0.08,
  "similar:": 0.07,
  "people:": 0.05,
  "discover:": 0.03,
  "trending:": 0.02,
  "top-rated:": 0.025,
  "new-release:": 0.02,
};
```

Fetch additional TMDB-only fallback tiers near the existing trending fetch:

```ts
const [trendingMovies, trendingTV, topRatedMovies, popularTV, nowPlaying, upcoming] =
  await Promise.all([
    safe(getServerTrendingMovies("week")),
    safe(getServerTrendingTVShows("week")),
    safe(getServerTopRatedMovies(1)),
    safe(getServerPopularTVShows(1)),
    safe(getServerNowPlayingMovies(1)),
    safe(getServerUpcomingMovies(1)),
  ]);
```

Add these sources to `buildCandidateUnion`:

```ts
{
  source: "top-rated:movie:p1",
  items: topRatedMovies?.results,
  typeHint: "movie" as const,
},
{
  source: "popular:tv:p1",
  items: popularTV?.results,
  typeHint: "tv" as const,
},
{
  source: "new-release:movie:now-playing:p1",
  items: nowPlaying?.results,
  typeHint: "movie" as const,
},
{
  source: "new-release:movie:upcoming:p1",
  items: upcoming?.results,
  typeHint: "movie" as const,
},
```

After `candidateUnion`, enrich the bounded candidate list:

```ts
const enrichedCandidates = await enrichCandidatesWithKeywords(candidateUnion.items, {
  fetchMovieKeywords: (id) => safe(getServerMovieKeywords(id)).then((value) => value || []),
  fetchTVKeywords: (id) => safe(getServerTVShowKeywords(id)).then((value) => value || []),
  limit: KEYWORD_ENRICHMENT_LIMIT,
});
```

Then pass `enrichedCandidates` to `getRecommendations` instead of `candidateUnion.items`, and pass:

```ts
sourceBoosts: SOURCE_BOOSTS,
```

- [ ] **Step 5: Run metadata and endpoint tests**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendation-metadata.test.ts src/backend/api/_handlers/user/recommendations.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/backend/api/_handlers/user/recommendation-metadata.ts src/backend/api/_handlers/user/recommendation-metadata.test.ts src/backend/api/_handlers/user/recommendations.ts
git commit -m "feat: enrich recommendations with tmdb keyword tiers"
```

---

### Task 4: Contextual Show More Like This

**Files:**
- Modify: `src/backend/api/_handlers/user/recommendations.ts`
- Modify: `src/frontend/lib/mongodbClient.ts`
- Modify: `src/frontend/features/recommendations/Reckon.tsx`
- Test: `src/backend/api/_handlers/user/recommendations.test.ts`

- [ ] **Step 1: Add failing backend test for displayed exclusions**

Add this test to `src/backend/api/_handlers/user/recommendations.test.ts`:

```ts
it("excludes caller-provided displayed ids in more-like-this mode", async () => {
  mocks.getServerTrendingMovies.mockResolvedValue([
    {
      id: 777,
      title: "Already Displayed",
      original_title: "Already Displayed",
      overview: "Visible item",
      poster_path: null,
      backdrop_path: null,
      release_date: "2024-01-01",
      vote_average: 8,
      vote_count: 900,
      popularity: 120,
      genre_ids: [18],
      original_language: "en",
      adult: false,
      video: false,
    },
    {
      id: 778,
      title: "Fresh Context Pick",
      original_title: "Fresh Context Pick",
      overview: "New item",
      poster_path: null,
      backdrop_path: null,
      release_date: "2024-02-01",
      vote_average: 8,
      vote_count: 900,
      popularity: 115,
      genre_ids: [18],
      original_language: "en",
      adult: false,
      video: false,
    },
  ]);

  const req = {
    ...createMockReq("7.7.7.7"),
    url: "/api/user?route=recommendations&mode=more-like-this&exclude=movie_777&seed=movie_778",
  } as any;
  const { res } = createMockRes();

  await handler(req, res);

  const ids = ((res.body as any)?.data?.items || []).map((item: any) => item.id);
  expect(res.statusCode).toBe(200);
  expect(ids).not.toContain(777);
  expect(ids).toContain(778);
});
```

- [ ] **Step 2: Run the failing endpoint test**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendations.test.ts
```

Expected: FAIL because `mode`, `seed`, and `exclude` query params are not parsed.

- [ ] **Step 3: Parse contextual recommendation query params**

In `src/backend/api/_handlers/user/recommendations.ts`, add:

```ts
type RecommendationMode = "feed" | "more-like-this";

interface RecommendationRequestContext {
  mode: RecommendationMode;
  seedKeys: string[];
  displayedKeys: string[];
  genreId: number | null;
  language: string | null;
  contentType: ContentType | "all";
}
```

Add these helpers:

```ts
function getUrl(req: VercelRequest): URL {
  const host =
    typeof req.headers.host === "string" ? req.headers.host : "localhost";
  return new URL(req.url || "/api/user/recommendations", `http://${host}`);
}

function parseKeyList(searchParams: URLSearchParams, name: string): string[] {
  const values = searchParams.getAll(name).flatMap((value) => value.split(","));
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => /^(movie|tv)_\d+$/.test(value)),
    ),
  ).slice(0, 160);
}

function parseRecommendationRequest(req: VercelRequest): RecommendationRequestContext {
  const searchParams = getUrl(req).searchParams;
  const mode =
    searchParams.get("mode") === "more-like-this" ? "more-like-this" : "feed";
  const contentTypeParam = searchParams.get("content_type");
  const contentType =
    contentTypeParam === "movie" || contentTypeParam === "tv"
      ? contentTypeParam
      : "all";

  return {
    mode,
    seedKeys: parseKeyList(searchParams, "seed"),
    displayedKeys: parseKeyList(searchParams, "exclude"),
    genreId: toPositiveInteger(searchParams.get("genre")),
    language: normalizeLanguageCode(searchParams.get("language")),
    contentType,
  };
}
```

- [ ] **Step 4: Apply contextual seeds and displayed exclusions**

After auth and before reading cache, call:

```ts
const requestContext = parseRecommendationRequest(req);
```

Include request context in the cache revision:

```ts
const requestRevision = [
  revision,
  `mode:${requestContext.mode}`,
  `seed:${requestContext.seedKeys.join(",")}`,
  `exclude:${requestContext.displayedKeys.join(",")}`,
  `genre:${requestContext.genreId || "all"}`,
  `language:${requestContext.language || "all"}`,
  `type:${requestContext.contentType}`,
].join("|");
```

Use `requestRevision` for cache reads/writes.

When building `seenIds`, add:

```ts
requestContext.displayedKeys.forEach((key) => seenIds.add(key));
```

When `requestContext.mode === "more-like-this"`, add these request seeds before sorting `seedSignals`:

```ts
requestContext.seedKeys.forEach((key, index) => {
  const [type, idText] = key.split("_");
  const id = toPositiveInteger(idText);
  if ((type === "movie" || type === "tv") && id) {
    pushSeed(seedMap, {
      id,
      type,
      title: `Selected ${type}`,
      weight: Math.max(1.6, 2.2 - index * 0.12),
    });
  }
});
```

Apply soft filters to discover calls:

```ts
const requestGenreFilter = requestContext.genreId
  ? requestContext.genreId.toString()
  : undefined;
const requestLanguageFilter = requestContext.language || undefined;
```

Use those values in the more-like-this discover sources when present.

- [ ] **Step 5: Add frontend request options**

In `src/frontend/lib/mongodbClient.ts`, add:

```ts
export interface RecommendationFeedOptions {
  variant?: string;
  mode?: "feed" | "more-like-this";
  seedKeys?: string[];
  excludedKeys?: string[];
  genre?: string;
  language?: string;
  contentType?: "all" | "movie" | "tv";
}
```

Change the function signature:

```ts
export async function fetchRecommendationsFeed(
  options?: RecommendationFeedOptions,
): Promise<PersonalizedRecommendationsPayload> {
```

Add query params:

```ts
if (options?.mode) query.set("mode", options.mode);
options?.seedKeys?.slice(0, 12).forEach((key) => query.append("seed", key));
options?.excludedKeys?.slice(0, 160).forEach((key) => query.append("exclude", key));
if (options?.genre && options.genre !== "all") query.set("genre", options.genre);
if (options?.language && options.language !== "all") query.set("language", options.language);
if (options?.contentType && options.contentType !== "all") {
  query.set("content_type", options.contentType);
}
```

Add:

```ts
export async function fetchMoreLikeThisRecommendations(
  options: Omit<RecommendationFeedOptions, "mode">,
): Promise<PersonalizedRecommendationsPayload> {
  return fetchRecommendationsFeed({
    ...options,
    mode: "more-like-this",
  });
}
```

- [ ] **Step 6: Replace direct discover pagination in Reckon**

In `src/frontend/features/recommendations/Reckon.tsx`, remove `discoverMovies` and `discoverTVShows` from the TMDB import and import the client:

```ts
import * as mongoClient from "@/frontend/lib/mongodbClient";
```

Add helper near `getRecommendationItemType`:

```ts
function getRecommendationKey(item: Movie | TVShow): string {
  return `${getRecommendationItemType(item)}_${item.id}`;
}
```

Remove the unused discover pagination state:

```ts
const [discoverPage, setDiscoverPage] = useState(1);
```

Also remove this line from the filter-reset effect:

```ts
setDiscoverPage(1);
```

Move the `fetchMoreLikeThis` callback so it is declared after `visibleItems` is created. The dependency array must not reference variables before their `const` declarations.

Replace the body of `fetchMoreLikeThis` with:

```ts
if (isFetchingMore) return;
setIsFetchingMore(true);

const currentItems = [...recommendations, ...extraItems];
const excludedKeys = Array.from(new Set(currentItems.map(getRecommendationKey)));
const seedKeys = visibleItems
  .slice(0, 10)
  .map(getRecommendationKey);
const fallbackSeedKeys = currentItems.slice(0, 10).map(getRecommendationKey);

try {
  const payload = await mongoClient.fetchMoreLikeThisRecommendations({
    seedKeys: seedKeys.length ? seedKeys : fallbackSeedKeys,
    excludedKeys,
    genre: selectedGenre,
    language: selectedLanguage,
    contentType: contentTypeFilter,
  });
  const existing = new Set(excludedKeys);
  const fresh = payload.items.filter((item) => {
    const key = getRecommendationKey(item);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });

  setExtraItems((prev) => [...prev, ...fresh]);
} catch {
  return;
} finally {
  setIsFetchingMore(false);
}
```

Use this dependency list for the moved callback:

```ts
[
  isFetchingMore,
  recommendations,
  extraItems,
  visibleItems,
  selectedGenre,
  selectedLanguage,
  contentTypeFilter,
]
```

- [ ] **Step 7: Run tests and lint affected files**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendations.test.ts src/test/dynamic-recommendations.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add src/backend/api/_handlers/user/recommendations.ts src/backend/api/_handlers/user/recommendations.test.ts src/frontend/lib/mongodbClient.ts src/frontend/features/recommendations/Reckon.tsx
git commit -m "feat: add contextual reckon show more"
```

---

### Task 5: Optional Local Collaborative Boosts With Low-Data Gate

**Files:**
- Create: `src/backend/api/_handlers/user/recommendation-collaborative.ts`
- Create: `src/backend/api/_handlers/user/recommendation-collaborative.test.ts`
- Modify: `src/backend/api/_handlers/user/recommendations.ts`

- [ ] **Step 1: Add failing collaborative helper tests**

Create `src/backend/api/_handlers/user/recommendation-collaborative.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildCollaborativeBoosts } from "./recommendation-collaborative";

function collection(rows: unknown[]) {
  const cursor = {
    project: vi.fn(() => cursor),
    toArray: vi.fn(async () => rows),
  };
  return {
    aggregate: vi.fn(() => cursor),
  };
}

describe("recommendation collaborative boosts", () => {
  it("returns no boosts when local overlap is below the data gate", async () => {
    const db = {
      collection: vi.fn(() => collection([])),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1"],
      excludedKeys: new Set<string>(),
    });

    expect(boosts).toEqual({});
  });

  it("returns bounded boosts for locally co-liked candidates", async () => {
    const db = {
      collection: vi.fn(() =>
        collection([
          { _id: { content_type: "movie", content_id: 200 }, count: 8 },
          { _id: { content_type: "tv", content_id: 300 }, count: 5 },
        ]),
      ),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1", "tv_2", "movie_3"],
      excludedKeys: new Set<string>(["movie_1"]),
    });

    expect(boosts.movie_200).toBeGreaterThan(0);
    expect(boosts.tv_300).toBeGreaterThan(0);
    expect(Math.max(...Object.values(boosts))).toBeLessThanOrEqual(0.1);
  });
});
```

- [ ] **Step 2: Run the failing collaborative tests**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendation-collaborative.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the low-data gated helper**

Create `src/backend/api/_handlers/user/recommendation-collaborative.ts`:

```ts
import type { Db } from "mongodb";
import { getContentKey } from "@/shared/lib/recommendation";

type BuildCollaborativeBoostsInput = {
  userId: string;
  positiveKeys: string[];
  excludedKeys: Set<string>;
};

const MIN_POSITIVE_KEYS = 3;
const MAX_BOOST = 0.1;

function splitKey(key: string): { content_type: "movie" | "tv"; content_id: number } | null {
  const [type, idText] = key.split("_");
  const id = Number(idText);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(id) || id <= 0) {
    return null;
  }
  return { content_type: type, content_id: id };
}

export async function buildCollaborativeBoosts(
  db: Db,
  input: BuildCollaborativeBoostsInput,
): Promise<Record<string, number>> {
  const seedPairs = input.positiveKeys.map(splitKey).filter((value): value is {
    content_type: "movie" | "tv";
    content_id: number;
  } => value !== null);

  if (seedPairs.length < MIN_POSITIVE_KEYS) return {};

  const rows = await db
    .collection("liked_items")
    .aggregate<{
      _id: { content_type: "movie" | "tv"; content_id: number };
      count: number;
    }>([
      {
        $match: {
          user_id: { $ne: input.userId },
          $or: seedPairs,
        },
      },
      {
        $group: {
          _id: "$user_id",
          overlap: { $sum: 1 },
        },
      },
      {
        $match: {
          overlap: { $gte: 2 },
        },
      },
      {
        $lookup: {
          from: "liked_items",
          localField: "_id",
          foreignField: "user_id",
          as: "liked",
        },
      },
      { $unwind: "$liked" },
      {
        $group: {
          _id: {
            content_type: "$liked.content_type",
            content_id: "$liked.content_id",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 120 },
    ])
    .toArray();

  if (rows.length < 4) return {};

  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const boosts: Record<string, number> = {};

  for (const row of rows) {
    const key = getContentKey(row._id.content_type, row._id.content_id);
    if (input.excludedKeys.has(key)) continue;
    boosts[key] = Math.min(MAX_BOOST, (row.count / maxCount) * MAX_BOOST);
  }

  return boosts;
}
```

- [ ] **Step 4: Wire collaborative boosts into the handler**

In `src/backend/api/_handlers/user/recommendations.ts`, import:

```ts
import { buildCollaborativeBoosts } from "./recommendation-collaborative";
```

Before `getRecommendations`, derive positive keys:

```ts
const positiveKeys = Array.from(
  new Set([
    ...likedItems.map((item) => getContentKey(item.content_type, item.content_id)),
    ...feedbackItems
      .filter((item) => item.feedback_type !== "skip")
      .map((item) => getContentKey(item.content_type, item.content_id)),
    ...watchlistItems.map((item) => getContentKey(item.content_type, item.content_id)),
  ]),
);
```

Build boosts with timeout isolation:

```ts
const collaborativeBoosts =
  (await withTimeout(
    buildCollaborativeBoosts(db, {
      userId: user.id,
      positiveKeys,
      excludedKeys: seenIds,
    }),
    700,
  ).catch(() => ({} as Record<string, number>))) || {};
```

Pass to ranking:

```ts
collaborativeBoosts,
```

- [ ] **Step 5: Run collaborative and endpoint tests**

Run:

```bash
npm run test -- src/backend/api/_handlers/user/recommendation-collaborative.test.ts src/backend/api/_handlers/user/recommendations.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/backend/api/_handlers/user/recommendation-collaborative.ts src/backend/api/_handlers/user/recommendation-collaborative.test.ts src/backend/api/_handlers/user/recommendations.ts
git commit -m "feat: add gated collaborative recommendation boosts"
```

---

### Task 6: Full Verification And Production Guardrails

**Files:**
- Modify only files touched by earlier tasks if verification exposes issues.

- [ ] **Step 1: Run all recommendation tests**

Run:

```bash
npm run test -- src/test/recommendation-engine.test.ts src/test/dynamic-recommendations.test.ts src/backend/api/_handlers/user/recommendations.test.ts src/backend/api/_handlers/user/recommendation-metadata.test.ts src/backend/api/_handlers/user/recommendation-collaborative.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only recommendation engine, recommendation tests, client recommendation request, and Reckon show-more files are changed.

- [ ] **Step 6: Commit verification fixes if needed**

If Step 1 through Step 4 required any fixes, commit those fixes:

```bash
git add src docs
git commit -m "fix: stabilize multi-tier recommendations"
```

If no fixes were required, do not create an empty commit.
