import "server-only";

import type {
  Cast,
  CrewMember,
  DiscoverFilters,
  EnrichedMovieDetails,
  EnrichedTVShowDetails,
  Genre,
  Movie,
  MovieDetails,
  MovieKeyword,
  MovieReleaseDatesResponse,
  SeasonDetails,
  TVShow,
  TVShowDetails,
  Video,
  WatchProviders,
} from "@/shared/lib/tmdb";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

interface MovieKeywordsResponse {
  keywords: MovieKeyword[];
}

interface TVKeywordsResponse {
  results: MovieKeyword[];
}

const DEFAULT_REVALIDATE_SECONDS = 180;
type QueryParams = Record<string, string | number | boolean | null | undefined>;

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function getRevalidateSeconds(endpoint: string): number {
  if (/^\/search\//.test(endpoint)) return 60;
  if (/^\/(movie|tv)\/\d+/.test(endpoint)) return 300;
  if (/^\/genre\//.test(endpoint)) return 24 * 60 * 60;
  return DEFAULT_REVALIDATE_SECONDS;
}

function getCacheTags(endpoint: string): string[] {
  const segments = endpoint.split("/").filter(Boolean);
  const resource = segments[0];
  const identifier = segments[1];
  const subresource = segments[2];
  const tags = new Set<string>(["tmdb"]);

  if (resource) {
    tags.add(`tmdb:${resource}`);
  }

  if (resource && identifier) {
    tags.add(`tmdb:${resource}:${identifier}`);
  }

  if (resource && subresource) {
    tags.add(`tmdb:${resource}:${subresource}`);
  }

  return [...tags];
}

async function fetchTMDB<T>(
  endpoint: string,
  params: QueryParams = {},
): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", apiKey);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    cache: "force-cache",
    next: {
      revalidate: getRevalidateSeconds(endpoint),
      tags: getCacheTags(endpoint),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "status_message" in data
        ? String((data as { status_message?: unknown }).status_message)
        : `TMDB API Error: ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function getServerTrendingMovies(
  timeWindow: "day" | "week" = "week",
): Promise<Movie[]> {
  const data = await fetchTMDB<TMDBResponse<Movie>>(`/trending/movie/${timeWindow}`);
  return data.results;
}

export async function getServerTrendingTVShows(
  timeWindow: "day" | "week" = "week",
): Promise<TVShow[]> {
  const data = await fetchTMDB<TMDBResponse<TVShow>>(`/trending/tv/${timeWindow}`);
  return data.results;
}

export async function getServerPopularTVShows(page = 1): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>("/tv/popular", { page });
}

export async function getServerTopRatedMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/movie/top_rated", { page });
}

export async function getServerNowPlayingMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/movie/now_playing", { page });
}

export async function getServerUpcomingMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/movie/upcoming", { page });
}

export async function getServerUpcomingTVShows(
  page = 1,
  fromDate?: string,
): Promise<TMDBResponse<TVShow>> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const gteDate = fromDate || formatLocalDate(tomorrow);

  return fetchTMDB<TMDBResponse<TVShow>>("/discover/tv", {
    page,
    sort_by: "first_air_date.asc",
    "first_air_date.gte": gteDate,
  });
}

export async function getServerBollywoodMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "hi",
    region: "IN",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getServerHollywoodMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "en",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getServerGujaratiMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "gu",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getServerTamilMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "ta",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getServerTeluguMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "te",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getServerMovieDetails(movieId: number): Promise<MovieDetails> {
  return fetchTMDB<MovieDetails>(`/movie/${movieId}`);
}

export async function getServerMovieCredits(
  movieId: number,
): Promise<{ cast: Cast[]; crew: CrewMember[] }> {
  return fetchTMDB<{ cast: Cast[]; crew: CrewMember[] }>(`/movie/${movieId}/credits`);
}

export async function getServerMovieVideos(movieId: number): Promise<{ results: Video[] }> {
  return fetchTMDB<{ results: Video[] }>(`/movie/${movieId}/videos`);
}

export async function getServerSimilarMovies(movieId: number): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>(`/movie/${movieId}/similar`);
}

export async function getServerMovieRecommendations(
  movieId: number,
): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>(`/movie/${movieId}/recommendations`);
}

export async function getServerMovieWatchProviders(movieId: number): Promise<WatchProviders> {
  return fetchTMDB<WatchProviders>(`/movie/${movieId}/watch/providers`);
}

export async function getServerMovieReleaseDates(
  movieId: number,
): Promise<MovieReleaseDatesResponse> {
  return fetchTMDB<MovieReleaseDatesResponse>(`/movie/${movieId}/release_dates`);
}

export async function getServerMovieKeywords(movieId: number): Promise<MovieKeyword[]> {
  const data = await fetchTMDB<MovieKeywordsResponse>(`/movie/${movieId}/keywords`);
  return data.keywords || [];
}

export async function getServerTVShowDetails(tvId: number): Promise<TVShowDetails> {
  return fetchTMDB<TVShowDetails>(`/tv/${tvId}`);
}

export async function getServerTVShowCredits(
  tvId: number,
): Promise<{ cast: Cast[]; crew: CrewMember[] }> {
  return fetchTMDB<{ cast: Cast[]; crew: CrewMember[] }>(`/tv/${tvId}/credits`);
}

export async function getServerTVShowVideos(tvId: number): Promise<{ results: Video[] }> {
  return fetchTMDB<{ results: Video[] }>(`/tv/${tvId}/videos`);
}

export async function getServerSimilarTVShows(tvId: number): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>(`/tv/${tvId}/similar`);
}

export async function getServerTVShowRecommendations(
  tvId: number,
): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>(`/tv/${tvId}/recommendations`);
}

export async function getServerTVSeasonDetails(
  tvId: number,
  seasonNumber: number,
): Promise<SeasonDetails> {
  return fetchTMDB<SeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`);
}

export async function getServerTVWatchProviders(tvId: number): Promise<WatchProviders> {
  return fetchTMDB<WatchProviders>(`/tv/${tvId}/watch/providers`);
}

export async function getServerTVShowKeywords(tvId: number): Promise<MovieKeyword[]> {
  const data = await fetchTMDB<TVKeywordsResponse>(`/tv/${tvId}/keywords`);
  return data.results || [];
}

export async function getServerMovieGenres(): Promise<Genre[]> {
  const data = await fetchTMDB<{ genres: Genre[] }>("/genre/movie/list");
  return data.genres || [];
}

export async function getServerTVGenres(): Promise<Genre[]> {
  const data = await fetchTMDB<{ genres: Genre[] }>("/genre/tv/list");
  return data.genres || [];
}

export async function discoverServerMovies(
  filters: DiscoverFilters = {},
): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", filters as QueryParams);
}

export async function discoverServerTVShows(
  filters: DiscoverFilters = {},
): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>("/discover/tv", filters as QueryParams);
}

export async function getServerMovieRecommendationProfile(
  movieId: number,
): Promise<EnrichedMovieDetails> {
  return fetchTMDB<EnrichedMovieDetails>(`/movie/${movieId}`, {
    append_to_response: "credits,keywords",
  });
}

export async function getServerTVRecommendationProfile(
  tvId: number,
): Promise<EnrichedTVShowDetails> {
  return fetchTMDB<EnrichedTVShowDetails>(`/tv/${tvId}`, {
    append_to_response: "credits,keywords",
  });
}
