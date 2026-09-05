import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

type RecommendationExplanation = mongoClient.RecommendationExplanation;

export interface RecommendationHookOptions {
  contentType?: "all" | "movie" | "tv";
  recommendationType?: "all" | "trending" | "highrated" | "popular" | "newreleases";
  genre?: string;
  language?: string;
  sort?: "relevance" | "popularity" | "rating" | "release_date";
  sortOrder?: "asc" | "desc";
  exploration?: "familiar" | "adventurous";
}

// Roll out the durable feed explicitly. Production and unset environments
// keep the legacy endpoint; setting NEXT_PUBLIC_RECOMMENDATIONS_V2=true opts
// into v2. There is deliberately no silent v2-to-legacy fallback because
// doing so would drop strict filters and invalidate cursor semantics.
export const RECOMMENDATIONS_V2_ENABLED = process.env.NEXT_PUBLIC_RECOMMENDATIONS_V2 === "true";

interface RecommendationResult {
  items: (Movie | TVShow)[];
  isLoading: boolean;
  isRefreshing: boolean;
  isFetchingNextPage: boolean;
  hasError: boolean;
  errorCode?: string;
  hasMore: boolean;
  state: "ready" | "retryable" | "exhausted";
  profileVersion: number;
  feedSessionId: string;
  isPersonalized: boolean;
  explanationById: Record<string, RecommendationExplanation>;
  fetchNextPage: () => Promise<unknown>;
  refreshRecommendations: () => Promise<void>;
  retryRecommendations: () => Promise<unknown>;
  feedMode: "legacy" | "v2";
}

export function useRecommendations(options: RecommendationHookOptions = {}): RecommendationResult {
  const { user } = useAuth();
  const [refreshSeed, setRefreshSeed] = useState(0);
  const contentType = options.contentType || "all";
  const recommendationType = options.recommendationType || "all";
  const genre = options.genre || "all";
  const language = options.language || "all";
  const sort = options.sort || "relevance";
  const sortOrder = options.sortOrder || "desc";
  const exploration = options.exploration || "familiar";
  const feedMode = RECOMMENDATIONS_V2_ENABLED ? "v2" : "legacy";

  const query = useInfiniteQuery({
    queryKey: [
      `recommendations-feed-${feedMode}`,
      user?.id || "anonymous",
      refreshSeed,
      contentType,
      recommendationType,
      genre,
      language,
      sort,
      sortOrder,
      exploration,
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      if (feedMode === "v2") {
        return mongoClient.fetchRecommendationsPage({
          cursor: pageParam,
          limit: 24,
          contentType,
          recommendationType,
          genre,
          language,
          sort,
          sortOrder,
          exploration,
          signal,
        });
      }
      const payload = await mongoClient.fetchRecommendationsFeed({
        contentType,
        recommendationType,
        genre,
        language,
        sort,
      });
      return {
        items: payload.items,
        explanationById: payload.explanationById,
        nextCursor: null,
        hasMore: false,
        state: "exhausted" as const,
        profileVersion: 0,
        feedSessionId: "legacy",
        isPersonalized: payload.isPersonalized,
      };
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    enabled: Boolean(user),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const queryPages = query.data?.pages;
  const pages = useMemo(() => queryPages || [], [queryPages]);
  const rawItems = useMemo(
    () => pages.flatMap((page) => page.items),
    [pages],
  );
  const explanationById = useMemo(
    () =>
      pages.reduce<Record<string, RecommendationExplanation>>((result, page) => {
        Object.assign(result, page.explanationById);
        return result;
      }, {}),
    [pages],
  );
  // The server stores ranked page order. Preserve it when pages append so
  // returning from a detail view never reshuffles cards already seen.
  const items = rawItems;
  const latestPage = pages[pages.length - 1];
  const hasResolvedItems = pages.length > 0;
  const queryFetchNextPage = query.fetchNextPage;
  const queryHasError = query.isError;
  const queryError = query.error as { code?: string; status?: number } | null;
  const shouldRestartSession = queryError?.status === 410 ||
    queryError?.code === "SESSION_EXPIRED";

  const refreshRecommendations = useCallback(async () => {
    if (!user) return;
    setRefreshSeed((current) => current + 1);
  }, [user]);

  const fetchNextPage = useCallback(() => queryFetchNextPage(), [queryFetchNextPage]);
  const retryRecommendations = useCallback(async () => {
    if (!shouldRestartSession && queryHasError && hasResolvedItems && latestPage?.nextCursor) {
      return queryFetchNextPage();
    }
    await refreshRecommendations();
  }, [hasResolvedItems, latestPage?.nextCursor, queryFetchNextPage, queryHasError, refreshRecommendations, shouldRestartSession]);

  if (!user) {
    return {
      items: [],
      isLoading: false,
      isRefreshing: false,
      isFetchingNextPage: false,
      hasError: false,
      errorCode: undefined,
      hasMore: false,
      state: "exhausted",
      profileVersion: 0,
      feedSessionId: "",
      isPersonalized: false,
      explanationById: {},
      fetchNextPage: async () => undefined,
      refreshRecommendations: async () => undefined,
      retryRecommendations: async () => undefined,
      feedMode,
    };
  }

  return {
    items,
    isLoading: !hasResolvedItems && query.isLoading,
    isRefreshing: hasResolvedItems && query.isFetching && !query.isFetchingNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    hasError: queryHasError,
    errorCode: queryError?.code,
    hasMore: queryHasError ? Boolean(latestPage?.nextCursor) : latestPage?.hasMore === true,
    state: queryHasError ? "retryable" : latestPage?.state || "ready",
    profileVersion: latestPage?.profileVersion || 0,
    feedSessionId: latestPage?.feedSessionId || "",
    isPersonalized: latestPage?.isPersonalized === true,
    explanationById,
    fetchNextPage,
    refreshRecommendations,
    retryRecommendations,
    feedMode,
  };
}
