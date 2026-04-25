import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useUserData } from "./useUserData";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import {
  getRecommendationRotationBucket,
  reorderDynamicRecommendations,
} from "@/frontend/lib/dynamicRecommendations";

type RecommendationExplanation = mongoClient.RecommendationExplanation;

const RECOMMENDATION_ROTATION_POLL_MS = 60 * 1000;
const RECOMMENDATION_REFETCH_INTERVAL_MS = 3 * 60 * 1000;

interface RecommendationResult {
  items: (Movie | TVShow)[];
  isLoading: boolean;
  isRefreshing: boolean;
  isPersonalized: boolean;
  explanationById: Record<string, RecommendationExplanation>;
  refreshRecommendations: () => Promise<void>;
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
  const [manualRotationSeed, setManualRotationSeed] = useState(0);
  const [rotationBucket, setRotationBucket] = useState(() =>
    getRecommendationRotationBucket(),
  );

  const preferenceFingerprint = useMemo(
    () =>
      [
        [...(preferences?.preferred_genres || [])]
          .sort((a, b) => a - b)
          .join(","),
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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncRotationBucket = () => {
      setRotationBucket((current) => {
        const next = getRecommendationRotationBucket();
        return current === next ? current : next;
      });
    };

    syncRotationBucket();
    const timer = window.setInterval(
      syncRotationBucket,
      RECOMMENDATION_ROTATION_POLL_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  const rotationKey = useMemo(
    () => `${personalizationRevision}:${rotationBucket}:${manualRotationSeed}`,
    [manualRotationSeed, personalizationRevision, rotationBucket],
  );

  const { data, isLoading, fetchStatus } = useQuery({
    queryKey: [
      "recommendations-feed-v5",
      personalizationRevision,
      rotationBucket,
      manualRotationSeed,
    ],
    queryFn: () =>
      mongoClient.fetchRecommendationsFeed({ variant: rotationKey }),
    enabled: Boolean(user) && !userDataLoading,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: user ? RECOMMENDATION_REFETCH_INTERVAL_MS : false,
    placeholderData: (previousData) => previousData,
  });

  const hasResolvedItems = Boolean(data && Array.isArray(data.items));

  const items = useMemo(
    () =>
      reorderDynamicRecommendations(
        data?.items || [],
        data?.explanationById || {},
        rotationKey,
      ),
    [data?.items, data?.explanationById, rotationKey],
  );

  const refreshRecommendations = useCallback(async () => {
    if (!user) return;
    setManualRotationSeed((current) => current + 1);
  }, [user]);

  if (!user) {
    return {
      items: [],
      isLoading: false,
      isRefreshing: false,
      isPersonalized: false,
      explanationById: {},
      refreshRecommendations: async () => {},
    };
  }

  return {
    items,
    isLoading:
      userDataLoading ||
      (!hasResolvedItems && (isLoading || fetchStatus === "fetching")),
    isRefreshing: hasResolvedItems && fetchStatus === "fetching",
    isPersonalized: data?.isPersonalized === true,
    explanationById: data?.explanationById || {},
    refreshRecommendations,
  };
}
