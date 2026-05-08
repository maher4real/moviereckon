# Reckon Multi-Tier Recommendation Engine Design

Date: 2026-05-08

## Summary

Reckon will use a TMDB-only, non-AI, multi-tier recommendation engine. The goal is to improve recommendation quality for a low-user website without relying on paid AI ranking, external movie datasets, or multiple third-party APIs.

The engine will keep the current content-based recommendation system, strengthen it with better TMDB metadata, add strict no-repeat rules, add contextual "Show More Like This" expansion, and prepare a small optional collaborative boost that only activates when enough local user data exists.

## Goals

- Improve recommendations for users with little or no history.
- Use only TMDB as the external data source.
- Avoid AI ranking and AI-generated explanations.
- Never recommend watched, liked, watchlisted, skipped, already visible, or already loaded content.
- Use keyword matching parity across the main Reckon feed and "Show More Like This."
- Keep the existing frontend mostly intact while improving backend recommendation quality.
- Preserve fast and reliable fallback behavior when TMDB or optional metadata calls fail.

## Non-Goals

- No OpenAI, LLM, embedding, or AI reranking work.
- No MovieLens, OMDb, TVmaze, Watchmode, or other external APIs.
- No full machine-learning training pipeline.
- No large frontend redesign for this feature.
- No dependence on collaborative filtering while the user base is small.

## Architecture

The primary endpoint remains `/api/user/recommendations`. It will orchestrate these layers:

1. Build a user taste profile from MongoDB.
2. Generate candidates from TMDB sources.
3. Enrich seeds and candidates with TMDB metadata where useful.
4. Apply hard exclusions before ranking.
5. Score candidates with the shared recommendation engine.
6. Apply optional local collaborative boosts when enough app data exists.
7. Re-rank for diversity and exploration.
8. Return deterministic explanations and display-ready items.

The frontend hook `useRecommendations` can continue consuming the same endpoint. The Reckon page should need only small changes for contextual "Show More Like This" if the implementation introduces a dedicated request mode.

## Multi-Tier Candidate Pipeline

### Tier 1: User Taste Tier

Use first-party MongoDB signals:

- watch history
- liked items
- watchlist items
- content feedback
- preferred genres
- preferred languages
- inferred genres
- inferred languages

Likes, watchlist saves, and explicit preferences are strong positive signals. Recent watches are medium positive signals. `skip` is a strong negative signal and also creates hard exclusions.

### Tier 2: TMDB Similar And Recommendations Tier

Use the user's strongest seed titles to fetch:

- TMDB movie recommendations
- TMDB TV recommendations
- TMDB movie similar results
- TMDB TV similar results

Seeds should be selected from the highest-confidence user signals: liked titles first, then positive feedback, then recent watch history.

### Tier 3: TMDB Metadata Tier

Use TMDB profile metadata for seeds and selected candidates:

- genres
- keywords
- cast
- directors
- creators
- runtime
- release year
- language
- collection/franchise data when available

Metadata enrichment should be bounded and timeout-protected. If enrichment fails, the engine still returns base recommendations.

### Tier 4: TMDB Discovery Tier

Use TMDB discover and list endpoints to expand low-data feeds:

- genre discovery
- language discovery
- genre + language discovery
- people-based discovery from directors, creators, and important cast
- trending day/week
- top-rated
- popular
- new-release backfills

This tier is especially important for new users and low-history users.

### Tier 5: Optional Local Collaborative Boost Tier

Use only MovieReckon's own MongoDB data. This tier should not control the feed while the website has a small user base.

When enough data exists, apply small boosts for candidates that were also watched, liked, saved, or positively rated by users with overlapping tastes. Apply negative collaborative penalties for candidates with strong skip patterns.

If data volume is too low, this tier contributes nothing.

### Tier 6: Final Re-Ranking Tier

After scoring, re-rank to:

- keep the strongest matches near the top
- avoid repeated language blocks
- avoid repeated genre blocks
- balance movies and TV when the filter is "All"
- preserve hidden gems in the top window
- reserve a small number of exploration slots
- avoid repeating the same franchise or collection too often

## Hard Exclusion Rules

Remove candidates before ranking if they are:

