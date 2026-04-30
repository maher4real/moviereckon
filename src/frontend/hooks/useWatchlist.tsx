"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { useToast } from "@/frontend/hooks/use-toast";

export type WatchlistItem = mongoClient.WatchlistItem;

interface WatchlistContextType {
  items: WatchlistItem[];
  isLoading: boolean;
  isOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  toggleItem: (item: Omit<WatchlistItem, "id" | "user_id" | "added_at" | "position" | "watched">) => Promise<void>;
  removeItem: (contentId: number, contentType: "movie" | "tv") => Promise<void>;
  reorder: (newItems: WatchlistItem[]) => Promise<void>;
  markWatched: (contentId: number, contentType: "movie" | "tv", watched: boolean) => Promise<void>;
  isInWatchlist: (contentId: number, contentType: "movie" | "tv") => boolean;
  refresh: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

function getKey(contentId: number, contentType: "movie" | "tv") {
  return `${contentType}:${contentId}`;
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedForUser = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setIsLoading(true);
    try {
      const data = await mongoClient.fetchWatchlist();
      setItems(data);
      fetchedForUser.current = userId;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id && fetchedForUser.current !== user.id) {
      load(user.id);
    }
    if (!user) {
      setItems([]);
      fetchedForUser.current = null;
    }
  }, [user, load]);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const toggleItem = useCallback(
    async (item: Omit<WatchlistItem, "id" | "user_id" | "added_at" | "position" | "watched">) => {
      if (!user) return;

      const key = getKey(item.content_id, item.content_type);
      const existing = items.find((i) => getKey(i.content_id, i.content_type) === key);

      // Optimistic update
      if (existing) {
        setItems((prev) => prev.filter((i) => getKey(i.content_id, i.content_type) !== key));
      } else {
        const optimistic: WatchlistItem = {
          id: `optimistic-${Date.now()}`,
          user_id: user.id,
          ...item,
          added_at: new Date().toISOString(),
          position: items.length,
          watched: false,
        };
        setItems((prev) => [...prev, optimistic]);
      }

      const result = await mongoClient.toggleWatchlistItem(item);
      if (!result.ok) {
        // Revert
        if (existing) {
          setItems((prev) => [...prev, existing]);
        } else {
          setItems((prev) => prev.filter((i) => !i.id.startsWith("optimistic-")));
        }
        toast({ title: "Watchlist error", description: "Failed to update watchlist.", variant: "destructive" });
        return;
      }

      if (result.action === "added" && result.data) {
        setItems((prev) =>
          prev.map((i) => (i.id.startsWith("optimistic-") ? result.data! : i)),
        );
        toast({ title: "Added to Watchlist", description: item.title });
      } else {
        toast({ title: "Removed from Watchlist", description: item.title });
      }
    },
    [user, items, toast],
  );

  const removeItem = useCallback(
    async (contentId: number, contentType: "movie" | "tv") => {
      const key = getKey(contentId, contentType);
      const prev = items.find((i) => getKey(i.content_id, i.content_type) === key);
      setItems((cur) => cur.filter((i) => getKey(i.content_id, i.content_type) !== key));

      const ok = await mongoClient.removeWatchlistItem(contentId, contentType);
      if (!ok && prev) {
        setItems((cur) => [...cur, prev].sort((a, b) => a.position - b.position));
        toast({ title: "Error", description: "Failed to remove from watchlist.", variant: "destructive" });
      }
    },
    [items, toast],
  );

  const reorder = useCallback(
    async (newItems: WatchlistItem[]) => {
      const reindexed = newItems.map((item, i) => ({ ...item, position: i }));
      setItems(reindexed);

      const order = reindexed.map((item) => ({ id: item.id, position: item.position }));
      await mongoClient.reorderWatchlist(order);
    },
    [],
  );

  const markWatched = useCallback(
    async (contentId: number, contentType: "movie" | "tv", watched: boolean) => {
      const key = getKey(contentId, contentType);
      setItems((prev) =>
        prev.map((i) => (getKey(i.content_id, i.content_type) === key ? { ...i, watched } : i)),
      );
      await mongoClient.markWatchlistItemWatched(contentId, contentType, watched);
    },
    [],
  );

  const isInWatchlist = useCallback(
    (contentId: number, contentType: "movie" | "tv") =>
      items.some((i) => getKey(i.content_id, i.content_type) === getKey(contentId, contentType)),
    [items],
  );

  const refresh = useCallback(async () => {
    if (user?.id) await load(user.id);
  }, [user, load]);

  return (
    <WatchlistContext.Provider
      value={{
        items,
        isLoading,
        isOpen,
        openPanel,
        closePanel,
        toggleItem,
        removeItem,
        reorder,
        markWatched,
        isInWatchlist,
        refresh,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
