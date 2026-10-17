import { useCallback, useEffect, useRef, useState } from "react";
import { useUserData } from "@/frontend/hooks/useUserData";
import { useWatchlist } from "@/frontend/hooks/useWatchlist";

interface DetailTitle {
  id: number;
  contentType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  genreIds: number[];
  language: string;
}

/** Watched / watchlist state and handlers shared by the movie and series pages. */
export function useDetailLibrary(contentId: number, contentType: "movie" | "tv", title: DetailTitle | null) {
  const { addToWatchHistory, isWatched } = useUserData();
  const { isInWatchlist, toggleItem } = useWatchlist();
  const [watchAnimating, setWatchAnimating] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const pulse = useCallback((set: (value: boolean) => void) => {
    set(true);
    timers.current.push(window.setTimeout(() => set(false), 420));
  }, []);

  const markWatched = useCallback(async () => {
    if (!title) return;
    pulse(setWatchAnimating);
    await addToWatchHistory({
      content_id: title.id,
      content_type: title.contentType,
      title: title.title,
      poster_path: title.posterPath,
      genres: title.genreIds,
      language: title.language,
    });
  }, [addToWatchHistory, pulse, title]);

  const toggleWatchlist = useCallback(async () => {
    if (!title) return;
    pulse(setBookmarkAnimating);
    await toggleItem({
      content_id: title.id,
      content_type: title.contentType,
      title: title.title,
      poster_path: title.posterPath,
    });
  }, [pulse, title, toggleItem]);

  return {
    watched: title ? isWatched(title.id, contentType) : false,
    bookmarked: title ? isInWatchlist(title.id, contentType) : false,
    watchAnimating,
    bookmarkAnimating,
    markWatched,
    toggleWatchlist,
    contentId,
  };
}

export type DetailLibrary = ReturnType<typeof useDetailLibrary>;
