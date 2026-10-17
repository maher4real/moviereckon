import { useQuery } from "@tanstack/react-query";
import { discoverMovies } from "@/shared/lib/tmdb";
import { PREFERENCE_GENRE_IDS, genreName } from "@/shared/lib/catalogue";

export const PREF_GENRES = PREFERENCE_GENRE_IDS.map((id) => ({ id, name: genreName(id) }));

export type GenreArtwork = Record<number, { backdrop: string; title: string }>;

/**
 * One backdrop per genre: the most popular well-voted film in that genre that
 * no earlier genre already uses, so the grid never repeats an image.
 */
export function useGenreArtwork({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: ["preference-genre-artwork-v1"],
    queryFn: async (): Promise<GenreArtwork> => {
      const responses = await Promise.allSettled(
        PREF_GENRES.map((genre) => discoverMovies({ with_genres: String(genre.id), sort_by: "popularity.desc", "vote_count.gte": 300 })),
      );
      const used = new Set<number>();
      const artwork: GenreArtwork = {};
      PREF_GENRES.forEach((genre, index) => {
        const response = responses[index];
        if (response.status !== "fulfilled") return;
        const pick = response.value.results.find((movie) => movie.backdrop_path && !used.has(movie.id));
        if (!pick?.backdrop_path) return;
        used.add(pick.id);
        artwork[genre.id] = { backdrop: pick.backdrop_path, title: pick.title };
      });
      return artwork;
    },
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });
}
