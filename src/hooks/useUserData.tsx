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
import * as mongoClient from "@/lib/mongodbClient";
import { useToast } from "@/hooks/use-toast";

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
  liked_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_languages: string[];
  preferred_genres: number[];
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
  }) => Promise<void>;
  getFeedback: (contentId: number, contentType: "movie" | "tv") => FeedbackType | null;
  getRecentlyWatched: (limit?: number) => WatchedItem[];
  getTopGenres: (limit?: number) => number[];
  clearHistory: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

function getContentKey(contentId: number, contentType: "movie" | "tv"): string {
  return `${contentType}:${contentId}`;
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
      const [history, liked] = await Promise.all([
        mongoClient.fetchWatchHistory(),
        mongoClient.fetchLikedItems(),
      ]);

      if (fetchTokenRef.current !== fetchToken) return;
      setWatchHistory(history as WatchedItem[]);
      setLikedItems(liked as LikedItem[]);
      setIsLoading(false);

      void (async () => {
        try {
          const [feedback, prefs] = await Promise.all([
            mongoClient.fetchUserFeedback(),
            mongoClient.fetchUserPreferences(),
          ]);
          if (fetchTokenRef.current !== fetchToken) return;
          setFeedbackItems(feedback as FeedbackItem[]);
          setPreferences(prefs as UserPreferences | null);
        } catch (error) {
          console.error("Error fetching secondary user data:", error);
        }
      })();
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
        previousMatch =
          prev.find(
            (entry) =>
              entry.content_id === item.content_id &&
              entry.content_type === item.content_type,
          ) || null;

        const filtered = prev.filter(
          (entry) =>
            !(
              entry.content_id === item.content_id &&
              entry.content_type === item.content_type
            ),
        );

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
          ...filtered,
        ];
      });

      try {
        const result = await mongoClient.addToWatchHistory(item);
        if (!result) {
          throw new Error("watch_history_update_failed");
        }

        setWatchHistory((prev) => {
          const filtered = prev.filter(
            (entry) =>
              !(
                entry.content_id === item.content_id &&
                entry.content_type === item.content_type
              ),
          );
          return [result as WatchedItem, ...filtered];
        });
        return;
      } catch (error) {
        console.error("Error adding to watch history:", error);
        setWatchHistory((prev) => {
          const filtered = prev.filter(
            (entry) =>
              !(
                entry.content_id === item.content_id &&
                entry.content_type === item.content_type
              ),
          );
          return previousMatch ? [previousMatch, ...filtered] : filtered;
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
        previousMatch =
          prev.find(
            (entry) =>
              entry.content_id === item.content_id &&
              entry.content_type === item.content_type,
          ) || null;

        if (previousMatch) {
          return prev.filter(
            (entry) =>
              !(
                entry.content_id === item.content_id &&
                entry.content_type === item.content_type
              ),
          );
        }

        return [
          {
            id: `optimistic-like:${mutationKey}`,
            user_id: userId,
            content_id: item.content_id,
            content_type: item.content_type,
            title: item.title,
            poster_path: item.poster_path,
            liked_at: optimisticTimestamp,
          },
          ...prev,
        ];
      });

      try {
        const result = await mongoClient.toggleLikeItem(item);
        if (!result.ok) {
          throw new Error("toggle_like_failed");
        }

        if (result.action === "added" && result.data) {
          setLikedItems((prev) =>
            [
              result.data as LikedItem,
              ...prev.filter(
                (entry) =>
                  !(
                    entry.content_id === item.content_id &&
                    entry.content_type === item.content_type
                  ),
              ),
            ],
          );
          return;
        }

        if (result.action === "removed") {
          setLikedItems((prev) =>
            prev.filter(
              (entry) =>
                !(
                  entry.content_id === item.content_id &&
                  entry.content_type === item.content_type
                ),
            ),
          );
          return;
        }

        setLikedItems((prev) => {
          const filtered = prev.filter(
            (entry) =>
              !(
                entry.content_id === item.content_id &&
                entry.content_type === item.content_type
              ),
          );
          return previousMatch ? [previousMatch, ...filtered] : filtered;
        });
      } catch (error) {
        console.error("Error toggling like:", error);
        setLikedItems((prev) => {
          const filtered = prev.filter(
            (entry) =>
              !(
                entry.content_id === item.content_id &&
                entry.content_type === item.content_type
              ),
          );
          return previousMatch ? [previousMatch, ...filtered] : filtered;
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
    }) => {
      const userId = getUserId();
      if (!userId) return;

      try {
        const result = await mongoClient.setContentFeedback(item);

        if (result.action === "removed") {
          setFeedbackItems((prev) =>
            prev.filter(
              (feedback) =>
                !(feedback.content_id === item.content_id && feedback.content_type === item.content_type)
            )
          );
          return;
        }

        if (result.data) {
          setFeedbackItems((prev) => {
            const filtered = prev.filter(
              (feedback) =>
                !(feedback.content_id === result.data!.content_id && feedback.content_type === result.data!.content_type)
            );
            return [result.data as FeedbackItem, ...filtered];
          });
        }
      } catch (error) {
        console.error("Error setting feedback:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update feedback",
        });
      }
    },
    [getUserId, toast]
  );

  const getFeedback = useCallback(
    (contentId: number, contentType: "movie" | "tv") => {
      return (
        feedbackItems.find(
          (item) => item.content_id === contentId && item.content_type === contentType
        )?.feedback_type || null
      );
    },
    [feedbackItems]
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
      if (!watchHistory.length) return [];

      const genreCounts: Record<number, number> = {};
      watchHistory.forEach((item) => {
        item.genres.forEach((genre) => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
      });

      return Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([genre]) => Number(genre));
    },
    [watchHistory]
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
        prev ? { ...prev, preferred_languages: [], preferred_genres: [] } : null
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
        getFeedback,
        getRecentlyWatched,
        getTopGenres,
        clearHistory,
        refreshData,
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
