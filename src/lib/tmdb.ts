// TMDB API Configuration and Service Layer
// All API calls go through secure edge function

import { supabase } from "@/lib/backendClient";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const FALLBACK_POSTER = "/fallbacks/poster.svg";
const FALLBACK_BACKDROP = "/fallbacks/backdrop.svg";
const FALLBACK_PROFILE = "/fallbacks/profile.svg";
const FALLBACK_STILL = "/fallbacks/still.svg";

// Image size configurations
export const IMAGE_SIZES = {
  poster: {
    small: "w185",
    medium: "w342",
    large: "w500",
    original: "original",
  },
  backdrop: {
    small: "w300",
    medium: "w780",
    large: "w1280",
    original: "original",
  },
  profile: {
    small: "w45",
    medium: "w185",
    large: "h632",
  },
} as const;

// Types
export interface Movie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  original_language: string;
  adult: boolean;
  video: boolean;
}

export interface TVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  original_language: string;
  origin_country: string[];
}

export interface MovieDetails extends Movie {
  runtime: number;
  genres: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  status: string;
  tagline: string;
  budget: number;
  revenue: number;
  imdb_id: string;
  homepage: string;
}

export interface TVShowDetails extends TVShow {
  episode_run_time: number[];
  genres: { id: number; name: string }[];
  number_of_episodes: number;
  number_of_seasons: number;
  seasons: Season[];
  status: string;
  tagline: string;
  type: string;
  created_by: { id: number; name: string; profile_path: string | null }[];
}

export interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  air_date: string | null;
  still_path: string | null;
  runtime: number | null;
  vote_average: number;
}

export interface SeasonDetails {
  id: number;
  name: string;
  season_number: number;
  episodes: Episode[];
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

export interface Cast {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface Genre {
  id: number;
  name: string;
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface WatchProviders {
  results: {
    [countryCode: string]: {
      link?: string;
      flatrate?: WatchProvider[];
      rent?: WatchProvider[];
      buy?: WatchProvider[];
    };
  };
}

interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// Helper function for API calls via edge function
async function fetchTMDB<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("tmdb-proxy", {
    body: { endpoint, params },
  });

