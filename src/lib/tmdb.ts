// TMDB API Configuration and Service Layer
// All API calls go through the server-side API proxy.
import { getPublicMongoApiUrl } from "@/lib/runtimeEnv";
import { buildTmdbImageProxyUrl } from "@/lib/tmdbImageProxy";

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

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
  credit_id: string;
}

export interface MovieKeyword {
  id: number;
  name: string;
}

export interface MovieReleaseDate {
  certification: string;
  iso_639_1: string;
  release_date: string;
  type: number;
}

export interface MovieReleaseDatesResult {
  iso_3166_1: string;
  release_dates: MovieReleaseDate[];
}

export interface MovieReleaseDatesResponse {
  id: number;
  results: MovieReleaseDatesResult[];
}

export interface MovieKeywordsResponse {
  id: number;
  keywords: MovieKeyword[];
}

export interface TVKeywordsResponse {
  id: number;
  results: MovieKeyword[];
}

export interface TMDBCreditsResponse {
  cast: Cast[];
  crew: CrewMember[];
}

export interface EnrichedMovieDetails extends MovieDetails {
  credits?: TMDBCreditsResponse;
  keywords?: MovieKeywordsResponse;
}

export interface EnrichedTVShowDetails extends TVShowDetails {
  credits?: TMDBCreditsResponse;
  keywords?: TVKeywordsResponse;
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

export interface TMDBReview {
  id: string;
  author: string;
  content: string;
  created_at: string;
  updated_at: string;
  url: string;
  author_details?: {
    avatar_path?: string | null;
    rating?: number | null;
    username?: string;
  };
}

interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

const getApiBase = () => {
  const configuredUrl = getPublicMongoApiUrl();
  if (configuredUrl && configuredUrl.length > 0) {
    return configuredUrl;
  }
  return "";
};

const API_BASE = getApiBase();

type TMDBParams = Record<string, string | number | boolean | undefined>;

// Helper function for API calls via the server API proxy.
async function fetchTMDB<T>(
  endpoint: string,
  params: TMDBParams = {},
): Promise<T> {
  const normalizedParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, string | number | boolean>;

  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", endpoint);
  Object.entries(normalizedParams).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  const getUrl = `${API_BASE}/api/tmdb?${searchParams.toString()}`;
  let response = await fetch(getUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  // Fallback keeps compatibility for oversized URLs or older deployments.
  if (response.status === 405 || response.status === 414) {
    response = await fetch(`${API_BASE}/api/tmdb`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ endpoint, params: normalizedParams }),
    });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: unknown }).error)
        : `TMDB API Error: ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

// Image URL helpers
export function getPosterUrl(
  path: string | null,
  size: keyof typeof IMAGE_SIZES.poster = "medium",
): string {
  if (!path) return FALLBACK_POSTER;
  return (
    buildTmdbImageProxyUrl({
      apiBase: API_BASE,
      path,
      kind: "poster",
      size: IMAGE_SIZES.poster[size],
    }) || FALLBACK_POSTER
  );
}

export function getBackdropUrl(
  path: string | null,
  size: keyof typeof IMAGE_SIZES.backdrop = "large",
): string {
  if (!path) return FALLBACK_BACKDROP;
  return (
    buildTmdbImageProxyUrl({
      apiBase: API_BASE,
      path,
      kind: "backdrop",
      size: IMAGE_SIZES.backdrop[size],
    }) || FALLBACK_BACKDROP
  );
}

export function getProfileUrl(
  path: string | null,
  size: keyof typeof IMAGE_SIZES.profile = "medium",
): string {
  if (!path) return FALLBACK_PROFILE;
  return (
    buildTmdbImageProxyUrl({
      apiBase: API_BASE,
      path,
      kind: "profile",
      size: IMAGE_SIZES.profile[size],
    }) || FALLBACK_PROFILE
  );
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

export async function getMovieCredits(
  movieId: number,
): Promise<{ cast: Cast[]; crew: CrewMember[] }> {
  return fetchTMDB<{ cast: Cast[]; crew: CrewMember[] }>(`/movie/${movieId}/credits`);
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

export async function getMovieReleaseDates(
  movieId: number,
): Promise<MovieReleaseDatesResponse> {
  return fetchTMDB<MovieReleaseDatesResponse>(`/movie/${movieId}/release_dates`);
}

export async function getMovieKeywords(
  movieId: number,
): Promise<MovieKeyword[]> {
  const data = await fetchTMDB<MovieKeywordsResponse>(`/movie/${movieId}/keywords`);
  return data.keywords || [];
}

export async function getMovieRecommendationProfile(
  movieId: number,
): Promise<EnrichedMovieDetails> {
  return fetchTMDB<EnrichedMovieDetails>(`/movie/${movieId}`, {
    append_to_response: "credits,keywords",
  });
}

export async function getMovieReviews(movieId: number, page = 1): Promise<TMDBReview[]> {
  const data = await fetchTMDB<TMDBResponse<TMDBReview>>(`/movie/${movieId}/reviews`, { page });
  return data.results || [];
}

export async function getMovieReviewsExpanded(
  movieId: number,
  pages = 3,
): Promise<TMDBReview[]> {
  const pageCount = Math.max(1, Math.min(pages, 5));
  const responses = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => getMovieReviews(movieId, index + 1)),
  );

  const deduped = new Map<string, TMDBReview>();
  responses.flat().forEach((review) => deduped.set(review.id, review));

  return Array.from(deduped.values()).sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
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

export async function getUpcomingTVShows(
  page = 1,
  fromDate?: string,
): Promise<TMDBResponse<TVShow>> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const gteDate = fromDate || tomorrow.toISOString().split("T")[0];

  return fetchTMDB<TMDBResponse<TVShow>>("/discover/tv", {
    page,
    sort_by: "first_air_date.asc",
    "first_air_date.gte": gteDate,
  });
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

export async function getTVShowCredits(tvId: number): Promise<TMDBCreditsResponse> {
  return fetchTMDB<TMDBCreditsResponse>(`/tv/${tvId}/credits`);
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

export async function getTVShowKeywords(tvId: number): Promise<MovieKeyword[]> {
  const data = await fetchTMDB<TVKeywordsResponse>(`/tv/${tvId}/keywords`);
  return data.results || [];
}

export async function getTVRecommendationProfile(tvId: number): Promise<EnrichedTVShowDetails> {
  return fetchTMDB<EnrichedTVShowDetails>(`/tv/${tvId}`, {
    append_to_response: "credits,keywords",
  });
}

export async function getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<SeasonDetails> {
  return fetchTMDB<SeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`);
}

