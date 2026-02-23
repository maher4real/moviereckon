import App from "@/App";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MongoUser } from "@/lib/mongodbClient";
import type { DiscoverFilters, Movie, TVShow } from "@/lib/tmdb";
import {
  discoverServerMovies,
  discoverServerTVShows,
  getServerBollywoodMovies,
  getServerGujaratiMovies,
  getServerHollywoodMovies,
  getServerMovieCredits,
  getServerMovieDetails,
  getServerMovieGenres,
  getServerMovieKeywords,
  getServerMovieReleaseDates,
  getServerMovieVideos,
  getServerMovieWatchProviders,
  getServerNowPlayingMovies,
  getServerPopularTVShows,
  getServerSimilarMovies,
  getServerSimilarTVShows,
  getServerTVGenres,
  getServerTVSeasonDetails,
  getServerTVShowCredits,
  getServerTVShowDetails,
  getServerTVShowVideos,
  getServerTVWatchProviders,
  getServerTamilMovies,
  getServerTeluguMovies,
  getServerTopRatedMovies,
  getServerTrendingMovies,
  getServerTrendingTVShows,
  getServerUpcomingMovies,
  getServerUpcomingTVShows,
} from "@/lib/server/tmdbServer";
import { getUserById, getUserFromRequest } from "@/server/api/lib/auth";

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = {
  slug?: string | string[];
};

type SpaPageProps = {
  params?: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
};

type UpcomingSection = "all" | "movies" | "series";
type MovieSectionFilter = "all" | "bollywood" | "hollywood";

interface UpcomingPage {
  results: (Movie | TVShow)[];
  total_pages: number;
  page: number;
  total_results: number;
}

const HOME_UPCOMING_PAGES = [1, 2, 3] as const;
const HOME_UPCOMING_TV_PAGES = [1, 2] as const;
const BOLLYWOOD_LANGUAGE_LIST = ["hi", "gu", "ta", "te", "kn"] as const;

function normalizePathname(slug: string | string[] | undefined): string {
  if (!slug) return "/";
  const segments = Array.isArray(slug) ? slug : [slug];
  const normalized = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return normalized.length > 0 ? `/${normalized}` : "/";
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isValidDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function getSearchParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeSearch(searchParams: SearchParams | undefined): string {
  if (!searchParams) return "";
  const urlSearch = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        urlSearch.append(key, item);
      });
      return;
    }
    urlSearch.set(key, value);
  });

  const queryString = urlSearch.toString();
  return queryString ? `?${queryString}` : "";
}

async function resolveInitialUser(): Promise<MongoUser | null> {
  try {
    const requestHeaders = await headers();
    const payload = await getUserFromRequest({ headers: requestHeaders });
    if (!payload) return null;
    const user = await getUserById(payload.id);
    return (user as MongoUser | null) ?? null;
  } catch (error) {
    console.error("SSR auth bootstrap failed:", error);
    return null;
  }
}