  if (error) {
    console.error("TMDB API Error:", error);
    throw new Error(`TMDB API Error: ${error.message}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

// Image URL helpers
export function getPosterUrl(
  path: string | null,
  size: keyof typeof IMAGE_SIZES.poster = "medium",
): string {
  if (!path) return FALLBACK_POSTER;
  return `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.poster[size]}${path}`;
}

export function getBackdropUrl(
  path: string | null,
  size: keyof typeof IMAGE_SIZES.backdrop = "large",
): string {
  if (!path) return FALLBACK_BACKDROP;
  return `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.backdrop[size]}${path}`;
}

export function getProfileUrl(
  path: string | null,
  size: keyof typeof IMAGE_SIZES.profile = "medium",
): string {
  if (!path) return FALLBACK_PROFILE;
  return `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.profile[size]}${path}`;
}

// Movie endpoints
export async function getTrendingMovies(
  timeWindow: "day" | "week" = "week",
): Promise<Movie[]> {
  const data = await fetchTMDB<TMDBResponse<Movie>>(
    `/trending/movie/${timeWindow}`,
  );
  return data.results;
}

export async function getPopularMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/movie/popular", { page });
}

export async function getTopRatedMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/movie/top_rated", { page });
}

export async function getNowPlayingMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/movie/now_playing", { page });
}

export async function getUpcomingMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/movie/upcoming", { page });
}

// Regional Movies
export async function getBollywoodMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "hi",
    region: "IN",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getHollywoodMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "en",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getGujaratiMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "gu",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getTamilMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "ta",
    sort_by: "popularity.desc",
    page,
  });
}

export async function getTeluguMovies(page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", {
    with_original_language: "te",
    sort_by: "popularity.desc",
    page,
  });
}

// Movie Details
export async function getMovieDetails(movieId: number): Promise<MovieDetails> {
  return fetchTMDB<MovieDetails>(`/movie/${movieId}`);
}

export async function getMovieCredits(movieId: number): Promise<{ cast: Cast[] }> {
  return fetchTMDB<{ cast: Cast[] }>(`/movie/${movieId}/credits`);
}

export async function getMovieVideos(movieId: number): Promise<{ results: Video[] }> {
  return fetchTMDB<{ results: Video[] }>(`/movie/${movieId}/videos`);
}

export async function getSimilarMovies(movieId: number): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>(`/movie/${movieId}/similar`);
}

export async function getMovieRecommendations(movieId: number): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>(`/movie/${movieId}/recommendations`);
}

export async function getMovieWatchProviders(movieId: number): Promise<WatchProviders> {
  return fetchTMDB<WatchProviders>(`/movie/${movieId}/watch/providers`);
}

// TV Show endpoints
export async function getTrendingTVShows(timeWindow: "day" | "week" = "week"): Promise<TVShow[]> {
  const data = await fetchTMDB<TMDBResponse<TVShow>>(`/trending/tv/${timeWindow}`);
  return data.results;
}

export async function getPopularTVShows(page = 1): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>("/tv/popular", { page });
}

export async function getTopRatedTVShows(page = 1): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>("/tv/top_rated", { page });
}

// Indian TV Shows
export async function getIndianTVShows(page = 1): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>("/discover/tv", {
    with_original_language: "hi",
    sort_by: "popularity.desc",
    page,
  });
}

// TV Show Details
export async function getTVShowDetails(tvId: number): Promise<TVShowDetails> {
  return fetchTMDB<TVShowDetails>(`/tv/${tvId}`);
}

export async function getTVShowCredits(tvId: number): Promise<{ cast: Cast[] }> {
  return fetchTMDB<{ cast: Cast[] }>(`/tv/${tvId}/credits`);
}

export async function getTVShowVideos(tvId: number): Promise<{ results: Video[] }> {
  return fetchTMDB<{ results: Video[] }>(`/tv/${tvId}/videos`);
}

export async function getSimilarTVShows(tvId: number): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>(`/tv/${tvId}/similar`);
}

export async function getTVShowRecommendations(tvId: number): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>(`/tv/${tvId}/recommendations`);
}

export async function getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<SeasonDetails> {
  return fetchTMDB<SeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`);
}

export async function getTVWatchProviders(tvId: number): Promise<WatchProviders> {
  return fetchTMDB<WatchProviders>(`/tv/${tvId}/watch/providers`);
}

