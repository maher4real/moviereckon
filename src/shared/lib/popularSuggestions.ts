import type { Movie, TVShow } from "@/shared/lib/tmdb";

export const POPULAR_SUGGESTIONS_QUERY_KEY = ["search-popular-suggestions"] as const;

type SettledList<T> = PromiseSettledResult<T[]>;

/** Merges trending movies/TV into a de-duplicated list of titles. */
export function buildPopularSuggestions(
  moviesResult: SettledList<Movie>,
  tvResult: SettledList<TVShow>,
  limit = 12,
): string[] {
  const movies = moviesResult.status === "fulfilled" ? moviesResult.value : [];
  const tvShows = tvResult.status === "fulfilled" ? tvResult.value : [];

  const titleMap = new Map<string, string>();
  [...movies, ...tvShows].forEach((item) => {
    const title = "title" in item ? item.title : item.name;
    const normalized = title?.trim().toLowerCase();
    if (!title || !normalized || titleMap.has(normalized)) return;
    titleMap.set(normalized, title);
  });

  return Array.from(titleMap.values()).slice(0, limit);
}
