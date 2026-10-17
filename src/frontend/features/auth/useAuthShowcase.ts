import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ShowcaseSlide } from "@/frontend/components/PosterShowcase";
import {
  getBackdropUrl,
  getBollywoodMovies,
  getPosterUrl,
  getTrendingMovies,
  getTrendingTVShows,
} from "@/shared/lib/tmdb";
import { TMDB_FALLBACK_POSTERS } from "@/shared/lib/tmdbFallbacks";

const STALE_TIME = 1000 * 60 * 10;

/** Trending titles for the sign-in carousel, plus the slide driving the ambient backdrop. */
export function useAuthShowcase() {
  const { data: trendingMovies } = useQuery({
    queryKey: ["trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: STALE_TIME,
  });
  const { data: trendingTV } = useQuery({
    queryKey: ["trending-tv-week"],
    queryFn: () => getTrendingTVShows("week"),
    staleTime: STALE_TIME,
  });
  const { data: bollywoodData } = useQuery({
    queryKey: ["bollywood-movies"],
    queryFn: () => getBollywoodMovies(),
    staleTime: STALE_TIME,
  });

  const showcaseSlides = useMemo<ShowcaseSlide[]>(() => {
    const rated = (average: number, count: number) => (count > 0 && average > 0 ? average : undefined);
    const year = (date?: string) => (date && date.length >= 4 ? date.slice(0, 4) : undefined);
    const backdrop = (path: string | null) => (path ? getBackdropUrl(path, "large") : undefined);
    const movies = (trendingMovies || []).filter((item) => item.poster_path).slice(0, 3).map((item) => ({
      id: `movie-${item.id}`, src: getPosterUrl(item.poster_path, "medium"), title: item.title, eyebrow: "Trending film",
      backdrop: backdrop(item.backdrop_path), rating: rated(item.vote_average, item.vote_count), year: year(item.release_date),
    }));
    const series = (trendingTV || []).filter((item) => item.poster_path).slice(0, 3).map((item) => ({
      id: `tv-${item.id}`, src: getPosterUrl(item.poster_path, "medium"), title: item.name, eyebrow: "Trending series",
      backdrop: backdrop(item.backdrop_path), rating: rated(item.vote_average, item.vote_count), year: year(item.first_air_date),
    }));
    const bollywood = (bollywoodData?.results || []).filter((item) => item.poster_path).slice(0, 2).map((item) => ({
      id: `bollywood-${item.id}`, src: getPosterUrl(item.poster_path, "medium"), title: item.title, eyebrow: "Bollywood",
      backdrop: backdrop(item.backdrop_path), rating: rated(item.vote_average, item.vote_count), year: year(item.release_date),
    }));
    const mixed: ShowcaseSlide[] = [];
    for (let index = 0; index < 3; index += 1) {
      [movies[index], bollywood[index], series[index]].forEach((item) => { if (item) mixed.push(item); });
    }
    if (mixed.length) return mixed;
    return TMDB_FALLBACK_POSTERS.slice(0, 7).map((poster, index) => ({
      id: `fallback-${index}`, src: getPosterUrl(poster.path, "medium"), title: poster.title, eyebrow: poster.eyebrow,
    }));
  }, [bollywoodData, trendingMovies, trendingTV]);

  const [ambientSlide, setAmbientSlide] = useState<ShowcaseSlide | null>(null);
  const active = ambientSlide ?? showcaseSlides[0];
  const ambientArt = active?.backdrop ?? active?.src;

  return { showcaseSlides, ambientArt, setAmbientSlide };
}
