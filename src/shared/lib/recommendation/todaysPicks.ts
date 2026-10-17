import type { Movie, TVShow } from "@/shared/lib/tmdb";

/**
 * "What to watch today": a small, varied set of picks drawn from a ranked pool.
 *
 * The pool is already ordered best-first (personalised feed first, then trending
 * and popular titles). This picker keeps that order as the main signal, then
 * spreads the result across type, genre and language so the card shows a range
 * instead of six near-identical titles. Pure and seedable so Shuffle is
 * testable.
 */

export type PickContent = Movie | TVShow;
export type PickFilter = "all" | "movie" | "tv";

export interface PickCandidate {
  item: PickContent;
  /** Short human reason from the feed, e.g. "Matches your selected thrillers". */
  reason?: string;
  /** Where the candidate came from; used for the fallback reason and ordering. */
  source: "feed" | "watchlist" | "trending" | "popular" | "top-rated";
}

export interface TodaysPick {
  key: string;
  type: "movie" | "tv";
  item: PickContent;
  title: string;
  year: string;
  reason: string;
}

export interface BuildPicksOptions {
  /** Keys (`movie_1`, `tv_2`) the viewer has already watched. */
  excludeKeys?: ReadonlySet<string>;
  count?: number;
  filter?: PickFilter;
  /** Changes the choice among near-equal candidates; Shuffle bumps it. */
  seed?: number;
  /** Used to decide whether a recent release counts as "new". */
  now?: number;
}

const FRESH_DAYS = 90;
const MIN_VOTES = 40;
const MIN_RATING = 6;

export const pickKey = (item: PickContent): string => `${"title" in item ? "movie" : "tv"}_${item.id}`;
export const pickType = (item: PickContent): "movie" | "tv" => ("title" in item ? "movie" : "tv");
export const pickTitle = (item: PickContent): string => ("title" in item ? item.title : item.name);
const releaseDate = (item: PickContent): string => ("title" in item ? item.release_date : item.first_air_date) || "";

/** Small deterministic PRNG (mulberry32) so a seed always gives the same shuffle. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function reasonFor(candidate: PickCandidate, now: number): string {
  if (candidate.reason) return candidate.reason;
  const { item, source } = candidate;
  if (source === "watchlist") return "Waiting in your watchlist";
  const released = Date.parse(releaseDate(item));
  if (Number.isFinite(released) && now - released >= 0 && now - released <= FRESH_DAYS * 86_400_000) return "Fresh release";
  if (item.vote_average >= 8) return "Critically loved";
  if (source === "trending") return "Trending this week";
  if (source === "popular") return pickType(item) === "tv" ? "Popular series right now" : "Popular right now";
  if (item.vote_average >= 7.5) return "Highly rated";
  return "Worth a look tonight";
}

function eligible(candidate: PickCandidate, now: number): boolean {
  const { item, source } = candidate;
  if (!item.poster_path) return false;
  if (source === "watchlist") return true; // The viewer chose it; no quality gate.
  const released = Date.parse(releaseDate(item));
  const fresh = Number.isFinite(released) && now - released >= 0 && now - released <= FRESH_DAYS * 86_400_000;
  // Fresh releases have not collected votes yet; everything else needs a track record.
  if (fresh) return true;
  return item.vote_count >= MIN_VOTES && item.vote_average >= MIN_RATING;
}

export function buildTodaysPicks(candidates: PickCandidate[], options: BuildPicksOptions = {}): TodaysPick[] {
  const { excludeKeys = new Set<string>(), count = 6, filter = "all", seed = 0, now = Date.now() } = options;
  const rand = random(seed + 1);

  // De-duplicate, keeping the first (best-ranked) occurrence and its reason.
  const seen = new Set<string>();
  const pool: Array<PickCandidate & { rank: number }> = [];
  for (const candidate of candidates) {
    const key = pickKey(candidate.item);
    if (seen.has(key) || excludeKeys.has(key)) continue;
    if (filter !== "all" && pickType(candidate.item) !== filter) continue;
    if (!eligible(candidate, now)) continue;
    seen.add(key);
    pool.push({ ...candidate, rank: pool.length });
  }
  if (pool.length === 0) return [];

  // Aim for an even movie / series split; the quota relaxes if one side runs out.
  const want = filter === "all"
    ? { movie: Math.ceil(count / 2), tv: Math.floor(count / 2) }
    : { movie: filter === "movie" ? count : 0, tv: filter === "tv" ? count : 0 };

  const chosen: Array<(typeof pool)[number]> = [];
  const taken = { movie: 0, tv: 0 };
  const genres = new Map<number, number>();
  const languages = new Map<string, number>();

  const scoreOf = (entry: (typeof pool)[number]): number => {
    const type = pickType(entry.item);
    const primary = entry.item.genre_ids?.[0];
    // Earlier in the pool is better; the first ~20 positions matter most.
    let score = 1 / (1 + entry.rank / 8);
    if (primary !== undefined) score -= 0.22 * (genres.get(primary) ?? 0);
    const language = entry.item.original_language;
    if (language) score -= 0.12 * (languages.get(language) ?? 0);
    if (entry.source === "watchlist") score += 0.18; // A saved title is a strong "yes".
    if (taken[type] >= want[type]) score -= 1; // Over quota: only chosen when nothing else is left.
    return score + rand() * 0.14; // Jitter so Shuffle changes the set without ignoring rank.
  };

  while (chosen.length < Math.min(count, pool.length)) {
    let best: (typeof pool)[number] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const entry of pool) {
      if (chosen.includes(entry)) continue;
      const score = scoreOf(entry);
      if (score > bestScore) { best = entry; bestScore = score; }
    }
    if (!best) break;
    chosen.push(best);
    taken[pickType(best.item)] += 1;
    const primary = best.item.genre_ids?.[0];
    if (primary !== undefined) genres.set(primary, (genres.get(primary) ?? 0) + 1);
    const language = best.item.original_language;
    if (language) languages.set(language, (languages.get(language) ?? 0) + 1);
  }

  // Lead with the strongest pick, then alternate type so the grid reads as a mix.
  const [lead, ...rest] = [...chosen].sort((a, b) => a.rank - b.rank);
  const ordered = [lead];
  const queues = { movie: rest.filter((entry) => pickType(entry.item) === "movie"), tv: rest.filter((entry) => pickType(entry.item) === "tv") };
  let next: "movie" | "tv" = pickType(lead.item) === "movie" ? "tv" : "movie";
  while (queues.movie.length || queues.tv.length) {
    const queue = queues[next].length ? queues[next] : queues[next === "movie" ? "tv" : "movie"];
    ordered.push(queue.shift()!);
    next = next === "movie" ? "tv" : "movie";
  }

  return ordered.map((entry) => ({
    key: pickKey(entry.item),
    type: pickType(entry.item),
    item: entry.item,
    title: pickTitle(entry.item),
    year: releaseDate(entry.item).slice(0, 4),
    reason: reasonFor(entry, now),
  }));
}