// Get still image URL for episodes
export function getStillUrl(
  path: string | null,
  size: "w185" | "w300" | "w500" | "original" = "w300",
): string {
  if (!path) return FALLBACK_STILL;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

// Search
export async function searchMulti(query: string, page = 1): Promise<TMDBResponse<Movie | TVShow>> {
  return fetchTMDB<TMDBResponse<Movie | TVShow>>("/search/multi", {
    query,
    page,
    include_adult: "false",
  });
}

export async function searchMovies(query: string, page = 1): Promise<TMDBResponse<Movie>> {
  return fetchTMDB<TMDBResponse<Movie>>("/search/movie", {
    query,
    page,
    include_adult: "false",
  });
}

export async function searchTVShows(query: string, page = 1): Promise<TMDBResponse<TVShow>> {
  return fetchTMDB<TMDBResponse<TVShow>>("/search/tv", {
    query,
    page,
    include_adult: "false",
  });
}

// Genres
export async function getMovieGenres(): Promise<Genre[]> {
  const data = await fetchTMDB<{ genres: Genre[] }>("/genre/movie/list");
  return data.genres;
}

export async function getTVGenres(): Promise<Genre[]> {
  const data = await fetchTMDB<{ genres: Genre[] }>("/genre/tv/list");
  return data.genres;
}

// Discover with filters
export interface DiscoverFilters {
  page?: number;
  with_genres?: string;
  with_original_language?: string;
  sort_by?: string;
  with_watch_providers?: string;
  watch_region?: string;
  with_networks?: string;
  "primary_release_date.gte"?: string;
  "primary_release_date.lte"?: string;
  "vote_average.gte"?: string | number;
  "vote_count.gte"?: string | number;
}

export async function discoverMovies(filters: DiscoverFilters = {}): Promise<TMDBResponse<Movie>> {
  const params: Record<string, string | number | undefined> = {
    page: filters.page || 1,
    sort_by: filters.sort_by || "popularity.desc",
  };

  if (filters.with_genres) params.with_genres = filters.with_genres;
  if (filters.with_original_language) params.with_original_language = filters.with_original_language;
  if (filters.with_watch_providers) params.with_watch_providers = filters.with_watch_providers;
  if (filters.watch_region) params.watch_region = filters.watch_region;
  if (filters.with_networks) params.with_networks = filters.with_networks;
  if (filters["primary_release_date.gte"]) params["primary_release_date.gte"] = filters["primary_release_date.gte"];
  if (filters["primary_release_date.lte"]) params["primary_release_date.lte"] = filters["primary_release_date.lte"];
  if (filters["vote_average.gte"]) params["vote_average.gte"] = filters["vote_average.gte"];
  if (filters["vote_count.gte"]) params["vote_count.gte"] = filters["vote_count.gte"];

  return fetchTMDB<TMDBResponse<Movie>>("/discover/movie", params);
}

export async function discoverTVShows(filters: DiscoverFilters = {}): Promise<TMDBResponse<TVShow>> {
  const params: Record<string, string | number | undefined> = {
    page: filters.page || 1,
    sort_by: filters.sort_by || "popularity.desc",
  };

  if (filters.with_genres) params.with_genres = filters.with_genres;
  if (filters.with_original_language) params.with_original_language = filters.with_original_language;
  if (filters.with_watch_providers) params.with_watch_providers = filters.with_watch_providers;
  if (filters.watch_region) params.watch_region = filters.watch_region;
  if (filters.with_networks) params.with_networks = filters.with_networks;
  if (filters["vote_average.gte"]) params["vote_average.gte"] = filters["vote_average.gte"];
  if (filters["vote_count.gte"]) params["vote_count.gte"] = filters["vote_count.gte"];

  return fetchTMDB<TMDBResponse<TVShow>>("/discover/tv", params);
}

// Helper to get YouTube trailer URL
export function getYouTubeTrailerUrl(videos: Video[]): string | null {
  const trailer =
    videos.find(
      (v) =>
        v.site === "YouTube" &&
        (v.type === "Trailer" || v.type === "Teaser") &&
        v.official,
    ) ||
    videos.find(
      (v) =>
        v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"),
    );

  return trailer ? `https://www.youtube.com/embed/${trailer.key}` : null;
}

// Helper to check if content is Bollywood
export function isBollywood(content: Movie | TVShow): boolean {
  return content.original_language === "hi";
}

// Helper to check if content is Hollywood
export function isHollywood(content: Movie | TVShow): boolean {
  return content.original_language === "en";
}

// Helper to get language label
export function getLanguageLabel(langCode: string): string {
  const languages: Record<string, string> = {
    hi: "Hindi",
    en: "English",
    ta: "Tamil",
    te: "Telugu",
    ml: "Malayalam",
    kn: "Kannada",
    bn: "Bengali",
    mr: "Marathi",
    pa: "Punjabi",
    gu: "Gujarati",
  };
  return languages[langCode] || langCode.toUpperCase();
}

// Get language badge class
export function getLanguageBadgeClass(langCode: string): string {
  switch (langCode) {
    case "hi":
      return "badge-hindi";
    case "en":
      return "badge-english";
    case "ta":
      return "badge-tamil";
    case "te":
      return "badge-telugu";
    case "gu":
      return "badge-gujarati";
    default:
      return "bg-muted";
  }
}

// Get provider logo URL
export function getProviderLogoUrl(path: string | null): string {
  if (!path) return FALLBACK_STILL;
  return `${TMDB_IMAGE_BASE}/w92${path}`;
}
