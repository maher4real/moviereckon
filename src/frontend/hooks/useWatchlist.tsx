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
export type WatchlistStatus = mongoClient.WatchlistStatus;

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
  setStatus: (contentId: number, contentType: "movie" | "tv", status: WatchlistStatus) => Promise<void>;
  isInWatchlist: (contentId: number, contentType: "movie" | "tv") => boolean;
  refresh: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

function getKey(contentId: number, contentType: "movie" | "tv") {
  return `${contentType}:${contentId}`;
}

export function getWatchlistStatus(item: Pick<WatchlistItem, "status" | "watched">): WatchlistStatus {
  if (item.status === "saved" || item.status === "watching" || item.status === "completed" || item.status === "dropped") {
    return item.status;
  }
  return item.watched ? "completed" : "saved";
}

function normalizeItem(item: WatchlistItem): WatchlistItem {
  const status = getWatchlistStatus(item);
  return { ...item, status, watched: status === "completed" };
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedForUser = useRef<string | null>(null);
  const itemsRef = useRef<WatchlistItem[]>([]);
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);
  const previousUserIdRef = useRef<string | null>(null);
  const accountGenerationRef = useRef(0);
  const mutationSequenceRef = useRef(0);
  const pendingMutationRef = useRef(new Map<string, number>());
  const reorderSequenceRef = useRef(0);
  const reorderPendingRef = useRef(0);

  // Keep async callbacks tied to the account rendered on screen. Updating the
  // ref in an effect keeps React's render phase pure while running before the
  // account-change effect below.
  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  const updateItems = useCallback(
    (updater: (current: WatchlistItem[]) => WatchlistItem[]) => {
      // Update the ref before scheduling React's render so two event handlers
      // in the same tick still observe each other's optimistic intent.
      const next = updater(itemsRef.current);
      itemsRef.current = next;
      setItems(next);
    },
    [],
  );

  const isCurrentAccount = useCallback(
    (userId: string, generation: number) =>
      currentUserIdRef.current === userId && accountGenerationRef.current === generation,
    [],
  );

  const load = useCallback(async (userId: string, generation: number) => {
    if (!isCurrentAccount(userId, generation)) return;
    const mutationVersion = mutationSequenceRef.current;
    const reorderVersion = reorderSequenceRef.current;
    const hadPendingMutation = pendingMutationRef.current.size > 0;
    const hadPendingReorder = reorderPendingRef.current > 0;
    setIsLoading(true);
    try {
      const data = await mongoClient.fetchWatchlist();
      if (!isCurrentAccount(userId, generation)) return;
      // A refresh that began before an optimistic mutation must not replace
      // the in-flight local intent with an older server snapshot.
      if (
        mutationSequenceRef.current !== mutationVersion ||
        hadPendingMutation ||
        pendingMutationRef.current.size > 0 ||
        reorderSequenceRef.current !== reorderVersion ||
        hadPendingReorder ||
        reorderPendingRef.current > 0
      ) {
        return;
      }
      const normalized = data.map(normalizeItem);
      itemsRef.current = normalized;
      setItems(normalized);
      fetchedForUser.current = userId;
    } finally {
      if (isCurrentAccount(userId, generation)) {
        setIsLoading(false);
      }
    }
  }, [isCurrentAccount]);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (previousUserIdRef.current === userId) return;

    previousUserIdRef.current = userId;
    accountGenerationRef.current += 1;
    const generation = accountGenerationRef.current;
    pendingMutationRef.current.clear();
    reorderSequenceRef.current += 1;
    reorderPendingRef.current = 0;
    fetchedForUser.current = null;
    itemsRef.current = [];
    setItems([]);

    if (!userId) {
      setIsLoading(false);
      return;
    }

    void load(userId, generation);
  }, [user?.id, load]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const toggleItem = useCallback(
    async (item: Omit<WatchlistItem, "id" | "user_id" | "added_at" | "position" | "watched">) => {
      const userId = user?.id;
      if (!userId) return;
      const generation = accountGenerationRef.current;
      if (!isCurrentAccount(userId, generation)) return;

      const key = getKey(item.content_id, item.content_type);
      const existing = itemsRef.current.find((i) => getKey(i.content_id, i.content_type) === key);
      const mutationToken = ++mutationSequenceRef.current;
      const optimisticId = `optimistic-${generation}-${mutationToken}`;
      pendingMutationRef.current.set(key, mutationToken);

      // Optimistic update
      if (existing) {
        updateItems((prev) => prev.filter((i) => getKey(i.content_id, i.content_type) !== key));
      } else {
        const optimistic: WatchlistItem = {
          id: optimisticId,
          user_id: userId,
          ...item,
          added_at: new Date().toISOString(),
          position: itemsRef.current.length,
          status: "saved",
          watched: false,
        };
        updateItems((prev) => [...prev, optimistic]);
      }

      const result = await mongoClient.toggleWatchlistItem(item);
      if (!isCurrentAccount(userId, generation)) return;
      if (pendingMutationRef.current.get(key) !== mutationToken) return;
      pendingMutationRef.current.delete(key);

      if (!result.ok) {
        // Revert
        if (existing) {
          updateItems((prev) => {
            const withoutKey = prev.filter((i) => getKey(i.content_id, i.content_type) !== key);
            return [...withoutKey, existing].sort((a, b) => a.position - b.position);
          });
        } else {
          updateItems((prev) => prev.filter((i) => i.id !== optimisticId));
        }
        toast({ title: "Watchlist error", description: "Failed to update watchlist.", variant: "destructive" });
        return;
      }

      if (result.action === "added" && result.data) {
        updateItems((prev) => [
          ...prev.filter((i) => i.id !== optimisticId && getKey(i.content_id, i.content_type) !== key),
          normalizeItem(result.data!),
        ]);
        toast({ title: "Added to Watchlist", description: item.title });
      } else {
        updateItems((prev) => prev.filter((i) => getKey(i.content_id, i.content_type) !== key));
        toast({ title: "Removed from Watchlist", description: item.title });
      }
    },
    [user?.id, isCurrentAccount, toast, updateItems],
  );

  const removeItem = useCallback(
    async (contentId: number, contentType: "movie" | "tv") => {
      const userId = user?.id;
      if (!userId) return;
      const generation = accountGenerationRef.current;
      if (!isCurrentAccount(userId, generation)) return;
      const key = getKey(contentId, contentType);
      const prev = itemsRef.current.find((i) => getKey(i.content_id, i.content_type) === key);
      const mutationToken = ++mutationSequenceRef.current;
      pendingMutationRef.current.set(key, mutationToken);
      updateItems((cur) => cur.filter((i) => getKey(i.content_id, i.content_type) !== key));

      const ok = await mongoClient.removeWatchlistItem(contentId, contentType);
      if (!isCurrentAccount(userId, generation)) return;
      if (pendingMutationRef.current.get(key) !== mutationToken) return;
      pendingMutationRef.current.delete(key);
      if (!ok && prev) {
        updateItems((cur) => [...cur, prev].sort((a, b) => a.position - b.position));
        toast({ title: "Error", description: "Failed to remove from watchlist.", variant: "destructive" });
      }
    },
    [user?.id, isCurrentAccount, toast, updateItems],
  );

  const reorder = useCallback(
    async (newItems: WatchlistItem[]) => {
      const userId = user?.id;
      if (!userId) return;
      const generation = accountGenerationRef.current;
      if (!isCurrentAccount(userId, generation)) return;
      const previousItems = itemsRef.current;
      const reorderToken = ++reorderSequenceRef.current;
      reorderPendingRef.current += 1;
      const reindexed = newItems.map((item, i) => ({ ...item, position: i }));
      itemsRef.current = reindexed;
      setItems(reindexed);

      const order = reindexed.map((item) => ({ id: item.id, position: item.position }));
      const ok = await mongoClient.reorderWatchlist(order);
      if (isCurrentAccount(userId, generation)) {
        reorderPendingRef.current = Math.max(0, reorderPendingRef.current - 1);
      }
      if (!isCurrentAccount(userId, generation)) return;
      if (reorderSequenceRef.current !== reorderToken) return;
      if (!ok) {
        const previousOrder = new Map(previousItems.map((item, index) => [item.id, index]));
        const currentItems = itemsRef.current;
        const restored = currentItems
          .map((item, index) => ({ item, index }))
          .sort((left, right) => {
            const leftOrder = previousOrder.get(left.item.id);
            const rightOrder = previousOrder.get(right.item.id);
            if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
            if (leftOrder !== undefined) return -1;
            if (rightOrder !== undefined) return 1;
            return left.index - right.index;
          })
          .map(({ item }) => item);
        itemsRef.current = restored;
        setItems(restored);
        toast({ title: "Error", description: "Failed to reorder watchlist.", variant: "destructive" });
        throw new Error("Failed to reorder watchlist");
      }
    },
    [user?.id, isCurrentAccount, toast],
  );

  const markWatched = useCallback(
    async (contentId: number, contentType: "movie" | "tv", watched: boolean) => {
      const userId = user?.id;
      if (!userId) return;
      const generation = accountGenerationRef.current;
      if (!isCurrentAccount(userId, generation)) return;
      const key = getKey(contentId, contentType);
      const previousItem = itemsRef.current.find((i) => getKey(i.content_id, i.content_type) === key);
      const mutationToken = ++mutationSequenceRef.current;
      pendingMutationRef.current.set(key, mutationToken);
      updateItems((prev) =>
        prev.map((i) => (
          getKey(i.content_id, i.content_type) === key
            ? { ...i, watched, status: watched ? "completed" : "saved" }
            : i
        )),
      );
      const ok = await mongoClient.markWatchlistItemWatched(contentId, contentType, watched);
      if (!isCurrentAccount(userId, generation)) return;
      if (pendingMutationRef.current.get(key) !== mutationToken) return;
      pendingMutationRef.current.delete(key);
      if (!ok) {
        if (previousItem) {
          updateItems((prev) => prev.map((i) => (
            getKey(i.content_id, i.content_type) === key ? previousItem : i
          )));
        } else {
          updateItems((prev) => prev.filter((i) => getKey(i.content_id, i.content_type) !== key));
        }
        toast({ title: "Error", description: "Failed to update watched status.", variant: "destructive" });
        throw new Error("Failed to update watched status");
      }
    },
    [user?.id, isCurrentAccount, toast, updateItems],
  );

  const setStatus = useCallback(
    async (contentId: number, contentType: "movie" | "tv", status: WatchlistStatus) => {
      const userId = user?.id;
      if (!userId) return;
      const generation = accountGenerationRef.current;
      if (!isCurrentAccount(userId, generation)) return;
      const key = getKey(contentId, contentType);
      const previousItem = itemsRef.current.find((i) => getKey(i.content_id, i.content_type) === key);
      if (!previousItem) return;

      const mutationToken = ++mutationSequenceRef.current;
      pendingMutationRef.current.set(key, mutationToken);
      updateItems((prev) => prev.map((item) => (
        getKey(item.content_id, item.content_type) === key
          ? { ...item, status, watched: status === "completed" }
          : item
      )));

      const result = await mongoClient.setWatchlistItemStatus(contentId, contentType, status);
      if (!isCurrentAccount(userId, generation)) return;
      if (pendingMutationRef.current.get(key) !== mutationToken) return;
      pendingMutationRef.current.delete(key);

      if (!result.ok) {
        updateItems((current) => current.map((item) => (
          getKey(item.content_id, item.content_type) === key ? previousItem : item
        )));
        toast({ title: "Error", description: "Failed to update watchlist status.", variant: "destructive" });
        throw new Error("Failed to update watchlist status");
      }

      if (result.data) {
        updateItems((current) => current.map((item) => (
          getKey(item.content_id, item.content_type) === key ? normalizeItem(result.data!) : item
        )));
      }
    },
    [user?.id, isCurrentAccount, toast, updateItems],
  );

  const isInWatchlist = useCallback(
    (contentId: number, contentType: "movie" | "tv") =>
      items.some((i) => getKey(i.content_id, i.content_type) === getKey(contentId, contentType)),
    [items],
  );

  const refresh = useCallback(async () => {
    const userId = user?.id;
    if (!userId) return;
    await load(userId, accountGenerationRef.current);
  }, [user?.id, load]);

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
        setStatus,
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
