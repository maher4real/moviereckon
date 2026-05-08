import { useEffect, useState, useMemo, memo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { useRecommendations } from "@/frontend/hooks/useRecommendations";
import { useNavigate } from "react-router-dom";
import {
  getTrendingMovies,
  getBollywoodMovies,
  getHollywoodMovies,
  getGujaratiMovies,
  getTamilMovies,
  getTeluguMovies,
  getPopularTVShows,
  getTopRatedMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getUpcomingTVShows,
  getPosterUrl,
  Movie,
  TVShow,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import HeroBanner from "@/frontend/components/HeroBanner";
import ContentCarousel from "@/frontend/components/ContentCarousel";
import Footer from "@/frontend/components/Footer";
import MediaImage from "@/frontend/components/MediaImage";
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  Star,
  Film,
  Tv,
  CalendarDays,
  History,
  Clapperboard,
  Award,
  Globe,
} from "lucide-react";
import { announceHomeHeroReady } from "@/frontend/lib/startupSound";
import { cn, formatLocalDate, isAnimeLike } from "@/shared/lib/utils";

// Memoized carousel for performance
const MemoizedCarousel = memo(ContentCarousel);
const HOME_UPCOMING_PAGES = [1, 2, 3] as const;
const HOME_UPCOMING_TV_PAGES = [1, 2] as const;
const HOME_UPCOMING_TIMEOUT_MS = 8000;

type HomeUpcomingData = {
  movies: Movie[];
  tvShows: TVShow[];
};

type ArrivalCard = {
  id: string;
  title: string;
  src: string;
};

const ARRIVAL_CARD_COUNT = 9;
const ARRIVAL_FLIGHTS = [
  { fromX: -560, fromY: 280, toX: -330, toY: 104, fromRotate: -22, toRotate: -10, delay: 0.02 },
  { fromX: -420, fromY: 340, toX: -238, toY: 56, fromRotate: 18, toRotate: 7, delay: 0.09 },
  { fromX: -240, fromY: 400, toX: -146, toY: 92, fromRotate: -14, toRotate: -4, delay: 0.15 },
  { fromX: -70, fromY: 360, toX: -48, toY: 42, fromRotate: 10, toRotate: 3, delay: 0.2 },
  { fromX: 80, fromY: 420, toX: 46, toY: 104, fromRotate: -8, toRotate: -2, delay: 0.26 },
  { fromX: 250, fromY: 350, toX: 144, toY: 52, fromRotate: 16, toRotate: 5, delay: 0.31 },
  { fromX: 430, fromY: 290, toX: 238, toY: 96, fromRotate: -18, toRotate: -6, delay: 0.36 },
  { fromX: 540, fromY: 200, toX: 326, toY: 42, fromRotate: 20, toRotate: 8, delay: 0.42 },
  { fromX: 0, fromY: 520, toX: 0, toY: 136, fromRotate: 0, toRotate: 0, delay: 0.48 },
] as const;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function getMediaTitle(item: Movie | TVShow): string {
  return "title" in item ? item.title : item.name;
}

function buildArrivalCards(items: (Movie | TVShow)[]): ArrivalCard[] {
  const seen = new Set<string>();
  const cards: ArrivalCard[] = [];

  for (const item of items) {
    const itemType = "title" in item ? "movie" : "tv";
    const key = `${itemType}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cards.push({
      id: key,
      title: getMediaTitle(item),
      src: getPosterUrl(item.poster_path || null, "medium"),
    });

    if (cards.length >= ARRIVAL_CARD_COUNT) break;
  }

  while (cards.length < ARRIVAL_CARD_COUNT) {
    const index = cards.length;
    cards.push({
      id: `fallback-arrival-${index}`,
      title: "MovieReckon",
      src: "/fallbacks/poster.svg",
    });
  }

  return cards;
}

function HomeArrivalAnimation({
  active,
  items,
}: {
  active: boolean;
  items: (Movie | TVShow)[];
}) {
  const cards = useMemo(() => buildArrivalCards(items), [items]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          aria-hidden="true"
          data-home-arrival="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-40 h-screen overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0.62, 0] }}
            transition={{ duration: 1.65, times: [0, 0.25, 0.72, 1], ease: "easeOut" }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_58%,hsl(var(--primary)/0.22),transparent_24rem),radial-gradient(circle_at_46%_62%,hsl(var(--brand-orange)/0.2),transparent_32rem)]" />
            <div className="absolute inset-x-[-12%] top-[52%] h-28 -rotate-3 bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.22),hsl(var(--brand-orange)/0.18),transparent)] blur-xl" />
          </motion.div>

          <div className="absolute left-1/2 top-[54%]">
            {cards.map((card, index) => {
              const flight = ARRIVAL_FLIGHTS[index % ARRIVAL_FLIGHTS.length];

              return (
                <motion.div
                  key={card.id}
                  className="absolute w-[clamp(68px,11vw,124px)] origin-center"
                  initial={{
                    opacity: 0,
                    x: flight.fromX,
                    y: flight.fromY,
                    rotate: flight.fromRotate,
                    scale: 0.7,
                    filter: "blur(8px)",
                  }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    x: [flight.fromX, flight.toX, flight.toX * 0.34, 0],
                    y: [flight.fromY, flight.toY, 24, -20],
                    rotate: [flight.fromRotate, flight.toRotate, 0, 0],
                    scale: [0.7, 1, 0.86, 0.56],
                    filter: ["blur(8px)", "blur(0px)", "blur(0px)", "blur(5px)"],
                  }}
                  transition={{
                    duration: 1.52,
                    delay: flight.delay,
                    times: [0, 0.42, 0.78, 1],
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-white/18 bg-card shadow-[0_24px_70px_hsl(0_0%_0%/0.58),0_0_34px_hsl(var(--brand-orange)/0.16)]">
                    <MediaImage
                      src={card.src}
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full object-cover"
                      fallbackSrc="/fallbacks/poster.svg"
                      loading={index < 4 ? "eager" : "lazy"}
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(160deg,hsl(var(--primary)/0.14),transparent_34%,hsl(var(--brand-orange)/0.18))]" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Home() {
  const { user, profile } = useAuth();
  const { watchHistory, isLoading: dataLoading } = useUserData();
  const {
    items: reckonItems,
    isLoading: reckonLoading,
    isPersonalized,
    explanationById,
  } = useRecommendations();
  const navigate = useNavigate();
  const shouldReduceHomeMotion = useReducedMotion();
  const [heroIndex, setHeroIndex] = useState(0);
  const [loadSecondaryShelves, setLoadSecondaryShelves] = useState(false);
  const [loadTertiaryShelves, setLoadTertiaryShelves] = useState(false);
  const [isHeroVisualReady, setIsHeroVisualReady] = useState(false);
  const [showHomeArrival, setShowHomeArrival] = useState(false);
  const hasAnnouncedHeroReadyRef = useRef(false);
  const hasRunHomeArrivalRef = useRef(false);
  const homeArrivalHideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    hasAnnouncedHeroReadyRef.current = false;
    setLoadSecondaryShelves(false);
    setLoadTertiaryShelves(false);
    setIsHeroVisualReady(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const t1 = window.setTimeout(() => setLoadSecondaryShelves(true), 200);
    const t2 = window.setTimeout(() => setLoadTertiaryShelves(true), 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [user]);

  // Fetch all data with optimized query config
  const queryConfig = useMemo(
    () => ({
      staleTime: 1000 * 60 * 10, // 10 minutes
      gcTime: 1000 * 60 * 60,    // 60 minutes
    }),
    [],
  );

  const { data: trendingMovies, isLoading: trendingLoading } = useQuery({
    queryKey: ["trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    ...queryConfig,
  });

  const { data: bollywoodData, isLoading: bollywoodLoading } = useQuery({
    queryKey: ["bollywood-movies"],
    queryFn: () => getBollywoodMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: hollywoodData, isLoading: hollywoodLoading } = useQuery({
    queryKey: ["hollywood-movies"],
    queryFn: () => getHollywoodMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: gujaratiData, isLoading: gujaratiLoading } = useQuery({
    queryKey: ["gujarati-movies"],
    queryFn: () => getGujaratiMovies(),
    ...queryConfig,
    enabled: loadTertiaryShelves,
  });

  const { data: tamilData, isLoading: tamilLoading } = useQuery({
    queryKey: ["tamil-movies"],
    queryFn: () => getTamilMovies(),
    ...queryConfig,
    enabled: loadTertiaryShelves,
  });

  const { data: teluguData, isLoading: teluguLoading } = useQuery({
    queryKey: ["telugu-movies"],
    queryFn: () => getTeluguMovies(),
    ...queryConfig,
    enabled: loadTertiaryShelves,
  });

  const { data: tvShowsData, isLoading: tvLoading } = useQuery({
    queryKey: ["popular-tv"],
    queryFn: () => getPopularTVShows(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: topRatedData, isLoading: topRatedLoading } = useQuery({
    queryKey: ["top-rated-movies"],
    queryFn: () => getTopRatedMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: nowPlayingData, isLoading: nowPlayingLoading } = useQuery({
    queryKey: ["now-playing-movies"],
    queryFn: () => getNowPlayingMovies(),
    ...queryConfig,
    enabled: loadSecondaryShelves,
  });

  const { data: upcomingHomeData, isLoading: upcomingLoading } = useQuery({
    queryKey: ["upcoming-home"],
    queryFn: async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatLocalDate(tomorrow);

      const [movieResponses, tvResponses] = await Promise.all([
        Promise.allSettled(
          HOME_UPCOMING_PAGES.map((page) =>
            withTimeout(getUpcomingMovies(page), HOME_UPCOMING_TIMEOUT_MS),
          ),
        ),
        Promise.allSettled(
          HOME_UPCOMING_TV_PAGES.map((page) =>
            withTimeout(
              getUpcomingTVShows(page, tomorrowStr),
              HOME_UPCOMING_TIMEOUT_MS,
            ),
          ),
        ),
      ]);

      const dedupedMovies = new Map<number, Movie>();
      movieResponses.forEach((response) => {
        if (response.status !== "fulfilled") return;
        response.value.results?.forEach((movie) => {
          if (!dedupedMovies.has(movie.id)) {
            dedupedMovies.set(movie.id, movie);
          }
        });
      });

      const dedupedTVShows = new Map<number, TVShow>();
      tvResponses.forEach((response) => {
        if (response.status !== "fulfilled") return;
        response.value.results?.forEach((show) => {
          if (!dedupedTVShows.has(show.id)) {
            dedupedTVShows.set(show.id, show);
          }
        });
      });

      return {
        movies: Array.from(dedupedMovies.values()).sort((a, b) =>
          (a.release_date || "9999-12-31").localeCompare(
            b.release_date || "9999-12-31",
          ),
        ),
        tvShows: Array.from(dedupedTVShows.values()).sort((a, b) =>
          (a.first_air_date || "9999-12-31").localeCompare(
            b.first_air_date || "9999-12-31",
          ),
        ),
      } satisfies HomeUpcomingData;
    },
    ...queryConfig,
    enabled: loadTertiaryShelves,
    retry: false,
  });

  const upcomingMovies = upcomingHomeData?.movies;
  const upcomingTVShows = upcomingHomeData?.tvShows;

  // Filter Now Playing to only show movies released today or earlier
  const filteredNowPlaying = useMemo(() => {
    if (!nowPlayingData?.results) return [];
    const today = formatLocalDate(new Date());
    return nowPlayingData.results.filter(
      (movie) => movie.release_date <= today && !isAnimeLike(movie),
    );
  }, [nowPlayingData]);

  // Upcoming section should only include releases within the next two months.
  const filteredUpcoming = useMemo(() => {
    if (!upcomingMovies?.length && !upcomingTVShows?.length) return [];

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const twoMonthsAhead = new Date(today);
    twoMonthsAhead.setMonth(twoMonthsAhead.getMonth() + 2);
    const tomorrowStr = formatLocalDate(tomorrow);
    const twoMonthsAheadStr = formatLocalDate(twoMonthsAhead);
    const dedupe = new Set<string>();

    const upcomingMoviesOnly = (upcomingMovies || [])
      .filter(
        (movie) =>
          Boolean(movie.release_date) &&
          movie.release_date >= tomorrowStr &&
          movie.release_date <= twoMonthsAheadStr,
      )
      .filter((movie) => !isAnimeLike(movie));

    const upcomingSeriesOnly = (upcomingTVShows || [])
      .filter(
        (show) =>
          Boolean(show.first_air_date) &&
          show.first_air_date >= tomorrowStr &&
          show.first_air_date <= twoMonthsAheadStr,
      )
      .filter((show) => !isAnimeLike(show));

    const combined = [...upcomingMoviesOnly, ...upcomingSeriesOnly]
      .filter((item) => {
        const isTV = "first_air_date" in item;
        const key = `${isTV ? "tv" : "movie"}:${item.id}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      })
      .sort((a, b) => {
        const dateA = "release_date" in a ? a.release_date : a.first_air_date;
        const dateB = "release_date" in b ? b.release_date : b.first_air_date;
        return (dateA || "9999-12-31").localeCompare(dateB || "9999-12-31");
      });

    return combined;
  }, [upcomingMovies, upcomingTVShows]);

  const filteredTrendingMovies = useMemo(
    () => (trendingMovies || []).filter((movie) => !isAnimeLike(movie)),
    [trendingMovies],
  );

  const filteredTopRatedMovies = useMemo(
    () => (topRatedData?.results || []).filter((movie) => !isAnimeLike(movie)),
    [topRatedData],
  );

  const filteredTvShows = useMemo(
    () => (tvShowsData?.results || []).filter((show) => !isAnimeLike(show)),
    [tvShowsData],
  );

  // Hero movies (top 5 trending)
  const heroMovies = useMemo(
    () => filteredTrendingMovies.slice(0, 5),
    [filteredTrendingMovies],
  );
  const currentHeroMovie = heroMovies[heroIndex];

  // Auto-rotate hero banner
  useEffect(() => {
    if (heroMovies.length === 0) {
      setHeroIndex(0);
      return;
    }

    setHeroIndex((prev) => (prev >= heroMovies.length ? 0 : prev));

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroMovies.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [heroMovies.length]);

  // Get recently watched for recommendations - memoized
  const recentlyWatched = useMemo(() => {
    return watchHistory.slice(0, 10).map((item) => {
      const isTV = item.content_type === "tv";
      return {
        id: item.content_id,
        title: item.title,
        name: item.title,
        poster_path: item.poster_path,
        backdrop_path: null,
        overview: "",
        vote_average: 0,
        vote_count: 0,
        popularity: 0,
        genre_ids: item.genres,
        original_language: item.language,
        release_date: "",
        first_air_date: isTV ? "2024-01-01" : "", // Mark TV shows properly for type detection
        adult: false,
        video: false,
        original_title: item.title,
        original_name: item.title,
        origin_country: [],
        _content_type: item.content_type, // Preserve content type for routing
      };
    });
  }, [watchHistory]);

  const homeArrivalItems = useMemo<(Movie | TVShow)[]>(
    () => [
      ...(reckonItems as (Movie | TVShow)[]),
      ...heroMovies,
      ...filteredNowPlaying,
      ...filteredUpcoming,
      ...recentlyWatched,
      ...(bollywoodData?.results || []),
      ...(hollywoodData?.results || []),
      ...(tvShowsData?.results || []),
    ],
    [
      bollywoodData,
      filteredNowPlaying,
      filteredUpcoming,
      heroMovies,
      hollywoodData,
      reckonItems,
      recentlyWatched,
      tvShowsData,
    ],
  );

  const handleDotClick = useCallback((index: number) => {
    setHeroIndex(index);
  }, []);

  const handleHeroBackdropReady = useCallback(() => {
    setIsHeroVisualReady(true);
    if (hasAnnouncedHeroReadyRef.current) return;
    hasAnnouncedHeroReadyRef.current = true;
    announceHomeHeroReady();
  }, []);

  const startHomeArrival = useCallback(() => {
    if (shouldReduceHomeMotion || hasRunHomeArrivalRef.current) return;

    hasRunHomeArrivalRef.current = true;
    setShowHomeArrival(true);
    homeArrivalHideTimerRef.current = window.setTimeout(() => {
      homeArrivalHideTimerRef.current = null;
      setShowHomeArrival(false);
    }, 1780);
  }, [shouldReduceHomeMotion]);

  useEffect(() => {
    if (shouldReduceHomeMotion || hasRunHomeArrivalRef.current) return;

    if (isHeroVisualReady || !trendingLoading) {
      startHomeArrival();
      return;
    }

    const fallbackStartId = window.setTimeout(startHomeArrival, 700);
    return () => window.clearTimeout(fallbackStartId);
  }, [isHeroVisualReady, shouldReduceHomeMotion, startHomeArrival, trendingLoading]);

  useEffect(() => {
    return () => {
      if (homeArrivalHideTimerRef.current !== null) {
        window.clearTimeout(homeArrivalHideTimerRef.current);
      }
    };
  }, []);

  const secondaryShelvesPending = !loadSecondaryShelves;
  const tertiaryShelvesPending = !loadTertiaryShelves;

  return (
    <div className="app-page relative overflow-x-hidden pb-20 md:pb-0">
      <Header />
      <HomeArrivalAnimation active={showHomeArrival} items={homeArrivalItems} />

      {/* Hero Banner */}
      <HeroBanner
        movie={currentHeroMovie}
        isLoading={trendingLoading}
        currentIndex={heroIndex}
        totalSlides={heroMovies.length}
        onDotClick={handleDotClick}
        onBackdropReady={handleHeroBackdropReady}
      />

      {/* Content Sections */}
      <motion.main
        initial={shouldReduceHomeMotion ? false : { opacity: 0.78, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: showHomeArrival && !shouldReduceHomeMotion ? 0.24 : 0,
          duration: 0.58,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="relative z-10 -mt-20 pb-20 pt-6 md:-mt-24 md:pt-8"
      >
        <div className="space-y-10">

          {/* Reckon - Personalized Recommendations */}
          {reckonItems.length > 0 && (
            <section className="surface-panel brand-warm-surface mx-2 overflow-hidden border-primary/25 md:mx-4">
              <div className="px-4 md:px-6 pt-5 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg border border-primary/25 bg-primary/10 p-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="text-lg md:text-xl font-bold tracking-tight">
                    {isPersonalized ? "Reckon For You" : "Top Picks"}
                  </h2>
                  {isPersonalized && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary text-[10px] font-semibold">
                      Personalized
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/reckon")}
                  className={cn(
                    "flex items-center gap-1 rounded-full border border-border/60 bg-background/55 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors duration-200 hover:border-primary/45 hover:text-primary"
                  )}
                >
                  View All
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <MemoizedCarousel
                title=""
                items={reckonItems as (Movie | TVShow)[]}
                isLoading={reckonLoading}
                type="mixed"
                viewAllHref="/reckon"
                showViewAllCard={false}
                priorityImages={!currentHeroMovie}
                recommendationExplanations={explanationById}
              />
            </section>
          )}

          {/* Now Playing */}
          {(secondaryShelvesPending || filteredNowPlaying.length > 0 || nowPlayingLoading) && (
            <MemoizedCarousel
              title="Now Playing"
              icon={Clapperboard}
              items={filteredNowPlaying as (Movie | TVShow)[]}
              isLoading={secondaryShelvesPending || nowPlayingLoading}
              type="movie"
              viewAllHref="/movies?category=now_playing"
            />
          )}

          {/* Upcoming */}
          {(tertiaryShelvesPending || filteredUpcoming.length > 0 || upcomingLoading) && (
            <MemoizedCarousel
              title="Upcoming"
              icon={CalendarDays}
              items={filteredUpcoming as (Movie | TVShow)[]}
              isLoading={tertiaryShelvesPending || upcomingLoading}
              type="mixed"
              viewAllHref="/upcoming"
            />
          )}

          {/* Trending Now */}
          <MemoizedCarousel
            title="Trending Now"
            icon={TrendingUp}
            items={filteredTrendingMovies as (Movie | TVShow)[]}
            isLoading={trendingLoading}
            type="movie"
            viewAllHref="/movies?category=trending"
            priorityImages={!currentHeroMovie && reckonItems.length === 0}
          />

          {/* Continue Watching */}
          {recentlyWatched.length > 0 && (
            <MemoizedCarousel
              title="Continue Watching"
              icon={History}
              items={recentlyWatched as (Movie | TVShow)[]}
              isLoading={false}
              type="mixed"
              viewAllHref="/profile"
            />
          )}

          {/* Bollywood Hits */}
          <MemoizedCarousel
            title="Bollywood Hits"
            icon={Film}
            items={bollywoodData?.results as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || bollywoodLoading}
            type="movie"
            viewAllHref="/movies?category=bollywood"
          />

          {/* Hollywood Blockbusters */}
          <MemoizedCarousel
            title="Hollywood Blockbusters"
            icon={Globe}
            items={hollywoodData?.results as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || hollywoodLoading}
            type="movie"
            viewAllHref="/movies?category=hollywood"
          />

          {/* Tamil Cinema */}
          {tamilData?.results && tamilData.results.length > 0 && (
            <MemoizedCarousel
              title="Tamil Cinema"
              icon={Film}
              items={tamilData.results as (Movie | TVShow)[]}
              isLoading={tamilLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=ta"
            />
          )}

          {/* Telugu Cinema */}
          {teluguData?.results && teluguData.results.length > 0 && (
            <MemoizedCarousel
              title="Telugu Cinema"
              icon={Film}
              items={teluguData.results as (Movie | TVShow)[]}
              isLoading={teluguLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=te"
            />
          )}

          {/* Gujarati Cinema */}
          {gujaratiData?.results && gujaratiData.results.length > 0 && (
            <MemoizedCarousel
              title="Gujarati Cinema"
              icon={Film}
              items={gujaratiData.results as (Movie | TVShow)[]}
              isLoading={gujaratiLoading}
              type="movie"
              viewAllHref="/movies?category=bollywood&lang=gu"
            />
          )}

          {/* Trending TV Series */}
          <MemoizedCarousel
            title="Trending TV Series"
            icon={Tv}
            items={filteredTvShows as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || tvLoading}
            type="tv"
            viewAllHref="/series?category=popular"
          />

          {/* Top Rated */}
          <MemoizedCarousel
            title="Top Rated"
            icon={Award}
            items={filteredTopRatedMovies as (Movie | TVShow)[]}
            isLoading={secondaryShelvesPending || topRatedLoading}
            type="movie"
            viewAllHref="/movies?sort=vote_average.desc"
          />

        </div>
      </motion.main>

      <Footer />
    </div>
  );
}
