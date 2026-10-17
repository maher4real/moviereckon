import { useEffect, useRef, type RefObject } from "react";
import type { SetURLSearchParams } from "react-router-dom";

interface PagedResponse {
  page?: number;
  total_pages?: number;
}

/** `getNextPageParam` for TMDB-style `{ page, total_pages }` responses. */
export function getNextTmdbPage(lastPage: PagedResponse | undefined): number | undefined {
  if (!lastPage?.page || !lastPage?.total_pages) return undefined;
  return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
}

interface LoadMoreOptions {
  /** Element placed after the list; loading starts when it nears the viewport. */
  sentinel: RefObject<Element | null>;
  /** True when another page exists and none is loading (and nothing has failed). */
  enabled: boolean;
  onLoadMore: () => void;
  /** Distance below the viewport at which loading starts. */
  rootMargin?: string;
  /**
   * Changes whenever the list grows. Re-arming the observer on each change makes
   * a still-visible sentinel load the next page instead of stalling.
   */
  revision?: number;
}

/** Infinite scroll: calls `onLoadMore` when the sentinel scrolls into range. */
export function useLoadMoreOnScroll({ sentinel, enabled, onLoadMore, rootMargin = "600px 0px", revision = 0 }: LoadMoreOptions) {
  const callback = useRef(onLoadMore);
  useEffect(() => {
    callback.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !enabled || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callback.current();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sentinel, enabled, rootMargin, revision]);
}

/**
 * Rewrites the address bar to the canonical form of the filter state (default
 * values dropped, invalid values repaired) without adding a history entry.
 */
export function useCanonicalSearchParams(canonical: string, current: string, setSearchParams: SetURLSearchParams) {
  useEffect(() => {
    if (canonical === current) return;
    setSearchParams(new URLSearchParams(canonical), { replace: true });
  }, [canonical, current, setSearchParams]);
}

/** Merge infinite-query pages into one list, keeping the first copy of each id. */
export function mergeUniquePages<TItem extends { id: number }, TPage extends { results?: TItem[] }>(
  pages: TPage[] | undefined,
  accept: (item: TItem) => boolean = () => true,
): TItem[] {
  if (!pages) return [];
  const seen = new Set<number>();
  const merged: TItem[] = [];
  for (const page of pages) {
    for (const item of page.results || []) {
      if (seen.has(item.id) || !accept(item)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}
