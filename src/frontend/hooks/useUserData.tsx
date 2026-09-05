/**
 * User Data Hook - MongoDB Backend Only
 * No fallback to other services
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { useToast } from "@/frontend/hooks/use-toast";

export interface WatchedItem {
  id: string;
  user_id: string;
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres: number[];
  language: string;
  watched_at: string;
}

export interface LikedItem {
  id: string;
  user_id: string;
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres?: number[];
  language?: string;
  liked_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_languages: string[];
  preferred_genres: number[];
  inferred_languages?: string[];
  inferred_genres?: number[];
}

export type FeedbackType = mongoClient.FeedbackType;

export interface FeedbackItem {
  id: string;
  user_id: string;
  content_id: number;
  content_type: "movie" | "tv";
  feedback_type: FeedbackType;
  title: string;
  poster_path: string | null;
  genres: number[];
  language: string;
  created_at: string;
  updated_at: string;
  suppress_until?: string | null;
}

interface UserDataContextType {
  watchHistory: WatchedItem[];
  likedItems: LikedItem[];
  feedbackItems: FeedbackItem[];
  preferences: UserPreferences | null;
  isLoading: boolean;
  addToWatchHistory: (item: Omit<WatchedItem, "id" | "user_id" | "watched_at">) => Promise<void>;
  removeFromWatchHistory: (contentId: number, contentType: "movie" | "tv") => Promise<void>;
  isWatched: (contentId: number, contentType: "movie" | "tv") => boolean;
  toggleLike: (item: Omit<LikedItem, "id" | "user_id" | "liked_at">) => Promise<void>;
  isLiked: (contentId: number, contentType: "movie" | "tv") => boolean;
  setFeedback: (item: {
    content_id: number;
    content_type: "movie" | "tv";
    feedback_type: FeedbackType;
    title?: string;
    poster_path?: string | null;
    genres?: number[];
    language?: string;
  }) => Promise<mongoClient.FeedbackMutationResult>;
  removeFeedback: (contentId: number, contentType: "movie" | "tv") => Promise<mongoClient.FeedbackMutationResult>;
  getFeedback: (contentId: number, contentType: "movie" | "tv") => FeedbackType | null;
  getRecentlyWatched: (limit?: number) => WatchedItem[];
  getTopGenres: (limit?: number) => number[];
  clearHistory: () => Promise<void>;
  refreshData: () => Promise<void>;
  updatePreferences: (prefs: { preferred_languages?: string[]; preferred_genres?: number[] }) => Promise<UserPreferences>;
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

function getContentKey(contentId: number, contentType: "movie" | "tv"): string {
  return `${contentType}:${contentId}`;
}

type ContentEntry = {
  content_id: number;
  content_type: "movie" | "tv";
};

function splitEntriesByContent<T extends ContentEntry>(
  entries: T[],
  contentId: number,
  contentType: "movie" | "tv",
): { match: T | null; remaining: T[] } {
  let match: T | null = null;
  const remaining: T[] = [];

  for (const entry of entries) {
    if (entry.content_id === contentId && entry.content_type === contentType) {
      if (match === null) {
        match = entry;
      }
      continue;
    }

    remaining.push(entry);
  }

  return { match, remaining };
}

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [watchHistory, setWatchHistory] = useState<WatchedItem[]>([]);
  const [likedItems, setLikedItems] = useState<LikedItem[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pendingWatchMutations = useRef(new Set<string>());
  const pendingLikeMutations = useRef(new Set<string>());
  const fetchTokenRef = useRef(0);
  const watchedLookup = useMemo(
    () => new Set(watchHistory.map((entry) => getContentKey(entry.content_id, entry.content_type))),
    [watchHistory],
  );
  const likedLookup = useMemo(
    () => new Set(likedItems.map((entry) => getContentKey(entry.content_id, entry.content_type))),
    [likedItems],
  );
  const feedbackLookup = useMemo(
    () =>
      new Map(
        feedbackItems.map((entry) => [
          getContentKey(entry.content_id, entry.content_type),
          entry,
        ]),
      ),
    [feedbackItems],
  );
  const topGenres = useMemo(() => {
    if (!watchHistory.length) return [];

    const genreCounts = new Map<number, number>();
    for (const item of watchHistory) {
      for (const genre of item.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }
    }

    return Array.from(genreCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([genre]) => genre);
  }, [watchHistory]);

  // Get user ID
  const getUserId = useCallback(() => {
    if (!user) return null;
    return user.id;
  }, [user]);

  // Fetch User Data from MongoDB
  const fetchUserData = useCallback(async () => {
    const userId = getUserId();
    const fetchToken = fetchTokenRef.current + 1;
    fetchTokenRef.current = fetchToken;
    
    if (!userId) {
      setWatchHistory([]);
      setLikedItems([]);
      setFeedbackItems([]);
      setPreferences(null);
      setIsLoading(false);
      return;
    }

    try {
      const [history, liked, feedback, prefs] = await Promise.all([
        mongoClient.fetchWatchHistory(),
        mongoClient.fetchLikedItems(),
        mongoClient.fetchUserFeedback(),
        mongoClient.fetchUserPreferences(),
      ]);

      if (fetchTokenRef.current !== fetchToken) return;
      setWatchHistory(history as WatchedItem[]);
      setLikedItems(liked as LikedItem[]);
      setFeedbackItems(feedback as FeedbackItem[]);
      setPreferences(prefs as UserPreferences | null);
    } catch (error) {
      console.error("Error fetching user data:", error);
      if (fetchTokenRef.current !== fetchToken) return;
      setWatchHistory([]);
      setLikedItems([]);
      setFeedbackItems([]);
      setPreferences(null);
    } finally {
      if (fetchTokenRef.current === fetchToken) {
        setIsLoading(false);
      }
    }
  }, [getUserId]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Add to Watch History
  const addToWatchHistory = useCallback(
    async (item: Omit<WatchedItem, "id" | "user_id" | "watched_at">) => {
      const userId = getUserId();
      if (!userId) return;
      const mutationKey = getContentKey(item.content_id, item.content_type);
      if (pendingWatchMutations.current.has(mutationKey)) return;

      pendingWatchMutations.current.add(mutationKey);
      const optimisticTimestamp = new Date().toISOString();
      let previousMatch: WatchedItem | null = null;

      setWatchHistory((prev) => {
        const { match, remaining } = splitEntriesByContent(
          prev,
          item.content_id,
          item.content_type,
        );
        previousMatch = match;

        return [
          {
            id: `optimistic-watch:${mutationKey}`,
            user_id: userId,
            content_id: item.content_id,
            content_type: item.content_type,
            title: item.title,
            poster_path: item.poster_path,
            genres: item.genres || [],
            language: item.language || "en",
            watched_at: optimisticTimestamp,
          },
          ...remaining,
        ];
      });

      try {
        const result = await mongoClient.addToWatchHistory(item);
        if (!result) {
          throw new Error("watch_history_update_failed");
        }

        setWatchHistory((prev) => {
          const { remaining } = splitEntriesByContent(
            prev,
            item.content_id,
            item.content_type,
          );
          return [result as WatchedItem, ...remaining];
        });
        return;
      } catch (error) {
        console.error("Error adding to watch history:", error);
        setWatchHistory((prev) => {
          const { remaining } = splitEntriesByContent(
            prev,
            item.content_id,
            item.content_type,
          );
          return previousMatch ? [previousMatch, ...remaining] : remaining;
        });
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update watch history",
        });
      } finally {
        pendingWatchMutations.current.delete(mutationKey);
      }
    },
    [getUserId, toast]
  );

  // Remove from Watch History
  const removeFromWatchHistory = useCallback(
    async (contentId: number, contentType: "movie" | "tv") => {
      const userId = getUserId();
      if (!userId) return;

      try {
        await mongoClient.removeFromWatchHistory(contentId, contentType);
        setWatchHistory((prev) =>
          prev.filter((w) => !(w.content_id === contentId && w.content_type === contentType))
        );
      } catch (error) {
        console.error("Error removing from watch history:", error);
      }
    },
    [getUserId]
  );

  // Is Watched
  const isWatched = useCallback(
    (contentId: number, contentType: "movie" | "tv") => {
      return watchedLookup.has(getContentKey(contentId, contentType));
    },
    [watchedLookup]
  );

  // Toggle Like
  const toggleLike = useCallback(
    async (item: Omit<LikedItem, "id" | "user_id" | "liked_at">) => {
      const userId = getUserId();
      if (!userId) return;
      const mutationKey = getContentKey(item.content_id, item.content_type);
      if (pendingLikeMutations.current.has(mutationKey)) return;

      pendingLikeMutations.current.add(mutationKey);
      const optimisticTimestamp = new Date().toISOString();
      let previousMatch: LikedItem | null = null;

      setLikedItems((prev) => {
        const { match, remaining } = splitEntriesByContent(
          prev,
          item.content_id,
          item.content_type,
        );
        previousMatch = match;

        if (previousMatch) {
          return remaining;
        }

        return [
          {
            id: `optimistic-like:${mutationKey}`,
            user_id: userId,
            content_id: item.content_id,
            content_type: item.content_type,
            title: item.title,
            poster_path: item.poster_path,
            genres: item.genres || [],
            language: item.language || "en",
            liked_at: optimisticTimestamp,
          },
          ...remaining,
        ];
      });

      try {
        const result = await mongoClient.toggleLikeItem(item);
        if (!result.ok) {
          throw new Error("toggle_like_failed");
        }

        if (result.action === "added" && result.data) {
          setLikedItems((prev) => {
            const { remaining } = splitEntriesByContent(
              prev,
              item.content_id,
              item.content_type,
            );
            return [result.data as LikedItem, ...remaining];
          });
          return;
        }

        if (result.action === "removed") {
          setLikedItems((prev) =>
            splitEntriesByContent(prev, item.content_id, item.content_type).remaining
          );
          return;
        }

        setLikedItems((prev) => {
          const { remaining } = splitEntriesByContent(
            prev,
            item.content_id,
            item.content_type,
          );
          return previousMatch ? [previousMatch, ...remaining] : remaining;
        });
      } catch (error) {
        console.error("Error toggling like:", error);
        setLikedItems((prev) => {
          const { remaining } = splitEntriesByContent(
            prev,
            item.content_id,
            item.content_type,
          );
          return previousMatch ? [previousMatch, ...remaining] : remaining;
        });
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update like status",
        });
      } finally {
        pendingLikeMutations.current.delete(mutationKey);
      }
    },
    [getUserId, toast]
  );

  // Is Liked
  const isLiked = useCallback(
    (contentId: number, contentType: "movie" | "tv") => {
      return likedLookup.has(getContentKey(contentId, contentType));
    },
    [likedLookup]
  );

  const setFeedback = useCallback(
    async (item: {
      content_id: number;
      content_type: "movie" | "tv";
      feedback_type: FeedbackType;
      title?: string;
      poster_path?: string | null;
      genres?: number[];
      language?: string;
    }): Promise<mongoClient.FeedbackMutationResult> => {
      const userId = getUserId();
      if (!userId) return { ok: false, action: "removed" as const, data: null };

      try {
        const result = await mongoClient.setContentFeedback(item);

        if (!result.ok) {
          toast({
            variant: "destructive",
            title: "Feedback unavailable",
            description: "Your feedback could not be saved. Please try again.",
          });
          return result;
        }

        if (result.action === "removed") {
          setFeedbackItems((prev) =>
            splitEntriesByContent(prev, item.content_id, item.content_type).remaining
          );
          return result;
        }

        if (result.data) {
          setFeedbackItems((prev) => {
            const { remaining } = splitEntriesByContent(
              prev,
              result.data!.content_id,
              result.data!.content_type,
            );
            return [result.data as FeedbackItem, ...remaining];
          });
        }
        return result;
      } catch (error) {
        console.error("Error setting feedback:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update feedback",
        });
        return { ok: false, action: "removed" as const, data: null };
      }
    },
    [getUserId, toast]
  );

  const getFeedback = useCallback(
    (contentId: number, contentType: "movie" | "tv") => {
      const feedback = feedbackLookup.get(getContentKey(contentId, contentType));
      if (
        feedback?.feedback_type === "not_now" &&
        feedback.suppress_until &&
        Number.isFinite(Date.parse(feedback.suppress_until)) &&
        Date.parse(feedback.suppress_until) <= Date.now()
      ) {
        return null;
      }
      return feedback?.feedback_type || null;
    },
    [feedbackLookup]
  );

  const removeFeedback = useCallback(
    async (contentId: number, contentType: "movie" | "tv"): Promise<mongoClient.FeedbackMutationResult> => {
      if (!getUserId()) return { ok: false, action: "removed", data: null };
      const result = await mongoClient.removeContentFeedback(contentId, contentType);
      if (result.ok) {
        setFeedbackItems((prev) => splitEntriesByContent(prev, contentId, contentType).remaining);
      } else {
        toast({
          variant: "destructive",
          title: "Feedback unavailable",
          description: "Your feedback could not be updated. Please try again.",
        });
      }
      return result;
    },
    [getUserId, toast],
  );

  // Get Recently Watched
  const getRecentlyWatched = useCallback(
    (limit = 10) => {
      return watchHistory.slice(0, limit);
    },
    [watchHistory]
  );

  // Get Top Genres
  const getTopGenres = useCallback(
    (limit = 5) => {
      return topGenres.slice(0, limit);
    },
    [topGenres]
  );

  // Clear History
  const clearHistory = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;

    try {
      await mongoClient.clearAllHistory();

      setWatchHistory([]);
      setLikedItems([]);
      setPreferences((prev) =>
        prev ? { ...prev, inferred_languages: [], inferred_genres: [] } : null
      );

      toast({
        title: "History cleared",
        description: "Your watch history and likes have been cleared.",
      });
    } catch (error) {
      console.error("Error clearing history:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to clear history",
      });
    }
  }, [getUserId, toast]);

  // Refresh Data
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    await fetchUserData();
  }, [fetchUserData]);

  // Update Preferences
  const updatePreferences = useCallback(
    async (prefs: { preferred_languages?: string[]; preferred_genres?: number[] }) => {
      const userId = getUserId();
      if (!userId) throw new Error("User is not signed in");
      try {
        const result = await mongoClient.updateUserPreferences(prefs);
        if (!result) {
          throw new Error("preferences_update_failed");
        }
        setPreferences(result as UserPreferences);
        return result as UserPreferences;
      } catch (error) {
        console.error("Error updating preferences:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save preferences",
        });
        throw error;
      }
    },
    [getUserId, toast],
  );

  return (
    <UserDataContext.Provider
      value={{
        watchHistory,
        likedItems,
        feedbackItems,
        preferences,
        isLoading,
        addToWatchHistory,
        removeFromWatchHistory,
        isWatched,
        toggleLike,
        isLiked,
        setFeedback,
        removeFeedback,
        getFeedback,
        getRecentlyWatched,
        getTopGenres,
        clearHistory,
        refreshData,
        updatePreferences,
      }}
    >
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData() {
  const context = useContext(UserDataContext);
  if (context === undefined) {
    throw new Error("useUserData must be used within a UserDataProvider");
  }
  return context;
}
