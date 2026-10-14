# Taste preferences, engine upgrade and adaptation: design

Date: 2026-10-14
Status: design approved in chat; awaiting written-spec review

## Goal

Let people describe their taste richly (genres with imagery, languages, favourite titles, mood, pace, era, dislikes), make the Reckon recommendation engine accurate even with little activity data, and make the platform visibly adapt (Home rows, taste badges). Delivered as four sub-projects, each with its own plan, in this order: (1) data and API, (2) engine, (3) preference screen, (4) adaptation.

## Decisions already made

- Approach A: extend the existing taste profile and v2 feed pipeline. No separate recommender, no LLM in the ranking path.
- Pick types: genre tiles with poster collages, languages, favourite titles (seeds), mood / pace / era.
- Adaptation scope: Reckon feed (core), Home rows, look-and-feel touches. Search, Movies, Series and Upcoming are unchanged.
- Cap on favourites: 12. Mood and era are soft boosts, not filters. Titles whose primary genre is disliked are hidden from the Reckon feed unless the user filters to that genre.
- Visual language follows the Noir tokens and phone rules in `2026-10-14-noir-editorial-foundation-design.md`.

## Out of scope

- LLM-based ranking or explanations (ai-recommendations route stays as is).
- Runtime-based pace filtering where runtime is unknown (see 2.3).
- Changes to Search, Movies, Series, Upcoming defaults.
- The untracked watch-source importer files.

## 1. Preference data and API

### 1.1 Fields added to `user_preferences`

| Field | Type | Rules |
|---|---|---|
| `disliked_genres` | `number[]` | positive integers, de-duplicated, max 12, may not overlap `preferred_genres` (preferred wins on conflict, dislike is dropped) |
| `seed_titles` | `SeedTitle[]` | max 12, de-duplicated by `content_type:content_id` |
| `moods` | `Mood[]` | subset of `feel_good`, `dark`, `mind_bending`, `emotional`, `funny`, `intense`; max 6 |
| `pace` | `Pace \| null` | one of `slow_burn`, `balanced`, `fast`, or null |
| `eras` | `Era[]` | subset of `classics` (before 1990), `nineties_2000s` (1990-2009), `modern` (2010-2019), `new` (2020 onward); max 4 |

`SeedTitle`: `{ content_id: number, content_type: "movie" | "tv", title: string (max 220, single line), poster_path: string | null (max 300), genres: number[] (max 24), language?: string (2-3 letters) }`.

Shared types and the allowed-value lists live in one module, `src/shared/lib/recommendation/preferences.ts`, imported by the API, the engine and the UI so the lists cannot drift.

### 1.2 Endpoint behaviour (`/api/user/preferences`)

- `GET` returns all existing fields plus the five new ones; missing values default to `[]` / `null` (old accounts keep working).
- `PUT` accepts any subset of the fields. Invalid items inside a list are dropped; a field whose value is not an array (or, for `pace`, not an allowed string or null) is a 400 `Invalid preference payload format`. A body with no recognised field is still a 400 `At least one preference field is required`.
- Existing rate limits apply unchanged.
- After a successful write the user's taste profile is marked stale (`markTasteProfileStale`).

## 2. Engine upgrade

### 2.1 Profile inputs (`src/shared/lib/recommendation/taste.ts`)

- `TastePreferences` gains `dislikedGenres`, `seedTitles`, `moods`, `pace`, `eras`.
- The profile fingerprint includes all new fields, so a change rebuilds the profile.
- Seeds become evidence with signal `seed`, weight 3, never recency-decayed. They contribute to `learned`-style genre and language affinity and appear in `evidence` so explanations can say "Because you picked X".
- Disliked genres add `3.0` each to `profile.negative.genres`.
- New `profile.tone`: `{ moodGenreBoost: Record<genreId, number>, eras: Era[], pace: Pace | null }`.

### 2.2 Mood mapping (soft genre boosts, +0.8 each, summed and capped at 1.6 per genre)

- `feel_good`: comedy 35, family 10751, romance 10749, animation 16
- `dark`: crime 80, thriller 53, horror 27, mystery 9648
- `mind_bending`: science fiction 878, mystery 9648, thriller 53, fantasy 14
- `emotional`: drama 18, romance 10749, music 10402
- `funny`: comedy 35, animation 16
- `intense`: action 28, thriller 53, war 10752, crime 80

### 2.3 Scoring (`scoreCandidate`)