async function prefetchHomeQueries(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: ["trending-movies"],
      queryFn: () => getServerTrendingMovies("week"),
    }),
    queryClient.prefetchQuery({
      queryKey: ["bollywood-movies"],
      queryFn: () => getServerBollywoodMovies(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["hollywood-movies"],
      queryFn: () => getServerHollywoodMovies(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["gujarati-movies"],
      queryFn: () => getServerGujaratiMovies(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["tamil-movies"],
      queryFn: () => getServerTamilMovies(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["telugu-movies"],
      queryFn: () => getServerTeluguMovies(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["popular-tv"],
      queryFn: () => getServerPopularTVShows(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["top-rated-movies"],
      queryFn: () => getServerTopRatedMovies(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["now-playing-movies"],
      queryFn: () => getServerNowPlayingMovies(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["upcoming-movies-home"],
      queryFn: async () => {
        const responses = await Promise.all(
          HOME_UPCOMING_PAGES.map((page) => getServerUpcomingMovies(page).catch(() => null)),
        );

        const deduped = new Map<number, Movie>();
        responses.forEach((response) => {
          response?.results?.forEach((movie) => {
            if (!deduped.has(movie.id)) deduped.set(movie.id, movie);
          });
        });

        return Array.from(deduped.values()).sort((a, b) =>
          (a.release_date || "9999-12-31").localeCompare(
            b.release_date || "9999-12-31",
          ),
        );
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["upcoming-tv-home"],
      queryFn: async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = formatLocalDate(tomorrow);

        const responses = await Promise.all(
          HOME_UPCOMING_TV_PAGES.map((page) =>
            getServerUpcomingTVShows(page, tomorrowStr).catch(() => null),
          ),
        );

        const deduped = new Map<number, TVShow>();
        responses.forEach((response) => {
          response?.results?.forEach((show) => {
            if (!deduped.has(show.id)) deduped.set(show.id, show);
          });
        });

        return Array.from(deduped.values()).sort((a, b) =>
          (a.first_air_date || "9999-12-31").localeCompare(
            b.first_air_date || "9999-12-31",
          ),
        );
      },
    }),
  ]);
}

async function prefetchSearchQueries(queryClient: QueryClient) {
  await queryClient.prefetchQuery({
    queryKey: ["search-popular-suggestions"],
    queryFn: async () => {
      const [moviesResult, tvResult] = await Promise.allSettled([
        getServerTrendingMovies("week"),
        getServerTrendingTVShows("week"),
      ]);

      const movies = moviesResult.status === "fulfilled" ? moviesResult.value : [];
      const tvShows = tvResult.status === "fulfilled" ? tvResult.value : [];

      const titleMap = new Map<string, string>();
      [...movies, ...tvShows].forEach((item) => {
        const title = "title" in item ? item.title : item.name;
        const normalized = title?.trim().toLowerCase();
        if (!title || !normalized || titleMap.has(normalized)) return;
        titleMap.set(normalized, title);
      });

      return Array.from(titleMap.values()).slice(0, 12);
    },
  });
}

async function prefetchMovieDetailQueries(queryClient: QueryClient, movieId: number) {
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: ["movie", movieId],
      queryFn: () => getServerMovieDetails(movieId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["movie-credits", movieId],
      queryFn: () => getServerMovieCredits(movieId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["movie-videos", movieId],
      queryFn: () => getServerMovieVideos(movieId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["similar-movies", movieId],
      queryFn: () => getServerSimilarMovies(movieId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["movie-watch-providers", movieId],
      queryFn: () => getServerMovieWatchProviders(movieId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["movie-release-dates", movieId],
      queryFn: () => getServerMovieReleaseDates(movieId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["movie-keywords", movieId],
      queryFn: () => getServerMovieKeywords(movieId),
    }),
  ]);
}

async function prefetchTVDetailQueries(queryClient: QueryClient, tvId: number) {
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: ["tv", tvId],
      queryFn: () => getServerTVShowDetails(tvId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["tv-credits", tvId],
      queryFn: () => getServerTVShowCredits(tvId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["tv-videos", tvId],
      queryFn: () => getServerTVShowVideos(tvId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["similar-tv", tvId],
      queryFn: () => getServerSimilarTVShows(tvId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["tv-watch-providers", tvId],
      queryFn: () => getServerTVWatchProviders(tvId),
    }),
    queryClient.prefetchQuery({
      queryKey: ["tv-season", tvId, 1],
      queryFn: () => getServerTVSeasonDetails(tvId, 1),
    }),
  ]);
}

async function prefetchUpcomingQueries(queryClient: QueryClient, searchParams: SearchParams) {
  const sectionParam = getSearchParam(searchParams, "section");
  const movieTypeParam = getSearchParam(searchParams, "movieType");
  const bollyLangParam = getSearchParam(searchParams, "bollyLang");
  const movieGenreParam = getSearchParam(searchParams, "movieGenre");
  const seriesGenreParam = getSearchParam(searchParams, "seriesGenre");
  const ottParam = getSearchParam(searchParams, "ott");
  const langParam = getSearchParam(searchParams, "lang");
  const dateParam = getSearchParam(searchParams, "date") || "";

  const section: UpcomingSection =
    sectionParam === "movies" || sectionParam === "series" || sectionParam === "all"
      ? sectionParam
      : "all";
  const movieSectionFilter: MovieSectionFilter =
    movieTypeParam === "bollywood" || movieTypeParam === "hollywood" || movieTypeParam === "all"
      ? movieTypeParam
      : "all";
  const bollywoodLanguage = bollyLangParam || "all";
  const movieGenre = movieGenreParam || "";
  const seriesGenre = seriesGenreParam || "";
  const seriesOtt = ottParam || "all";
  const seriesLanguage = langParam || "all";
  const selectedFilterDate = isValidDateKey(dateParam) ? dateParam : "all";

  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: ["movie-genres"],
      queryFn: () => getServerMovieGenres(),
    }),
    queryClient.prefetchQuery({
      queryKey: ["tv-genres"],
      queryFn: () => getServerTVGenres(),
    }),
  ]);

  await queryClient.prefetchInfiniteQuery({
    queryKey: [
      "upcoming-infinite",
      section,
      movieSectionFilter,
      bollywoodLanguage,
      movieGenre,
      seriesGenre,
      seriesOtt,
      seriesLanguage,
      selectedFilterDate,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam) || 1;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);
      const releaseDateGte = selectedFilterDate === "all" ? tomorrowStr : selectedFilterDate;
      const releaseDateLte = selectedFilterDate === "all" ? undefined : selectedFilterDate;

      if (section === "movies") {
        const baseFilters: DiscoverFilters = {
          page,
          sort_by: "primary_release_date.asc",
          with_genres: movieGenre || undefined,
          "primary_release_date.gte": releaseDateGte,
          "primary_release_date.lte": releaseDateLte,
        };

        if (movieSectionFilter === "bollywood" && bollywoodLanguage === "all") {
          const languageResponses = await Promise.allSettled(
            BOLLYWOOD_LANGUAGE_LIST.map((language) =>
              discoverServerMovies({
                ...baseFilters,
                with_original_language: language,
                region: "IN",
              }),
            ),
          );

          const successfulPages = languageResponses.flatMap((response) =>
            response.status === "fulfilled" ? [response.value] : [],
          );

          if (successfulPages.length === 0) {
            return { page, results: [], total_pages: 1, total_results: 0 } satisfies UpcomingPage;
          }

          const deduped = new Map<number, Movie>();
          successfulPages.forEach((data) => {
            (data.results || []).forEach((movie) => {
              if (!deduped.has(movie.id)) deduped.set(movie.id, movie);
            });
          });

          const mergedResults = Array.from(deduped.values()).sort((a, b) => {
            const dateCompare = (a.release_date || "9999-12-31").localeCompare(
              b.release_date || "9999-12-31",
            );
            if (dateCompare !== 0) return dateCompare;
            return (b.popularity || 0) - (a.popularity || 0);
          });

          return {
            page,
            results: mergedResults,
            total_pages: Math.max(...successfulPages.map((data) => data.total_pages || 1)),
            total_results: successfulPages.reduce(
              (total, data) => total + (data.total_results || 0),
              0,
            ),
          } satisfies UpcomingPage;
        }

        const filters: DiscoverFilters = { ...baseFilters };

        if (movieSectionFilter === "hollywood") {
          filters.with_original_language = "en";
          filters.region = "US";
        }

        if (movieSectionFilter === "bollywood") {
          filters.region = "IN";
          if (bollywoodLanguage !== "all") {
            filters.with_original_language = bollywoodLanguage;
          }
        }

        return discoverServerMovies(filters) as Promise<UpcomingPage>;
      }

      if (section === "series") {
        const filters: DiscoverFilters = {
          page,
          sort_by: "first_air_date.asc",
          with_genres: seriesGenre || undefined,
          with_original_language: seriesLanguage === "all" ? undefined : seriesLanguage,
          "first_air_date.gte": releaseDateGte,
          "first_air_date.lte": releaseDateLte,
        };

        if (seriesOtt !== "all") {
          filters.with_watch_providers = seriesOtt;
          filters.watch_region = "US";
        }

        return discoverServerTVShows(filters) as Promise<UpcomingPage>;
      }

      const [upcomingMovies, upcomingSeries] = await Promise.all([
        discoverServerMovies({
          page,
          sort_by: "primary_release_date.asc",
          "primary_release_date.gte": releaseDateGte,
          "primary_release_date.lte": releaseDateLte,
        }).catch(() => ({
          page,
          results: [] as Movie[],
          total_pages: 1,
          total_results: 0,
        })),
        discoverServerTVShows({
          page,
          sort_by: "first_air_date.asc",
          "first_air_date.gte": releaseDateGte,
          "first_air_date.lte": releaseDateLte,
        }).catch(() => ({
          page,
          results: [] as TVShow[],
          total_pages: 1,
          total_results: 0,
        })),
      ]);

      return {
        page,
        results: [...(upcomingMovies.results || []), ...(upcomingSeries.results || [])],
        total_pages: Math.max(upcomingMovies.total_pages || 1, upcomingSeries.total_pages || 1),
        total_results: (upcomingMovies.total_results || 0) + (upcomingSeries.total_results || 0),
      } satisfies UpcomingPage;
    },
    getNextPageParam: (lastPage: UpcomingPage) => {
      if (!lastPage?.page || !lastPage?.total_pages) return undefined;
      return lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined;
    },
  });
}

async function prefetchAuthVisualQueries(queryClient: QueryClient) {
  const [trendingMovies, trendingTV, bollywoodData] = await Promise.allSettled([
    getServerTrendingMovies("week"),
    getServerTrendingTVShows("week"),
    getServerBollywoodMovies(1),
  ]);

  if (trendingMovies.status === "fulfilled") {
    queryClient.setQueryData(["auth-bg-trending-movies"], trendingMovies.value);
    queryClient.setQueryData(["auth-overlay-bg-trending-movies"], trendingMovies.value);
  }
  if (trendingTV.status === "fulfilled") {
    queryClient.setQueryData(["auth-bg-trending-tv"], trendingTV.value);
    queryClient.setQueryData(["auth-overlay-bg-trending-tv"], trendingTV.value);
  }
  if (bollywoodData.status === "fulfilled") {
    queryClient.setQueryData(["auth-bg-bollywood"], bollywoodData.value);
    queryClient.setQueryData(["auth-overlay-bg-bollywood"], bollywoodData.value);
  }
}

async function prefetchRouteData(
  queryClient: QueryClient,
  pathname: string,
  searchParams: SearchParams,
  hasAuthenticatedUser: boolean,
) {
  if (pathname === "/" || pathname === "/auth") {
    await prefetchAuthVisualQueries(queryClient);
    return;
  }

  if (!hasAuthenticatedUser) return;

  if (pathname === "/home") {
    await prefetchHomeQueries(queryClient);
    return;
  }

  if (pathname === "/search") {
    await prefetchSearchQueries(queryClient);
    return;
  }

  if (pathname === "/upcoming") {
    await prefetchUpcomingQueries(queryClient, searchParams);
    return;
  }

  const movieMatch = /^\/movie\/(\d+)$/.exec(pathname);
  if (movieMatch) {
    const movieId = Number(movieMatch[1]);
    if (movieId > 0) {
      await prefetchMovieDetailQueries(queryClient, movieId);
    }
    return;
  }

  const tvMatch = /^\/tv\/(\d+)$/.exec(pathname);
  if (tvMatch) {
    const tvId = Number(tvMatch[1]);
    if (tvId > 0) {
      await prefetchTVDetailQueries(queryClient, tvId);
    }
  }
}

export default async function SpaPage({ params, searchParams }: SpaPageProps) {
  const resolvedParams = (await params) ?? {};
  const resolvedSearchParams = (await searchParams) ?? {};

  const pathname = normalizePathname(resolvedParams.slug);
  const queryString = normalizeSearch(resolvedSearchParams);
  const initialUser = await resolveInitialUser();

  if (initialUser && (pathname === "/" || pathname === "/auth")) {
    redirect("/home");
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
      },
    },
  });

  await prefetchRouteData(queryClient, pathname, resolvedSearchParams, Boolean(initialUser));
  const dehydratedState = dehydrate(queryClient);

  return (
    <App
      initialLocation={`${pathname}${queryString}`}
      dehydratedState={dehydratedState}
      initialUser={initialUser}
      authResolved={Boolean(initialUser)}
    />
  );
}
