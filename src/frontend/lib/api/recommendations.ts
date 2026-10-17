/** Part of the frontend API client; re-exported from `@/frontend/lib/mongodbClient`. */
import { fetchWithAuth } from "./http";
import { RecommendationFeedError } from "./models";
import type { PersonalizedRecommendationsPayload, RecommendationFeedOptions, RecommendationFeedPage, RecommendationTasteProfile, TasteExplorationMode, RecommendationTasteControls, RecommendationTasteSnapshot, AIRecommendationsPayload } from "./models";

export async function fetchRecommendationsFeed(
  options?: RecommendationFeedOptions,
): Promise<PersonalizedRecommendationsPayload> {
  const emptyPayload: PersonalizedRecommendationsPayload = {
    items: [],
    isPersonalized: false,
    explanationById: {},
  };

  try {
    const query = new URLSearchParams();
    if (options?.variant) {
      query.set("variant", options.variant);
    }
    if (options?.mode) query.set("mode", options.mode);
    options?.seedKeys?.slice(0, 12).forEach((key) => query.append("seed", key));
    options?.excludedKeys
      ?.slice(0, 160)
      .forEach((key) => query.append("exclude", key));
    if (options?.genre && options.genre !== "all") query.set("genre", options.genre);
    if (options?.language && options.language !== "all") {
      query.set("language", options.language);
    }
    if (options?.contentType && options.contentType !== "all") {
      query.set("content_type", options.contentType);
    }
    if (options?.recommendationType && options.recommendationType !== "all") {
      query.set("recommendation_type", options.recommendationType);
    }
    if (options?.sort && options.sort !== "relevance") query.set("sort", options.sort);
    if (options?.limit) query.set("limit", String(options.limit));

    const endpoint = query.size > 0
      ? `/api/user/recommendations?${query.toString()}`
      : "/api/user/recommendations";

    const response = await fetchWithAuth(endpoint);
    if (!response.ok) return emptyPayload;

    const data = await response.json();
    const payload = data?.data as Partial<PersonalizedRecommendationsPayload> | undefined;

    if (!payload || !Array.isArray(payload.items)) {
      return emptyPayload;
    }

    return {
      items: payload.items,
      isPersonalized: payload.isPersonalized === true,
      explanationById:
        payload.explanationById && typeof payload.explanationById === "object"
          ? payload.explanationById
          : {},
    };
  } catch {
    return emptyPayload;
  }
}

export async function fetchRecommendationsPage(
  options: {
    cursor?: string | null;
    limit?: number;
    genre?: string;
    language?: string;
    contentType?: "all" | "movie" | "tv";
    recommendationType?: "all" | "trending" | "highrated" | "popular" | "newreleases";
    sort?: "relevance" | "popularity" | "rating" | "release_date";
    sortOrder?: "asc" | "desc";
    exploration?: TasteExplorationMode;
    signal?: AbortSignal;
  } = {},
): Promise<RecommendationFeedPage> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  if (options.genre && options.genre !== "all") query.set("genre", options.genre);
  if (options.language && options.language !== "all") query.set("language", options.language);
  if (options.contentType && options.contentType !== "all") query.set("content_type", options.contentType);
  if (options.recommendationType && options.recommendationType !== "all") {
    query.set("recommendation_type", options.recommendationType);
  }
  if (options.sort && options.sort !== "relevance") query.set("sort", options.sort);
  if (options.sortOrder && options.sortOrder !== "desc") query.set("sort_order", options.sortOrder);
  if (options.exploration && options.exploration !== "familiar") query.set("exploration", options.exploration);
  const response = await fetchWithAuth(`/api/user/recommendations/v2?${query.toString()}`, {
    signal: options.signal,
  });
  const body = await response.json().catch(() => null);
  const page = body?.data as Partial<RecommendationFeedPage> | undefined;
  if (!response.ok) {
    const error = new RecommendationFeedError(
      typeof body?.error === "string" ? body.error : `Recommendation request failed (${response.status})`,
      {
        status: response.status,
        code: typeof body?.code === "string" ? body.code : undefined,
      },
    );
    throw error;
  }
  if (!page || !Array.isArray(page.items)) {
    throw new RecommendationFeedError("Recommendation response was malformed", { code: "MALFORMED_RESPONSE" });
  }
  return {
    items: page.items,
    explanationById: page.explanationById && typeof page.explanationById === "object" ? page.explanationById : {},
    nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
    hasMore: page.hasMore === true,
    state: page.state === "ready" || page.state === "exhausted" ? page.state : "retryable",
    profileVersion: Number.isFinite(Number(page.profileVersion)) ? Number(page.profileVersion) : 0,
    feedSessionId: typeof page.feedSessionId === "string" ? page.feedSessionId : "",
    isPersonalized: page.isPersonalized === true,
  };
}

export async function fetchRecommendationTasteProfile(): Promise<RecommendationTasteProfile | null> {
  try {
    const response = await fetchWithAuth("/api/user/recommendations/v2/profile");
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.data || null;
  } catch {
    return null;
  }
}

export async function fetchRecommendationTasteSnapshot(): Promise<RecommendationTasteSnapshot | null> {
  try {
    const response = await fetchWithAuth("/api/user/taste");
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    const data = body?.data as Partial<RecommendationTasteSnapshot> | undefined;
    if (!data?.profile || !data.controls) return null;
    return {
      profile: data.profile as RecommendationTasteProfile,
      controls: data.controls as RecommendationTasteControls,
    };
  } catch {
    return null;
  }
}

export async function updateRecommendationTasteControls(input: {
  explorationMode?: TasteExplorationMode;
  excludeLearningKey?: string;
  restoreLearningKey?: string;
}): Promise<RecommendationTasteSnapshot | null> {
  try {
    const response = await fetchWithAuth("/api/user/taste", {
      method: "PUT",
      body: JSON.stringify({
        exploration_mode: input.explorationMode,
        exclude_learning_key: input.excludeLearningKey,
        restore_learning_key: input.restoreLearningKey,
      }),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.data || null;
  } catch {
    return null;
  }
}

export async function resetRecommendationTaste(): Promise<RecommendationTasteSnapshot | null> {
  try {
    const response = await fetchWithAuth("/api/user/taste/reset", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.data || null;
  } catch {
    return null;
  }
}

export async function fetchMoreLikeThisRecommendations(
  options: Omit<RecommendationFeedOptions, "mode">,
): Promise<PersonalizedRecommendationsPayload> {
  return fetchRecommendationsFeed({
    ...options,
    mode: "more-like-this",
  });
}

export async function fetchAIRecommendations(): Promise<AIRecommendationsPayload> {
  const empty: AIRecommendationsPayload = { items: [], explanationById: {}, isAIRanked: true };
  try {
    const response = await fetchWithAuth("/api/user/ai-recommendations");
    if (!response.ok) return empty;
    const data = await response.json();
    const payload = data?.data as Partial<AIRecommendationsPayload> | undefined;
    if (!payload || !Array.isArray(payload.items)) return empty;
    return {
      items: payload.items,
      explanationById: payload.explanationById && typeof payload.explanationById === "object"
        ? payload.explanationById
        : {},
      isAIRanked: true,
    };
  } catch {
    return empty;
  }
}

// ========== Watchlist ==========
