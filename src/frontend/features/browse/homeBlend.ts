/**
 * Row building for the Netflix-style home: blends several catalogues into one
 * row so Hollywood, Bollywood, South Indian cinema and series sit side by side
 * instead of in separate silos. Pure, no I/O.
 */
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import { isReleased } from "@/shared/lib/recommendation/feedRanking";
import { isAnimeLike } from "@/shared/lib/utils";

export type HomeItem = Movie | TVShow;

export const NEW_RELEASE_WINDOW_DAYS = 60;

export function homeItemKey(item: HomeItem): string {
  const forced = (item as { _content_type?: "movie" | "tv" })._content_type;
  return `${forced || ("title" in item ? "movie" : "tv")}:${item.id}`;
}

export function homeReleaseDate(item: HomeItem): string {
  return ("release_date" in item ? item.release_date : item.first_air_date) || "";
}

/** Displayable on a shelf: out already, has a poster, not anime. */
export function isShelfReady(item: HomeItem, now = Date.now()): boolean {
  return Boolean(item.poster_path) && isReleased(homeReleaseDate(item), now) && !isAnimeLike(item);
}

/**
 * Round-robin across lists (one from each in turn), skipping duplicates and
 * anything not shelf-ready, so every source is represented near the front.
 */
export function interleaveBlend(
  lists: Array<HomeItem[] | undefined | null>,
  { limit = 30, now = Date.now(), exclude }: { limit?: number; now?: number; exclude?: ReadonlySet<string> } = {},
): HomeItem[] {
  const queues = lists.map((list) => (list || []).filter((item) => isShelfReady(item, now)));
  const seen = new Set<string>(exclude);
  const blended: HomeItem[] = [];
  const cursors = queues.map(() => 0);
  let progressed = true;
  while (blended.length < limit && progressed) {
    progressed = false;
    queues.forEach((queue, index) => {
      while (cursors[index]! < queue.length && blended.length < limit) {
        const item = queue[cursors[index]!]!;
        cursors[index]! += 1;
        const key = homeItemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        blended.push(item);
        progressed = true;
        break;
      }
    });
  }
  return blended;
}

/** Titles released within the last `days`, newest first. */
export function freshReleases(items: HomeItem[], days = NEW_RELEASE_WINDOW_DAYS, now = Date.now()): HomeItem[] {
  const cutoff = now - days * 86_400_000;
  return items
    .filter((item) => {
      const released = Date.parse(homeReleaseDate(item));
      return Number.isFinite(released) && released >= cutoff && released <= now;
    })
    .sort((left, right) => homeReleaseDate(right).localeCompare(homeReleaseDate(left)));
}

/**
 * Top 10 from trending movies and series: alternates the two ranked lists so
 * the row reads as "what everyone is watching", not movies only.
 */
export function buildTop10(trendingMovies: HomeItem[] | undefined, trendingSeries: HomeItem[] | undefined, now = Date.now()): HomeItem[] {
  return interleaveBlend([trendingMovies, trendingSeries], { limit: 10, now });
}

/** Turns a saved library row (history or watchlist) into a card item. */
export function libraryItemToCard(entry: {
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres?: number[];
  language?: string;
}): HomeItem {
  return {
    id: entry.content_id,
    title: entry.title,
    name: entry.title,
    original_title: entry.title,
    original_name: entry.title,
    poster_path: entry.poster_path,
    backdrop_path: null,
    overview: "",
    vote_average: 0,
    vote_count: 0,
    popularity: 0,
    genre_ids: entry.genres || [],
    original_language: entry.language || "en",
    release_date: "",
    first_air_date: entry.content_type === "tv" ? "2000-01-01" : "",
    adult: false,
    video: false,
    origin_country: [],
    _content_type: entry.content_type,
  } as HomeItem;
}