export async function getTVWatchProviders(tvId: number): Promise<WatchProviders> {
  return fetchTMDB<WatchProviders>(`/tv/${tvId}/watch/providers`);
}

export async function getTVShowReviews(tvId: number, page = 1): Promise<TMDBReview[]> {
  const data = await fetchTMDB<TMDBResponse<TMDBReview>>(`/tv/${tvId}/reviews`, { page });
  return data.results || [];
}

export async function getTVShowReviewsExpanded(
  tvId: number,
  pages = 3,
): Promise<TMDBReview[]> {
  const pageCount = Math.max(1, Math.min(pages, 5));
  const responses = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => getTVShowReviews(tvId, index + 1)),
  );

  const deduped = new Map<string, TMDBReview>();
  responses.flat().forEach((review) => deduped.set(review.id, review));

  return Array.from(deduped.values()).sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

// Get still image URL for episodes
export function getStillUrl(
  path: string | null,
  size: "w185" | "w300" | "w500" | "original" = "w300",
): string {
  if (!path) return FALLBACK_STILL;
  return (
    buildTmdbImageProxyUrl({
      apiBase: API_BASE,
      path,
      kind: "still",
      size,
    }) || FALLBACK_STILL
  );
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
  region?: string;
  with_people?: string;
  with_cast?: string;
  with_crew?: string;
  sort_by?: string;
  with_watch_providers?: string;
  watch_region?: string;
  with_networks?: string;
  "primary_release_date.gte"?: string;
  "primary_release_date.lte"?: string;
  "first_air_date.gte"?: string;
  "first_air_date.lte"?: string;
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
  if (filters.region) params.region = filters.region;
  if (filters.with_people) params.with_people = filters.with_people;
  if (filters.with_cast) params.with_cast = filters.with_cast;
  if (filters.with_crew) params.with_crew = filters.with_crew;
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
  if (filters.with_people) params.with_people = filters.with_people;
  if (filters.with_cast) params.with_cast = filters.with_cast;
  if (filters.with_crew) params.with_crew = filters.with_crew;
  if (filters.with_watch_providers) params.with_watch_providers = filters.with_watch_providers;
  if (filters.watch_region) params.watch_region = filters.watch_region;
  if (filters.with_networks) params.with_networks = filters.with_networks;
  if (filters["first_air_date.gte"]) params["first_air_date.gte"] = filters["first_air_date.gte"];
  if (filters["first_air_date.lte"]) params["first_air_date.lte"] = filters["first_air_date.lte"];
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
  return (
    buildTmdbImageProxyUrl({
      apiBase: API_BASE,
      path,
      kind: "provider",
      size: "w92",
    }) || FALLBACK_STILL
  );
}

export function getTMDBAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/http")) return path.slice(1);
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE_BASE}/w185${path}`;
}