- already watched by the user
- already liked by the user
- already saved in the user's watchlist
- skipped or disliked by the user
- already visible in the current Reckon feed
- already returned in the current "Show More Like This" session
- missing a valid TMDB ID or content type

These are strict rules, not score penalties.

For the main feed, user-owned exclusions come from MongoDB. For contextual "Show More Like This," the client should also send currently visible and already loaded IDs so the backend can exclude them before ranking.

## Scoring Model

The ranking score should blend:

- content similarity
- explicit genre preference match
- explicit language preference match
- inferred preference match
- TMDB similar/recommendation source strength
- shared keywords
- shared creators/directors
- meaningful cast overlap
- release era proximity
- runtime proximity where available
- quality and vote confidence
- popularity with caps to avoid generic results dominating
- novelty and hidden-gem boost
- optional collaborative boost
- negative feedback penalties for content near skipped titles

Positive user signals should outweigh generic popularity. Popularity should help break ties and avoid obscure low-confidence items, but it should not dominate personalized relevance.

## Keyword Matching Parity

Keyword matching must be shared across:

- the main Reckon feed
- contextual "Show More Like This"

Both flows should use the same keyword normalization and overlap logic. TMDB keywords from seed titles should be compared against candidate keywords. Candidates with meaningful keyword overlap should receive a boost and can produce explanations such as "Similar themes" or "Matches the tone of X."

Keyword matching should help ranking, but it must not override hard exclusions, strong negative feedback, explicit preferences, or obvious quality issues.

## Contextual Show More Like This

The current "Show More Like This" behavior should be upgraded from generic discover pagination to contextual expansion.

When the user clicks the button:

1. Use top visible and highest-ranked current recommendations as seeds.
2. Respect active filters as soft constraints.
3. Fetch more TMDB similar and recommendation results from those seeds.
4. Use matching genres, keywords, language, creators, cast, and release era.
5. Deduplicate against watched, liked, skipped, visible, and previously loaded items.
6. Return a related but varied batch.

The batch should feel connected to the current feed without repeating the same titles or becoming a simple "more popular items" list.

## Explanations

Explanations remain deterministic and non-AI. Examples:

- Because you liked `<seed title>`
- Matches your preferred genre
- Popular in your preferred language
- Similar themes
- Same creator/director
- High-rated hidden gem
- Fresh pick based on your taste
- Related to your recent watches

Explanations should come from actual scoring evidence.

## Error Handling

- If optional metadata enrichment fails, continue with base candidate scoring.
- If collaborative aggregation times out or lacks enough data, skip that tier.
- If TMDB seed-specific calls fail, use discovery, trending, and top-rated fallbacks.
- If the user has no data, use preferences first, then globally strong TMDB results.
- Keep cache behavior private and user-specific.

## Performance

- Keep API fan-out bounded.
- Use parallel TMDB requests with timeouts.
- Cache final payloads by user recommendation revision.
- Cache or reuse normalized metadata where possible.
- Keep candidate caps so endpoint runtime stays suitable for Vercel.
- Avoid client-side fan-out for recommendation generation.

## Testing

Add or update tests for:

- hard exclusion of watched, liked, watchlisted, and skipped content
- stronger skip penalties for nearby similar content
- low-data fallback with only preferences
- low-data fallback with no preferences
- keyword matching parity between main feed and show-more logic
- contextual show-more deduplication
- collaborative boost disabled when data volume is too low
- collaborative boost lifting a relevant candidate when enough data exists
- diversity re-ranking preserving language, genre, type, and hidden-gem balance
- endpoint fallback when optional metadata calls fail

## Implementation Boundaries

Likely files/modules:

- `src/backend/api/_handlers/user/recommendations.ts`
- `src/shared/lib/recommendation/types.ts`
- `src/shared/lib/recommendation/scoring.ts`
- `src/shared/lib/recommendation/ranking.ts`
- new backend helper for contextual/collaborative candidate signals
- `src/frontend/hooks/useRecommendations.tsx` if a show-more request mode is exposed
- `src/frontend/features/recommendations/Reckon.tsx` for contextual show-more behavior

The AI recommendation handler should remain unused for this engine.
