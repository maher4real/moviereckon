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
  Movie,
  TVShow,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import HeroBanner from "@/frontend/components/HeroBanner";
import ContentCarousel from "@/frontend/components/ContentCarousel";
import Footer from "@/frontend/components/Footer";
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

const HOME_INTRO_DURATION_MS = 2280;
const HOME_INTRO_POSTER_COUNT = 9;
const HOME_INTRO_SHELVES = [
  { key: "reckon", delay: 0.5, titleWidth: "w-40 md:w-52" },
  { key: "now-playing", delay: 0.72, titleWidth: "w-32 md:w-44" },
  { key: "trending", delay: 0.94, titleWidth: "w-36 md:w-48" },
] as const;
const HOME_INTRO_CARD_OFFSETS = [
  { x: -118, y: 92, rotate: -10 },
  { x: -84, y: 118, rotate: 7 },
  { x: -42, y: 142, rotate: -5 },
  { x: 20, y: 126, rotate: 4 },
  { x: 70, y: 112, rotate: -7 },
  { x: 120, y: 94, rotate: 8 },
  { x: 160, y: 124, rotate: -4 },
  { x: 205, y: 104, rotate: 6 },
  { x: 250, y: 132, rotate: -8 },
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

function HomeIntroPosterSkeleton({
  shelfIndex,
  cardIndex,
}: {
  shelfIndex: number;
  cardIndex: number;
}) {
  const offset =
    HOME_INTRO_CARD_OFFSETS[cardIndex % HOME_INTRO_CARD_OFFSETS.length] ??
    HOME_INTRO_CARD_OFFSETS[0];
  const shelf = HOME_INTRO_SHELVES[shelfIndex] ?? HOME_INTRO_SHELVES[0];
  const delay = shelf.delay + cardIndex * 0.035;

  return (
    <motion.div
      className="w-[29vw] min-w-[105px] max-w-[140px] shrink-0 sm:w-[130px] md:w-[150px] lg:w-[170px] xl:w-[190px]"
      initial={{
        opacity: 0,
        x: offset.x,
        y: offset.y,
        rotate: offset.rotate,
        scale: 0.82,
        filter: "blur(8px)",
      }}
      animate={{
        opacity: 1,
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
        filter: "blur(0px)",
      }}
      transition={{
        delay,
        duration: 0.72,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(145deg,hsl(var(--primary)/0.2),hsl(var(--muted)/0.72)_44%,hsl(var(--brand-orange)/0.26))] shadow-[0_20px_55px_hsl(0_0%_0%/0.36),0_0_28px_hsl(var(--brand-orange)/0.12)]">
        <motion.div
          className="absolute inset-y-0 w-1/2 bg-[linear-gradient(100deg,transparent,hsl(var(--foreground)/0.18),transparent)]"
          initial={{ x: "-140%" }}
          animate={{ x: "240%" }}
          transition={{
            delay: delay + 0.12,
            duration: 1.08,
            ease: "easeInOut",
          }}
        />
        <div className="absolute inset-x-2 top-2 h-3 rounded-full bg-white/12" />
        <div className="absolute bottom-2 left-2 h-2 w-2/3 rounded-full bg-white/14" />
        <div className="absolute bottom-5 left-2 h-2 w-1/2 rounded-full bg-white/9" />
      </div>
      <div className="mt-2 h-3 w-3/4 rounded-full bg-white/10" />
      <div className="mt-1.5 h-2.5 w-1/2 rounded-full bg-white/7" />
    </motion.div>
  );
}

function HomeIntroShelfSkeleton({
  shelf,
  shelfIndex,
}: {
  shelf: (typeof HOME_INTRO_SHELVES)[number];
  shelfIndex: number;
}) {
  return (
    <motion.section
      className="px-3 sm:px-4 md:px-6 lg:px-8"
      initial={{ opacity: 0, y: 34 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: shelf.delay - 0.12,
        duration: 0.54,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3 md:mb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="brand-gradient-bar h-8 w-1 shrink-0 rounded-full shadow-lg shadow-primary/25" />
          <div className={cn("h-5 rounded-full bg-white/13", shelf.titleWidth)} />
        </div>
        <div className="h-7 w-16 shrink-0 rounded-full border border-white/8 bg-white/8" />
      </div>

      <div className="overflow-hidden px-1 pt-2 pb-3 md:px-4 md:pt-3 md:pb-4">
        <div className="flex gap-2.5 sm:gap-3 md:gap-4">
          {Array.from({ length: HOME_INTRO_POSTER_COUNT }).map((_, cardIndex) => (
            <HomeIntroPosterSkeleton
              key={`${shelf.key}-intro-card-${cardIndex}`}
              shelfIndex={shelfIndex}
              cardIndex={cardIndex}
            />
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function HomeStartupTransition({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="home-startup-transition"
          aria-hidden="true"
          data-home-startup-transition="true"
          className="pointer-events-none fixed inset-0 z-[120] overflow-hidden bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28 }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_14%,hsl(var(--primary)/0.24),transparent_25rem),radial-gradient(circle_at_88%_8%,hsl(var(--brand-orange)/0.2),transparent_30rem),linear-gradient(180deg,hsl(0_0%_5%),hsl(var(--background))_54%,hsl(0_0%_3%))]" />
            <div className="absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(90deg,hsl(var(--foreground)/0.05)_0_1px,transparent_1px_82px)]" />
            <motion.div
              className="absolute inset-x-[-12%] top-[38%] h-32 -rotate-2 bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.28),hsl(var(--brand-orange)/0.2),transparent)] blur-2xl"
              initial={{ x: "-12%", opacity: 0 }}
              animate={{ x: "12%", opacity: [0, 1, 0.38] }}
              transition={{ duration: 1.62, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.div>

          <motion.div
            className="absolute inset-x-0 top-0 z-10 h-16 border-b border-white/8 bg-background/72 px-3 backdrop-blur-md"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
              <div className="h-9 w-32 rounded-lg bg-[linear-gradient(135deg,hsl(var(--primary)/0.44),hsl(var(--brand-orange)/0.22))]" />
              <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 px-6 md:flex">
                {[72, 68, 76, 64, 78].map((width) => (
                  <div
                    key={`home-intro-nav-${width}`}
                    className="h-8 rounded-full border border-white/8 bg-white/8"
                    style={{ width }}
                  />
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="h-10 w-10 rounded-full border border-white/8 bg-white/8" />
                <div className="h-10 w-10 rounded-full border border-primary/20 bg-primary/12" />
              </div>
            </div>
          </motion.div>

          <div className="relative h-[70vh] overflow-hidden md:h-[85vh]">
            <motion.div
              className="absolute inset-0 bg-[radial-gradient(circle_at_70%_28%,hsl(var(--brand-orange)/0.34),transparent_23rem),linear-gradient(116deg,hsl(var(--background))_0%,hsl(var(--primary)/0.22)_46%,hsl(var(--brand-orange)/0.18)_100%)]"
              initial={{ scale: 1.04, opacity: 0.72 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/92 via-background/58 to-background/14" />
            <div className="absolute inset-0 hero-gradient" />
            <div className="hero-bottom-blend" />

            <div className="absolute inset-0 flex items-center">
              <div className="container mx-auto px-4">
                <motion.div
                  className="max-w-2xl space-y-4"
                  initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.22, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-20 rounded-md border border-primary/20 bg-primary/18" />
                    <div className="h-7 w-14 rounded-md border border-white/8 bg-white/10" />
                  </div>
                  <div className="h-12 w-[min(78vw,34rem)] rounded-lg bg-white/14 md:h-16" />
                  <div className="h-4 w-[min(72vw,30rem)] rounded-full bg-white/10" />
                  <div className="h-4 w-[min(58vw,24rem)] rounded-full bg-white/8" />
                  <div className="flex gap-3 pt-2">
                    <div className="h-11 w-36 rounded-md bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--brand-orange)))] shadow-lg shadow-primary/20" />
                    <div className="h-11 w-32 rounded-md border border-white/14 bg-white/12" />
                  </div>
                </motion.div>
              </div>
            </div>
          </div>

          <motion.main
            className="relative z-10 -mt-20 space-y-8 pb-24 pt-6 md:-mt-24 md:pt-8"
            initial={{ opacity: 0.88 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.36, duration: 0.4 }}
          >
            {HOME_INTRO_SHELVES.map((shelf, shelfIndex) => (
              <HomeIntroShelfSkeleton
                key={shelf.key}
                shelf={shelf}
                shelfIndex={shelfIndex}
              />
            ))}
          </motion.main>

          <motion.div
            className="fixed inset-x-0 bottom-0 z-20 border-t border-white/8 bg-background/90 px-3 py-2 md:hidden"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1.06, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex h-14 items-center justify-around gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`home-intro-bottom-nav-${index}`}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div className="h-5 w-5 rounded-md bg-white/12" />
                  <div className="h-2 w-8 rounded-full bg-white/8" />
                </div>
              ))}
            </div>
          </motion.div>
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
  const reduceHomeMotion = Boolean(shouldReduceHomeMotion);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loadSecondaryShelves, setLoadSecondaryShelves] = useState(false);
  const [loadTertiaryShelves, setLoadTertiaryShelves] = useState(false);
  const [isHomeIntroComplete, setIsHomeIntroComplete] = useState(reduceHomeMotion);
  const hasAnnouncedHeroReadyRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    hasAnnouncedHeroReadyRef.current = false;
    setLoadSecondaryShelves(false);
    setLoadTertiaryShelves(false);
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

  useEffect(() => {
    if (reduceHomeMotion) {
      setIsHomeIntroComplete(true);
      return;
    }

    setIsHomeIntroComplete(false);
    const introTimer = window.setTimeout(() => {
      setIsHomeIntroComplete(true);
    }, HOME_INTRO_DURATION_MS);

    return () => window.clearTimeout(introTimer);
  }, [reduceHomeMotion]);

  const isHomeIntroActive = !isHomeIntroComplete && !reduceHomeMotion;

  useEffect(() => {
    if (!isHomeIntroActive || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isHomeIntroActive]);

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

  const handleDotClick = useCallback((index: number) => {
    setHeroIndex(index);
  }, []);

  const handleHeroBackdropReady = useCallback(() => {
    if (hasAnnouncedHeroReadyRef.current) return;
    hasAnnouncedHeroReadyRef.current = true;
    announceHomeHeroReady();
  }, []);

  const secondaryShelvesPending = !loadSecondaryShelves;
  const tertiaryShelvesPending = !loadTertiaryShelves;

  return (
    <div className="app-page relative overflow-x-hidden pb-20 md:pb-0">
      <HomeStartupTransition active={isHomeIntroActive} />

      {isHomeIntroComplete && (
        <>
          <Header />

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
            initial={reduceHomeMotion ? false : { opacity: 0, y: 22, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              delay: reduceHomeMotion ? 0 : 0.08,
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
        </>
      )}
    </div>
  );
}
