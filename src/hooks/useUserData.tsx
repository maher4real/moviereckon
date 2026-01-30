import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
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

interface UserDataContextType {
  watchHistory: WatchedItem[];
  likedItems: LikedItem[];
  preferences: UserPreferences | null;
  isLoading: boolean;
  addToWatchHistory: (item: Omit<WatchedItem, "id" | "user_id" | "watched_at">) => Promise<void>;
  removeFromWatchHistory: (contentId: number, contentType: "movie" | "tv") => Promise<void>;
  isWatched: (contentId: number, contentType: "movie" | "tv") => boolean;
  toggleLike: (item: Omit<LikedItem, "id" | "user_id" | "liked_at">) => Promise<void>;
  isLiked: (contentId: number, contentType: "movie" | "tv") => boolean;
  getRecentlyWatched: (limit?: number) => WatchedItem[];
  getTopGenres: (limit?: number) => number[];
  clearHistory: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [watchHistory, setWatchHistory] = useState<WatchedItem[]>([]);
  const [likedItems, setLikedItems] = useState<LikedItem[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = useCallback(async () => {
    if (!user) {
      setWatchHistory([]);
      setLikedItems([]);
      setPreferences(null);
      setIsLoading(false);
      return;
    }

    try {
      const [historyRes, likedRes, prefsRes] = await Promise.all([
        supabase
          .from("watch_history")
          .select("*")
          .eq("user_id", user.id)
          .order("watched_at", { ascending: false }),
        supabase
          .from("liked_items")
          .select("*")
          .eq("user_id", user.id)
          .order("liked_at", { ascending: false }),
        supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", user.id)
          .single(),
      ]);

      if (historyRes.data) setWatchHistory(historyRes.data as WatchedItem[]);
      if (likedRes.data) setLikedItems(likedRes.data as LikedItem[]);
      if (prefsRes.data) setPreferences(prefsRes.data as UserPreferences);
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const addToWatchHistory = useCallback(
    async (item: Omit<WatchedItem, "id" | "user_id" | "watched_at">) => {
      if (!user) return;

      try {
        // Upsert to handle duplicates
        const { data, error } = await supabase
          .from("watch_history")
          .upsert(
            {
              user_id: user.id,
              content_id: item.content_id,
              content_type: item.content_type,
              title: item.title,
              poster_path: item.poster_path,
              genres: item.genres,
              language: item.language,
              watched_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id,content_id,content_type",
            }
          )
          .select()
          .single();

        if (error) throw error;

        // Update local state
        setWatchHistory((prev) => {
          const filtered = prev.filter(
            (w) => !(w.content_id === item.content_id && w.content_type === item.content_type)
          );
          return [data as WatchedItem, ...filtered];
        });

        // Update preferences
        await updatePreferences(item.language, item.genres);
      } catch (error) {
        console.error("Error adding to watch history:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update watch history",
        });
      }
    },
    [user, toast]
  );

  const updatePreferences = async (language: string, genres: number[]) => {
    if (!user || !preferences) return;

    const newLanguages = preferences.preferred_languages.includes(language)
      ? preferences.preferred_languages
      : [language, ...preferences.preferred_languages].slice(0, 5);

    const newGenres = [...new Set([...genres, ...preferences.preferred_genres])].slice(0, 10);

    const { error } = await supabase
      .from("user_preferences")
      .update({
        preferred_languages: newLanguages,
        preferred_genres: newGenres,
      })
      .eq("user_id", user.id);

    if (!error) {
      setPreferences((prev) =>
        prev ? { ...prev, preferred_languages: newLanguages, preferred_genres: newGenres } : null
      );
    }
  };

  const removeFromWatchHistory = useCallback(
    async (contentId: number, contentType: "movie" | "tv") => {
      if (!user) return;

      try {
        const { error } = await supabase
          .from("watch_history")
          .delete()
          .eq("user_id", user.id)
          .eq("content_id", contentId)
          .eq("content_type", contentType);

        if (error) throw error;

        setWatchHistory((prev) =>
          prev.filter((w) => !(w.content_id === contentId && w.content_type === contentType))
        );
      } catch (error) {
        console.error("Error removing from watch history:", error);
      }
    },
    [user]
  );

  const isWatched = useCallback(
    (contentId: number, contentType: "movie" | "tv") => {
      return watchHistory.some(
        (w) => w.content_id === contentId && w.content_type === contentType
      );
    },
    [watchHistory]
  );

  const toggleLike = useCallback(
    async (item: Omit<LikedItem, "id" | "user_id" | "liked_at">) => {
      if (!user) return;

      const existingLike = likedItems.find(
        (l) => l.content_id === item.content_id && l.content_type === item.content_type
      );

      try {
        if (existingLike) {
          // Unlike
          const { error } = await supabase
            .from("liked_items")
            .delete()
            .eq("id", existingLike.id);

          if (error) throw error;

          setLikedItems((prev) => prev.filter((l) => l.id !== existingLike.id));
        } else {
          // Like
          const { data, error } = await supabase
            .from("liked_items")
            .insert({
              user_id: user.id,
              content_id: item.content_id,
              content_type: item.content_type,
              title: item.title,
              poster_path: item.poster_path,
            })
            .select()
            .single();

          if (error) throw error;

          setLikedItems((prev) => [data as LikedItem, ...prev]);
        }
      } catch (error) {
        console.error("Error toggling like:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update like status",
        });
      }
    },
    [user, likedItems, toast]
  );

  const isLiked = useCallback(
    (contentId: number, contentType: "movie" | "tv") => {
      return likedItems.some(
        (l) => l.content_id === contentId && l.content_type === contentType
      );
    },
    [likedItems]
  );

  const getRecentlyWatched = useCallback(
    (limit = 10) => {
      return watchHistory.slice(0, limit);
    },
    [watchHistory]
  );

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

  const clearHistory = useCallback(async () => {
    if (!user) return;

    try {
      await Promise.all([
        supabase.from("watch_history").delete().eq("user_id", user.id),
        supabase.from("liked_items").delete().eq("user_id", user.id),
        supabase
          .from("user_preferences")
          .update({ preferred_languages: [], preferred_genres: [] })
          .eq("user_id", user.id),
      ]);

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
  }, [user, toast]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    await fetchUserData();
  }, [fetchUserData]);

  return (
    <UserDataContext.Provider
      value={{
        watchHistory,
        likedItems,
        preferences,
        isLoading,
        addToWatchHistory,
        removeFromWatchHistory,
        isWatched,
        toggleLike,
        isLiked,
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
