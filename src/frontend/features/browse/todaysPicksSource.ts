import type { WatchlistItem } from "@/frontend/lib/mongodbClient";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import { pickKey, type PickCandidate, type PickContent } from "@/shared/lib/recommendation/todaysPicks";

type Explanations = Record<string, { reasons?: Array<{ label: string }> } | undefined>;

interface PoolInput {
  /** Personalised Reckon feed, best first. */
  feed: PickContent[];
  explanations?: Explanations;
  watchlist: WatchlistItem[];
  trending: Movie[];
  popularTv: TVShow[];
  topRated: Movie[];
}

const WATCHLIST_LIMIT = 4;

/** A watchlist row only carries a title and poster, so rebuild the fields the card shows. */
function fromWatchlist(entry: WatchlistItem): PickContent {
  const common = {
    id: entry.content_id,
    overview: "",
    poster_path: entry.poster_path,
    backdrop_path: null,
    vote_average: 0,
    vote_count: 0,
    popularity: 0,
    genre_ids: entry.genres ?? [],
    original_language: entry.language ?? "en",
  };
  return entry.content_type === "movie"
    ? { ...common, title: entry.title, original_title: entry.title, release_date: "", adult: false, video: false }
    : { ...common, name: entry.title, original_name: entry.title, first_air_date: "", origin_country: [] };
}

/**
 * Ranked pool for "What to watch today". Order is the main quality signal the
 * picker uses: personalised titles first, then things the viewer already saved,
 * then trending and popular titles so the card is never empty for a new account.
 */
export function buildPickPool({ feed, explanations = {}, watchlist, trending, popularTv, topRated }: PoolInput): PickCandidate[] {
  const pool: PickCandidate[] = [];
  for (const item of feed) {
    pool.push({ item, source: "feed", reason: explanations[pickKey(item)]?.reasons?.[0]?.label });
  }
  watchlist
    .filter((entry) => entry.status === undefined || entry.status === "saved" || entry.status === "watching")
    .filter((entry) => !entry.watched)
    .slice(0, WATCHLIST_LIMIT)
    .forEach((entry) => pool.push({ item: fromWatchlist(entry), source: "watchlist" }));
  // Interleave so a type-balanced pick still sees both kinds near the top.
  const length = Math.max(trending.length, popularTv.length);
  for (let index = 0; index < length; index += 1) {
    if (trending[index]) pool.push({ item: trending[index], source: "trending" });
    if (popularTv[index]) pool.push({ item: popularTv[index], source: "popular" });
  }
  topRated.forEach((item) => pool.push({ item, source: "top-rated" }));
  return pool;
}
