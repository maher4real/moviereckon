/**
 * TMDB loaders for the blended home rows. Each loader returns one list per
 * industry so `interleaveBlend` can mix them; a failed list is just empty.
 */
import {
  discoverMovies,
  discoverTVShows,
  getMovieRecommendations,
  getTVShowRecommendations,
  type Movie,
  type TVShow,
} from "@/shared/lib/tmdb";
import { formatLocalDate } from "@/shared/lib/utils";
import { NEW_RELEASE_WINDOW_DAYS, type HomeItem } from "./homeBlend";

// Hollywood, Bollywood and the two largest South Indian industries.
export const BLEND_MOVIE_LANGUAGES = ["en", "hi", "te", "ta"] as const;

async function settled<T>(load: () => Promise<{ results?: T[] }>): Promise<T[]> {
  try {
    return (await load()).results || [];
  } catch {
    return [];
  }
}

function windowStart(days: number): string {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return formatLocalDate(start);
}

/** Recent releases per industry plus new series, ready to interleave. */
export async function loadNewReleaseLists(): Promise<HomeItem[][]> {
  const from = windowStart(NEW_RELEASE_WINDOW_DAYS);
  const today = formatLocalDate(new Date());
  const movieLists = await Promise.all(BLEND_MOVIE_LANGUAGES.map((language) => settled<Movie>(() => discoverMovies({
    with_original_language: language,
    "primary_release_date.gte": from,
    "primary_release_date.lte": today,
    sort_by: "popularity.desc",
    // A handful of votes filters out placeholder entries.
    "vote_count.gte": language === "en" ? 20 : 3,
  }))));
  const series = await settled<TVShow>(() => discoverTVShows({
    "first_air_date.gte": from,
    "first_air_date.lte": today,
    sort_by: "popularity.desc",
    "vote_count.gte": 3,
  }));
  return [...movieLists, series];
}

/** One genre across Hollywood and Bollywood, for a blended genre row. */
export async function loadBlendedGenreLists(genres: string): Promise<HomeItem[][]> {
  return Promise.all((["en", "hi"] as const).map((language) => settled<Movie>(() => discoverMovies({
    with_genres: genres,
    with_original_language: language,
    sort_by: "popularity.desc",
    "vote_count.gte": language === "en" ? 300 : 30,
  }))));
}

/** TMDB recommendations for a title the viewer finished. */
export async function loadBecauseYouWatched(seed: { id: number; type: "movie" | "tv" }): Promise<HomeItem[]> {
  return seed.type === "movie"
    ? settled<Movie>(() => getMovieRecommendations(seed.id))
    : settled<TVShow>(() => getTVShowRecommendations(seed.id));
}
