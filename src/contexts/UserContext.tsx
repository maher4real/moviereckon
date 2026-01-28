import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// Types
export interface WatchedItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  posterPath: string | null;
  watchedAt: string;
  genres: number[];
  language: string;
}

export interface LikedItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  posterPath: string | null;
  likedAt: string;
}

export interface UserPreferences {
  preferredLanguages: string[];
  preferredGenres: number[];
}

export interface User {
  username: string;
  createdAt: string;
  watchHistory: WatchedItem[];
  likedItems: LikedItem[];
  preferences: UserPreferences;
}

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  setUsername: (username: string) => void;
  clearUser: () => void;
  switchUser: () => void;
  addToWatchHistory: (item: Omit<WatchedItem, "watchedAt">) => void;
  removeFromWatchHistory: (id: number, type: "movie" | "tv") => void;
  isWatched: (id: number, type: "movie" | "tv") => boolean;
  toggleLike: (item: Omit<LikedItem, "likedAt">) => void;
  isLiked: (id: number, type: "movie" | "tv") => boolean;
  getRecentlyWatched: (limit?: number) => WatchedItem[];
  getTopGenres: (limit?: number) => number[];
  clearHistory: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const STORAGE_KEY = "moviereckon_user";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsedUser = JSON.parse(stored);
        setUser(parsedUser);
      } catch (error) {
        console.error("Error parsing stored user:", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Save user to localStorage whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    }
  }, [user]);

  const setUsername = useCallback((username: string) => {
    const trimmedName = username.trim();
    if (!trimmedName) return;

    // Check if user already exists
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const existingUser = JSON.parse(stored);
        if (existingUser.username === trimmedName) {
          setUser(existingUser);
          return;
        }
      } catch (error) {
        console.error("Error parsing stored user:", error);
      }
    }

    // Create new user
    const newUser: User = {
      username: trimmedName,
      createdAt: new Date().toISOString(),
      watchHistory: [],
      likedItems: [],
      preferences: {
        preferredLanguages: [],
        preferredGenres: [],
      },
    };
    setUser(newUser);
  }, []);

  const clearUser = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const switchUser = useCallback(() => {
    setUser(null);
  }, []);

  const addToWatchHistory = useCallback((item: Omit<WatchedItem, "watchedAt">) => {
    setUser((prev) => {
      if (!prev) return null;

      // Remove if already exists (to move to top)
      const filtered = prev.watchHistory.filter(
        (w) => !(w.id === item.id && w.type === item.type)
      );

      const newItem: WatchedItem = {
        ...item,
        watchedAt: new Date().toISOString(),
      };

      // Update preferences based on watch history
      const newPreferences = { ...prev.preferences };
      
      // Update preferred languages
      if (!newPreferences.preferredLanguages.includes(item.language)) {
        newPreferences.preferredLanguages = [
          item.language,
          ...newPreferences.preferredLanguages,
        ].slice(0, 5);
      }

      // Update preferred genres
      item.genres.forEach((genre) => {
        if (!newPreferences.preferredGenres.includes(genre)) {
          newPreferences.preferredGenres = [
            genre,
            ...newPreferences.preferredGenres,
          ].slice(0, 10);
        }
      });

      return {
        ...prev,
        watchHistory: [newItem, ...filtered].slice(0, 100), // Keep last 100
        preferences: newPreferences,
      };
    });
  }, []);

  const removeFromWatchHistory = useCallback((id: number, type: "movie" | "tv") => {
    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        watchHistory: prev.watchHistory.filter(
          (w) => !(w.id === id && w.type === type)
        ),
      };
    });
  }, []);

  const isWatched = useCallback(
    (id: number, type: "movie" | "tv") => {
      return user?.watchHistory.some((w) => w.id === id && w.type === type) ?? false;
    },
    [user]
  );

  const toggleLike = useCallback((item: Omit<LikedItem, "likedAt">) => {
    setUser((prev) => {
      if (!prev) return null;

      const existingIndex = prev.likedItems.findIndex(
        (l) => l.id === item.id && l.type === item.type
      );

      if (existingIndex >= 0) {
        // Unlike
        return {
          ...prev,
          likedItems: prev.likedItems.filter((_, i) => i !== existingIndex),
        };
      } else {
        // Like
        const newItem: LikedItem = {
          ...item,
          likedAt: new Date().toISOString(),
        };
        return {
          ...prev,
          likedItems: [newItem, ...prev.likedItems],
        };
      }
    });
  }, []);

  const isLiked = useCallback(
    (id: number, type: "movie" | "tv") => {
      return user?.likedItems.some((l) => l.id === id && l.type === type) ?? false;
    },
    [user]
  );

  const getRecentlyWatched = useCallback(
    (limit = 10) => {
      return user?.watchHistory.slice(0, limit) ?? [];
    },
    [user]
  );

  const getTopGenres = useCallback(
    (limit = 5) => {
      if (!user?.watchHistory.length) return [];

      const genreCounts: Record<number, number> = {};
      user.watchHistory.forEach((item) => {
        item.genres.forEach((genre) => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
      });

      return Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([genre]) => Number(genre));
    },
    [user]
  );

  const clearHistory = useCallback(() => {
    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        watchHistory: [],
        likedItems: [],
        preferences: {
          preferredLanguages: [],
          preferredGenres: [],
        },
      };
    });
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        setUsername,
        clearUser,
        switchUser,
        addToWatchHistory,
        removeFromWatchHistory,
        isWatched,
        toggleLike,
        isLiked,
        getRecentlyWatched,
        getTopGenres,
        clearHistory,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
