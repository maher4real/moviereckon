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
type AIExplanation = { label: string; text: string };

const RECOMMENDATION_ROTATION_POLL_MS = 60 * 1000;
const RECOMMENDATION_REFETCH_INTERVAL_MS = 3 * 60 * 1000;

interface RecommendationResult {
  items: (Movie | TVShow)[];
  aiItems: (Movie | TVShow)[];
  isLoading: boolean;
  isRefreshing: boolean;
  isPersonalized: boolean;
  isAIRanked: boolean;
  explanationById: Record<string, RecommendationExplanation>;
  aiExplanationById: Record<string, AIExplanation>;
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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncRotationBucket = () => {
      setRotationBucket((current) => {
        const next = getRecommendationRotationBucket();
        return current === next ? current : next;
      });
    };

    syncRotationBucket();
    const timer = window.setInterval(syncRotationBucket, RECOMMENDATION_ROTATION_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const rotationKey = useMemo(
    () => `${personalizationRevision}:${rotationBucket}:${manualRotationSeed}`,
    [manualRotationSeed, personalizationRevision, rotationBucket],
  );

  // Rule-based recommendations (existing engine)
  const { data, isLoading, fetchStatus } = useQuery({
    queryKey: [
      "recommendations-feed-v4",
      personalizationRevision,
      rotationBucket,
      manualRotationSeed,
    ],
    queryFn: () => mongoClient.fetchRecommendationsFeed({ variant: rotationKey }),
    enabled: Boolean(user) && !userDataLoading,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: user ? RECOMMENDATION_REFETCH_INTERVAL_MS : false,
    placeholderData: (previousData) => previousData,
  });

  // AI recommendations (OpenAI embeddings + GPT-4.1-mini re-ranking)
  // Only fires when the user has some history (>=3 items) to form a taste profile.
  const hasEnoughHistory = watchHistory.length >= 3 || likedItems.length >= 3;
  const { data: aiData } = useQuery({
    queryKey: ["ai-recommendations", personalizationRevision],
    queryFn: () => mongoClient.fetchAIRecommendations(),
    enabled: Boolean(user) && !userDataLoading && hasEnoughHistory,
    staleTime: 1000 * 60 * 30, // 30 mins: reduced refetch frequency, better cache hit rate
    gcTime: 1000 * 60 * 60,    // 1 hour: keep in memory longer for faster re-access
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const hasResolvedItems = Boolean(data && Array.isArray(data.items));
  const hasAIItems = Boolean(aiData && aiData.items.length > 0);

  // Merge: if AI items exist, interleave them at positions 0, 4, 8... into
  // the rule-based list so the feed feels enriched without being pure AI.
  const mergedItems = useMemo(() => {
    const base = reorderDynamicRecommendations(
      data?.items || [],
      data?.explanationById || {},
      rotationKey,
    );

    if (!hasAIItems || !aiData) return base;

    // Build a set of IDs already in base to avoid duplicates
    const baseIds = new Set(
      base.map((item) => {
        const m = item as Movie;
        const t = item as TVShow;
        return m.id ?? t.id;
      }),
    );

    // AI items not already present in base
    const aiOnly = aiData.items.filter((item) => {
      const id = (item as Movie).id ?? (item as TVShow).id;
      return !baseIds.has(id);
    });

    // Interleave: insert one AI item every 4 base items
    const merged: (Movie | TVShow)[] = [];
    let aiIdx = 0;

    for (let i = 0; i < base.length; i++) {
      if (i > 0 && i % 4 === 0 && aiIdx < aiOnly.length) {
        merged.push(aiOnly[aiIdx++]);
      }
      merged.push(base[i]);
    }

    // Append remaining AI items at end
    while (aiIdx < aiOnly.length) {
      merged.push(aiOnly[aiIdx++]);
    }

    return merged;
  }, [data?.items, data?.explanationById, rotationKey, aiData, hasAIItems]);

  const refreshRecommendations = useCallback(async () => {
    if (!user) return;
    setManualRotationSeed((current) => current + 1);
  }, [user]);

  if (!user) {
    return {
      items: [],
      aiItems: [],
      isLoading: false,
      isRefreshing: false,
      isPersonalized: false,
      isAIRanked: false,
      explanationById: {},
      aiExplanationById: {},
      refreshRecommendations: async () => {},
    };
  }

  return {
    items: mergedItems,
    aiItems: aiData?.items || [],
    isLoading:
      userDataLoading ||
      (!hasResolvedItems && (isLoading || fetchStatus === "fetching")),
    isRefreshing: hasResolvedItems && fetchStatus === "fetching",
    isPersonalized: data?.isPersonalized === true,
    isAIRanked: hasAIItems,
    explanationById: data?.explanationById || {},
    aiExplanationById: aiData?.explanationById || {},
    refreshRecommendations,
  };
}
