import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useUserData } from "./useUserData";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import * as mongoClient from "@/frontend/lib/mongodbClient";

type RecommendationExplanation = mongoClient.RecommendationExplanation;

interface RecommendationResult {
  items: (Movie | TVShow)[];
  isLoading: boolean;
  isPersonalized: boolean;
  explanationById: Record<string, RecommendationExplanation>;
}

function getLatestTimestamp<T>(
  items: T[],
  resolver: (item: T) => string | undefined,
): string {
  if (!items.length) return "";
  const value = resolver(items[0]);
  return typeof value === "string" ? value : "";
}

export function useRecommendations(): RecommendationResult {
  const { user } = useAuth();
  const {
    watchHistory,
    likedItems,
    feedbackItems,
    preferences,
    isLoading: userDataLoading,
  } = useUserData();

  const preferenceFingerprint = useMemo(
    () =>
      [
        [...(preferences?.preferred_genres || [])].sort((a, b) => a - b).join(","),
        [...(preferences?.preferred_languages || [])].sort().join(","),
      ].join("|"),
    [preferences],
  );

  const personalizationRevision = useMemo(() => {
    const historyPart = `${watchHistory.length}:${getLatestTimestamp(watchHistory, (item) => item.watched_at)}`;
    const likedPart = `${likedItems.length}:${getLatestTimestamp(likedItems, (item) => item.liked_at)}`;
    const feedbackPart = `${feedbackItems.length}:${getLatestTimestamp(feedbackItems, (item) => item.updated_at)}`;

    return `${historyPart}|${likedPart}|${feedbackPart}|${preferenceFingerprint}`;
  }, [feedbackItems, likedItems, preferenceFingerprint, watchHistory]);

  const { data, isLoading, fetchStatus } = useQuery({
    queryKey: ["recommendations-feed-v3", personalizationRevision],
    queryFn: () => mongoClient.fetchRecommendationsFeed(),
    enabled: Boolean(user) && !userDataLoading,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    placeholderData: (previousData) => previousData,
  });
  const hasResolvedItems = Boolean(data && Array.isArray(data.items));

  if (!user) {
    return {
      items: [],
      isLoading: false,
      isPersonalized: false,
      explanationById: {},
    };
  }

  return {
    items: data?.items || [],
    isLoading:
      userDataLoading ||
      (!hasResolvedItems && (isLoading || fetchStatus === "fetching")),
    isPersonalized: data?.isPersonalized === true,
    explanationById: data?.explanationById || {},
  };
}