- **Confidence:** `confidence = min(1, activityEvidenceCount / 12)`, where activity evidence is the number of `evidence` entries that are not seeds. `prefMultiplier = 1 + (1 - confidence) * 0.8`.
- Explicit-genre, explicit-language and seed-derived weights are multiplied by `prefMultiplier` before saturation.
- **Mood term:** `+ boundedMood * 0.10`, from the item's genres against `moodGenreBoost`.
- **Era term:** `+0.06` when the item's `year` falls inside any selected era; no penalty otherwise.
- **Pace term:** applied only when `runtime` is known (movies from detail-enriched data): `slow_burn` favours runtime of 110 minutes or more, `fast` favours runtime of 100 minutes or less, `balanced` is neutral; weight `0.04`. Unknown runtime contributes 0.
- **Quality prior:** when `confidence < 1`, quality uses a smoothed rating `(v/(v+m))*R + (m/(v+m))*C` with `m = 300`, `C = 6.5`, `R = voteAverage`, `v = voteCount`, blended with the raw value by `confidence` (`quality = confidence*raw + (1-confidence)*smoothed`, each divided by 10).
- **Dislike penalty:** the negative-genre coefficient rises from `0.08` to `0.30` for explicitly disliked genres.
- **Hard filter:** in `hardFilter`, an item whose `primaryGenreId` is in `profile.explicit.dislikedGenres` is dropped unless `filters.genreId` equals that genre.
- **Reasons (max 3 shown):** `Because you picked <seed title>`, `Matches your <Mood> mood`, `From the <era label> you like`, plus the existing reasons.

### 2.4 Candidate retrieval

- Seeds feed a new source stream `seed`: for up to 3 seeds per page cycle (rotating), merge TMDB `similar` and `recommendations` results (existing `getServerSimilar*` helpers; add `getServerMovieRecommendations` / `getServerTVRecommendations` if missing) tagged `sourceTags: ["seed"]`.
- Disliked genres are excluded from discover queries via `without_genres`.
- Existing caching, exclusion, lease and cursor logic is unchanged.

### 2.5 Accuracy proof

An offline test (`src/test/recommendation-coldstart.test.ts`) builds synthetic users with a hidden true taste over a fixed catalogue fixture and compares old versus new ranking with precision@10 for: 0 seeds + 2 genres, 3 seeds, 10 seeds, and a rich-history user. Requirements: new engine beats old precision@10 for each thin-data case by a margin stated in the plan, and does not drop more than 0.02 for the rich-history user.

## 3. Preference screen

- Route `/preferences` (protected). Reckon opens it automatically the first time a user has no preferences; Reckon's existing preferences sheet becomes a link to it ("Tune your taste"). The old sheet and `FirstTimeSetup` are removed once the new screen ships.
- **Genre tiles:** responsive grid (2 columns at 360px, 3 at 640, 4 at 1024). Each tile has a poster collage (three TMDB posters, top popular for that genre via the existing TMDB proxy, cached 24h by react-query, gradient fallback) and the genre name. Tap cycles: neutral, liked (red ring and check), less (dimmed with a slash), neutral. Liked and less map to `preferred_genres` and `disliked_genres`.
- **Languages:** tiles with native-script name and English name; multi-select; maps to `preferred_languages`.
- **Favourite titles:** search box (TMDB multi search, movies and TV only) and a popular-poster grid; picks appear in a tray with remove buttons; max 12 with a clear counter.
- **Mood, pace, era:** chip groups (multi-select for moods and eras, single-select for pace).
- **Taste strength meter:** simple score from counts (genres liked, seeds, moods, activity), shown with plain wording about how it improves Reckon; no invented percentages.
- **Footer bar:** sticky Save ("Save and update Reckon"), above the bottom nav on phones, disabled until something changed; after save, a "Your Reckon now" strip shows the top 6 feed items.
- All touch targets at least 44px; no horizontal scroll at 360px; follows Noir tokens.

## 4. Platform adaptation

- **Home rows** (users with at least one explicit preference): up to three personalised rows above the generic rows: `Because you picked <seed title>` (seed-based), `More <top liked genre>` and `<Language> picks` for the top language. Each uses the v2 feed with `genreId` or `language` filters, or the seed stream. Users without preferences see Home unchanged.
- **Taste badge:** a small `Your taste` chip on content cards when the item matches an explicit preferred genre or language (computed client-side from the preference data already loaded by `useUserData`).
- **Greeting:** Home hero shows `Welcome back, <username>` for signed-in users (no recommendation claims).

## Testing

- Sub-project 1: API tests for validation, caps, overlap rule, defaults, stale-profile marking.
- Sub-project 2: unit tests for profile building (seeds, dislikes, tone), scoring terms, hard filter, quality prior, confidence ramp; the offline accuracy test.
- Sub-project 3: component tests for tile state cycle, seed cap, save payload; headless screenshots at 360, 768, 1440px.
- Sub-project 4: component tests for row selection rules and the taste badge.
- `vitest`, `tsc`, `eslint` clean after every task.

## Risks

- Ranking changes can make today's feed feel different. Mitigation: the offline test guards rich-history users; the confidence ramp fades the cold-start boost as activity grows.
- TMDB request volume for genre tiles. Mitigation: one request per genre, cached 24h, lazy per tile; gradient fallback.
- Old taste profiles: fingerprints change, so profiles rebuild once per user on first read.

## Next

After spec approval: one implementation plan per sub-project (writing-plans), executed in order 1, 2, 3, 4.
