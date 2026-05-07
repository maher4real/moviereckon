import { useCallback, useEffect, useMemo, useRef, useState, memo, lazy, Suspense } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { useWatchlist } from "@/frontend/hooks/useWatchlist";
import {
  getMovieDetails,
  getMovieCredits,
  getMovieReleaseDates,
  getMovieVideos,
  getMovieKeywords,
  getSimilarMovies,
  getMovieWatchProviders,
  getBackdropUrl,
  getPosterUrl,
  getYouTubeTrailerUrl,
  getLanguageLabel,
  Cast,
  MovieKeyword,
  Movie,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import ContentCarousel from "@/frontend/components/ContentCarousel";
import WhereToWatch from "@/frontend/components/WhereToWatch";
import CastList from "@/frontend/components/CastList";
import MediaImage from "@/frontend/components/MediaImage";
import ContentReactionButtons from "@/frontend/components/ContentReactionButtons";
import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  Globe,
  Play,
  Bookmark,
  Check,
  CircleDollarSign,
  Star,
  Tag,
  BadgeCheck,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

const MemoizedCarousel = memo(ContentCarousel);
const LazyCommentsSection = lazy(() => import("@/frontend/components/CommentsSection"));
const PREVIEW_AUTOPLAY_TIMEOUT_MS = 12000;
const BACKGROUND_VIDEO_BOOT_DELAY_MS = 900;
const MOVIE_WRITER_JOBS = new Set(["Writer", "Screenplay", "Story", "Novel"]);
const MOVIE_PRODUCER_JOBS = new Set(["Producer", "Executive Producer"]);

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useAuth();
  const { addToWatchHistory, isWatched } = useUserData();
  const { isInWatchlist, toggleItem: toggleWatchlist } = useWatchlist();
  const [watchAnimating, setWatchAnimating] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);
  const [trailerSessionId, setTrailerSessionId] = useState(0);
  const [isBackgroundVideoVisible, setIsBackgroundVideoVisible] = useState(true);
  const [shouldLoadBackgroundVideo, setShouldLoadBackgroundVideo] = useState(false);
  const [isBackgroundVideoPlaying, setIsBackgroundVideoPlaying] = useState(false);
  const [shouldRenderCommunity, setShouldRenderCommunity] = useState(false);
  const [bgFrameSize, setBgFrameSize] = useState({ width: 1920, height: 1080 });
  const heroMediaRef = useRef<HTMLDivElement>(null);
  const bgPlayerRef = useRef<HTMLIFrameElement>(null);
  const communitySectionRef = useRef<HTMLDivElement>(null);
  const hasAutoPlayedRef = useRef(false);

  const movieId = Number(id);

  const handleBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) {
      navigate(from);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/home");
  };

  // Always open detail page from top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [movieId]);

  // Fetch movie details
  const { data: movie, isLoading: movieLoading, isError: movieError } = useQuery({
    queryKey: ["movie", movieId],
    queryFn: () => getMovieDetails(movieId),
    enabled: !!movieId,
    retry: 2,
  });

  // Fetch credits
  const { data: creditsData } = useQuery({
    queryKey: ["movie-credits", movieId],
    queryFn: () => getMovieCredits(movieId),
    enabled: !!movieId,
  });

  // Fetch videos
  const { data: videosData } = useQuery({
    queryKey: ["movie-videos", movieId],
    queryFn: () => getMovieVideos(movieId),
    enabled: !!movieId,
  });

  // Fetch similar movies
  const { data: similarData, isLoading: similarLoading } = useQuery({
    queryKey: ["similar-movies", movieId],
    queryFn: () => getSimilarMovies(movieId),
    enabled: !!movieId,
  });

  // Fetch watch providers (IN region for India)
  const { data: watchProvidersData } = useQuery({
    queryKey: ["movie-watch-providers", movieId],
    queryFn: () => getMovieWatchProviders(movieId),
    enabled: !!movieId,
  });

  const { data: releaseDatesData } = useQuery({
    queryKey: ["movie-release-dates", movieId],
    queryFn: () => getMovieReleaseDates(movieId),
    enabled: !!movieId,
  });

  const { data: keywords = [] } = useQuery<MovieKeyword[]>({
    queryKey: ["movie-keywords", movieId],
    queryFn: () => getMovieKeywords(movieId),
    enabled: !!movieId,
    staleTime: 1000 * 60 * 30,
  });

  const cast = useMemo(
    () => [...(creditsData?.cast || [])].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)),
    [creditsData],
  );
  const crew = useMemo(
    () =>
      [...(creditsData?.crew || [])].sort(
        (a, b) =>
          a.department.localeCompare(b.department) ||
          a.job.localeCompare(b.job) ||
          a.name.localeCompare(b.name),
      ),
    [creditsData],
  );
  const crewAsCast = useMemo<Cast[]>(
    () =>
      crew.map((member, index) => {
        const role =
          member.job && member.department && member.department !== member.job
            ? `${member.job} • ${member.department}`
            : member.job || member.department || "Crew";

        return {
          id: member.id,
          name: member.name,
          character: role,
          profile_path: member.profile_path,
          order: index,
        };
      }),
    [crew],
  );

  const crewSummary = useMemo(() => {
    const directors: string[] = [];
    const writers: string[] = [];
    const producers: string[] = [];
    const seenDirectors = new Set<string>();
    const seenWriters = new Set<string>();
    const seenProducers = new Set<string>();

    for (const member of crew) {
      const name = member.name;

      if (member.job === "Director" && !seenDirectors.has(name)) {
        seenDirectors.add(name);
        directors.push(name);
      }

      if (MOVIE_WRITER_JOBS.has(member.job) && !seenWriters.has(name)) {
        seenWriters.add(name);
        writers.push(name);
      }

      if (MOVIE_PRODUCER_JOBS.has(member.job) && !seenProducers.has(name)) {
        seenProducers.add(name);
        producers.push(name);
      }
    }

    return {
      directors: directors.slice(0, 3),
      writers: writers.slice(0, 4),
      producers: producers.slice(0, 4),
    };
  }, [crew]);
  const { directors, writers, producers } = crewSummary;

  const certification = useMemo(() => {
    const preferredRegions = ["US", "GB", "CA", "AU", "IN"];
    const results = releaseDatesData?.results || [];
    const certificationsByRegion = new Map<string, string>();
    let fallbackCertification: string | null = null;

    for (const region of results) {
      let regionCertification: string | null = null;

      for (const release of region.release_dates) {
        const certificationValue = release.certification?.trim();
        if (!certificationValue) continue;
        regionCertification = certificationValue;
        break;
      }

      if (!regionCertification) continue;
      if (fallbackCertification === null) {
        fallbackCertification = regionCertification;
      }
      certificationsByRegion.set(region.iso_3166_1, regionCertification);
    }

    for (const regionCode of preferredRegions) {
      const value = certificationsByRegion.get(regionCode);
      if (value) return value;
    }

    return fallbackCertification;
  }, [releaseDatesData]);
  const trailerUrl = videosData ? getYouTubeTrailerUrl(videosData.results) : null;
  const preferredTrailerKey = trailerUrl?.split("/embed/")[1]?.split("?")[0] || null;
  const backgroundTrailerKeys = useMemo(() => {
    const results = videosData?.results || [];
    const ranked = results
      .filter(
        (video) =>
          video.site === "YouTube" &&
          !!video.key &&
          (video.type === "Trailer" || video.type === "Teaser" || video.type === "Clip"),
      )
      .sort((a, b) => {
        const score = (video: (typeof results)[number]) => {
          const typeScore =
            video.type === "Trailer" ? 3 : video.type === "Teaser" ? 2 : 1;
          return (video.official ? 10 : 0) + typeScore;
        };
        return score(b) - score(a);
      });

    const unique = Array.from(new Map(ranked.map((video) => [video.key, video])).values());
    const candidateKeys = [
      preferredTrailerKey,
      ...unique.map((video) => video.key),
    ].filter((key): key is string => Boolean(key));
    return Array.from(new Set(candidateKeys)).slice(0, 3);
  }, [videosData, preferredTrailerKey]);
  const activeBgVideoKey = backgroundTrailerKeys[0] || null;
  const trailerModalKey = preferredTrailerKey || activeBgVideoKey;
  const youtubeOrigin = useMemo(
    () =>
      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "",
    [],
  );

  useEffect(() => {
    setIsTrailerModalOpen(false);
    hasAutoPlayedRef.current = false;
  }, [movieId]);

  // Auto-open trailer when navigated from hero "Watch Trailer" button
  const autoPlayTrailer = (location.state as { autoPlayTrailer?: boolean } | null)?.autoPlayTrailer;
  useEffect(() => {
    if (!autoPlayTrailer || !trailerModalKey || hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    setTrailerSessionId((prev) => prev + 1);
    setIsTrailerModalOpen(true);
  }, [autoPlayTrailer, trailerModalKey]);

  useEffect(() => {
    setShouldRenderCommunity(false);
  }, [movieId]);

  useEffect(() => {
    if (shouldRenderCommunity) return;

    const target = communitySectionRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setShouldRenderCommunity(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setShouldRenderCommunity(true);
        observer.disconnect();
      },
      { rootMargin: "280px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldRenderCommunity, movieId]);

  useEffect(() => {
    const updateFrameSize = () => {
      const container = heroMediaRef.current;
      if (!container) return;
      const { width: containerWidth, height: containerHeight } =
        container.getBoundingClientRect();
      const aspectRatio = 16 / 9;

      let width = containerWidth;
      let height = width / aspectRatio;
      if (height < containerHeight) {
        height = containerHeight;
        width = height * aspectRatio;
      }

      // Extra overscan keeps the trailer in cover mode across unusual aspect ratios.
      setBgFrameSize({ width: Math.ceil(width * 1.16), height: Math.ceil(height * 1.16) });
    };

    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    if (heroMediaRef.current) observer.observe(heroMediaRef.current);
    window.addEventListener("resize", updateFrameSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFrameSize);
    };
  }, []);

  // Get providers for IN (India) or US as fallback
  const providers = watchProvidersData?.results?.IN || watchProvidersData?.results?.US || null;
  const watchLink = providers?.link;

  const handleMarkWatched = async () => {
    if (!movie) return;
    setWatchAnimating(true);
    setTimeout(() => setWatchAnimating(false), 420);
    await addToWatchHistory({
      content_id: movie.id,
      content_type: "movie",
      title: movie.title,
      poster_path: movie.poster_path,
      genres: movie.genres.map((g) => g.id),
      language: movie.original_language,
    });
  };

  const handleToggleWatchlist = async () => {
    if (!movie) return;
    setBookmarkAnimating(true);
    setTimeout(() => setBookmarkAnimating(false), 420);
    await toggleWatchlist({
      content_id: movie.id,
      content_type: "movie",
      title: movie.title,
      poster_path: movie.poster_path,
    });
  };

  const formatRuntime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatReleaseDate = (date: string): string => {
    if (!date) return "N/A";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatMoney = (amount: number): string => {
    if (!amount || amount <= 0) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const backgroundTrailerEmbedUrl = activeBgVideoKey
    ? `https://www.youtube.com/embed/${activeBgVideoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${activeBgVideoKey}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1${youtubeOrigin ? `&origin=${youtubeOrigin}` : ""}`
    : null;
  const modalTrailerEmbedUrl =
    trailerModalKey && isTrailerModalOpen
      ? `https://www.youtube.com/embed/${trailerModalKey}?autoplay=1&mute=0&controls=1&loop=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&start=0&enablejsapi=1${youtubeOrigin ? `&origin=${youtubeOrigin}` : ""}`
      : null;
  const controlBackgroundPreview = useCallback(
    (
      func: "addEventListener" | "mute" | "playVideo" | "pauseVideo" | "seekTo",
      args: Array<string | number | boolean> = [],
    ) => {
      const frame = bgPlayerRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "https://www.youtube.com",
      );
    },
    [],
  );

  useEffect(() => {
    setIsBackgroundVideoVisible(Boolean(activeBgVideoKey));
    setIsBackgroundVideoPlaying(false);
    setShouldLoadBackgroundVideo(false);
    if (!activeBgVideoKey) return;
    const timer = window.setTimeout(
      () => setShouldLoadBackgroundVideo(true),
      BACKGROUND_VIDEO_BOOT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activeBgVideoKey]);

  useEffect(() => {
    if (!backgroundTrailerEmbedUrl || !isBackgroundVideoVisible || !shouldLoadBackgroundVideo) {
      return;
    }
    const timer = window.setTimeout(() => {
      controlBackgroundPreview("addEventListener", ["onStateChange"]);
      controlBackgroundPreview("addEventListener", ["onError"]);
      controlBackgroundPreview("mute");
      controlBackgroundPreview("playVideo");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    backgroundTrailerEmbedUrl,
    controlBackgroundPreview,
    isBackgroundVideoVisible,
    shouldLoadBackgroundVideo,
  ]);

  useEffect(() => {
    if (
      !backgroundTrailerEmbedUrl ||
      !isBackgroundVideoVisible ||
      !shouldLoadBackgroundVideo ||
      isBackgroundVideoPlaying
    ) {
      return;
    }

    const fallbackTimeout = window.setTimeout(() => {
      setIsBackgroundVideoVisible(false);
    }, PREVIEW_AUTOPLAY_TIMEOUT_MS);

    return () => window.clearTimeout(fallbackTimeout);
  }, [
    backgroundTrailerEmbedUrl,
    isBackgroundVideoVisible,
    isBackgroundVideoPlaying,
    shouldLoadBackgroundVideo,
  ]);

  useEffect(() => {
    if (!activeBgVideoKey) return;

    const onPlayerMessage = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.youtube.com" &&
        event.origin !== "https://www.youtube-nocookie.com"
      ) {
        return;
      }

      let payload = event.data as unknown;
      if (typeof payload === "string") {
        if (!payload.startsWith("{")) return;
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (!payload || typeof payload !== "object") return;
      const message = payload as {
        event?: string;
        info?: number | string | { currentTime?: number };
      };

      if (message.event === "onStateChange") {
        const state = Number(message.info);
        if (state === 1) {
          setIsBackgroundVideoPlaying(true);
          setIsBackgroundVideoVisible(true);
        }
        if (state === 0) {
          controlBackgroundPreview("seekTo", [0, true]);
          controlBackgroundPreview("playVideo");
        }
      }

      if (
        message.event === "infoDelivery" &&
        message.info &&
        typeof message.info === "object" &&
        typeof message.info.currentTime === "number" &&
        message.info.currentTime > 0.5
      ) {
        setIsBackgroundVideoPlaying(true);
        setIsBackgroundVideoVisible(true);
      }

      if (message.event === "onError") {
        setIsBackgroundVideoVisible(false);
      }
    };

    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [activeBgVideoKey, controlBackgroundPreview]);

  useEffect(() => {
    if (!backgroundTrailerEmbedUrl || !isBackgroundVideoVisible || !shouldLoadBackgroundVideo) {
      return;
    }

    if (isTrailerModalOpen) {
      controlBackgroundPreview("pauseVideo");
      return;
    }

    const resumeTimeout = window.setTimeout(() => {
      controlBackgroundPreview("mute");
      controlBackgroundPreview("playVideo");
    }, 120);

    return () => window.clearTimeout(resumeTimeout);
  }, [
    backgroundTrailerEmbedUrl,
    controlBackgroundPreview,
    isBackgroundVideoVisible,
    shouldLoadBackgroundVideo,
    isTrailerModalOpen,
  ]);

  const openTrailerModal = () => {
    if (!trailerModalKey) return;
    setTrailerSessionId((prev) => prev + 1);
    setIsTrailerModalOpen(true);
  };

  if (movieLoading) {
    return (
      <div className="app-page">
        <Header />
        <div className="pt-20">
          <div className="h-[60vh] bg-muted animate-pulse" />
          <div className="container mx-auto px-4 -mt-32 relative z-10">
            <div className="flex gap-8">
              <div className="w-[300px] aspect-[2/3] bg-muted rounded-lg animate-pulse hidden md:block" />
              <div className="flex-1 space-y-4">
                <div className="h-8 bg-muted rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-muted rounded w-full animate-pulse" />
                <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (movieError || !movie) {
    return (
      <div className="app-page flex items-center justify-center px-4">
        <div className="empty-state max-w-md">
          <p className="text-xl text-muted-foreground mb-2">
            {movieError ? "Failed to load movie" : "Movie not found"}
          </p>
          {movieError && (
            <p className="text-sm text-muted-foreground mb-4">Check your connection and try again.</p>
          )}
          <Button onClick={() => navigate(-1)} className="bg-primary hover:bg-primary/90">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const watched = isWatched(movie.id, "movie");
  const bookmarked = isInWatchlist(movie.id, "movie");
  const year = movie.release_date?.split("-")[0] || "";
  const matchScore = movie.vote_average > 0 ? Math.round(movie.vote_average * 10) : null;
  const languageLabel = getLanguageLabel(movie.original_language);
  const releasedAt = formatReleaseDate(movie.release_date);
  const detailRows = [
    { label: "Status", value: movie.status || "N/A", icon: BadgeCheck },
    { label: "Released", value: releasedAt, icon: Calendar },
    { label: "Original Language", value: languageLabel, icon: Globe },
    { label: "Budget", value: formatMoney(movie.budget), icon: DollarSign },
    { label: "Revenue", value: formatMoney(movie.revenue), icon: CircleDollarSign },
  ];
  const heroVisualSrc = getBackdropUrl(movie.backdrop_path, "large");

  return (
    <div className="app-page pb-20 md:pb-0 overflow-x-hidden">
      <Header />

      {/* Backdrop with optional video */}
      <div
        ref={heroMediaRef}
        className="relative h-[54vh] sm:h-[60vh] md:h-[70vh] lg:h-[74vh] xl:h-[78vh] overflow-hidden group/hero"
      >
        <MediaImage
          src={heroVisualSrc}
          alt={`${movie.title} visual`}
          className="absolute inset-0 w-full h-full object-cover"
          fallbackSrc="/fallbacks/backdrop.svg"
          width={1280}
          height={720}
          sizes="100vw"
          priority
          fadeIn
        />
        {backgroundTrailerEmbedUrl && isBackgroundVideoVisible && shouldLoadBackgroundVideo && (
          <div className="absolute inset-0">
            <iframe
              key={activeBgVideoKey}
              ref={bgPlayerRef}
              src={backgroundTrailerEmbedUrl}
              title={`${movie.title} background trailer`}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                width: `${bgFrameSize.width}px`,
                height: `${bgFrameSize.height}px`,
                willChange: "transform",
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                controlBackgroundPreview("addEventListener", ["onStateChange"]);
                controlBackgroundPreview("addEventListener", ["onError"]);
                controlBackgroundPreview("mute");
                controlBackgroundPreview("playVideo");
              }}
              tabIndex={-1}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/55 to-background/10" />
        <div className="absolute inset-0 hero-gradient" />

        {trailerModalKey && (
          <div className="absolute inset-0 z-[7] hidden md:block pointer-events-none bg-black/0 opacity-0 transition-opacity duration-300 group-hover/hero:opacity-100 group-hover/hero:bg-black/45" />
        )}

        {trailerModalKey && (
          <div className="absolute inset-0 z-10 hidden md:flex items-center justify-center pointer-events-none">
            <Button
              type="button"
              size="icon"
              onClick={openTrailerModal}
              className="pointer-events-auto h-16 w-16 rounded-full bg-background/70 border border-white/20 text-foreground backdrop-blur-md opacity-0 group-hover/hero:opacity-100 transition-all duration-300 hover:bg-primary hover:text-primary-foreground"
              aria-label={`Play ${movie.title} trailer`}
            >
              <Play className="w-7 h-7 fill-current" />
            </Button>
          </div>
        )}

        {/* Back Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="absolute top-20 left-4 z-10 bg-background/50 backdrop-blur-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 -mt-48 md:-mt-64 relative z-10 pb-12">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="hidden md:block flex-shrink-0">
            <MediaImage
              src={getPosterUrl(movie.poster_path, "large")}
              alt={movie.title}
              className="w-[280px] rounded-lg border border-white/10 shadow-2xl shadow-black/45 lg:w-[320px]"
              fallbackSrc="/fallbacks/poster.svg"
              width={500}
              height={750}
              sizes="(min-width: 1024px) 320px, (min-width: 768px) 280px, 128px"
            />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            {/* Mobile Poster */}
            <div className="md:hidden flex gap-4 mb-6">
              <MediaImage
                src={getPosterUrl(movie.poster_path, "medium")}
                alt={movie.title}
                className="w-32 rounded-lg shadow-lg"
                fallbackSrc="/fallbacks/poster.svg"
                width={342}
                height={513}
                sizes="128px"
              />
              <div className="flex-1">
                <h1 className="text-2xl font-bold mb-2">{movie.title}</h1>
                {movie.tagline && (
                  <p className="text-muted-foreground italic text-sm">{movie.tagline}</p>
                )}
              </div>
            </div>

            {/* Desktop Title */}
            <div className="hidden md:block mb-6">
              <h1 className="text-4xl lg:text-5xl font-bold mb-3">{movie.title}</h1>
              {movie.tagline && (
                <p className="text-xl text-muted-foreground italic">{movie.tagline}</p>
              )}
            </div>

            {/* Meta Info */}
            <div className="mb-6">
              <div className="flex flex-wrap gap-2.5">
                {matchScore !== null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {matchScore}% Match
                  </span>
                )}

                {certification && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {certification}
                  </span>
                )}

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {year || "TBA"}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {movie.runtime > 0 ? formatRuntime(movie.runtime) : "N/A"}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Star className="h-3.5 w-3.5 text-primary fill-current" />
                  {movie.vote_average > 0
                    ? `${movie.vote_average.toFixed(1)} IMDb`
                    : "Not Rated"}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {languageLabel}
                </span>
              </div>

              <div className="mt-3 rounded-lg border border-border/60 bg-card/45 px-3 py-2.5">
                <dl className="space-y-2 text-sm">
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <dt className="text-muted-foreground">Director</dt>
                    <dd className="text-foreground/90 leading-relaxed">
                      {directors.length > 0 ? directors.join(", ") : "N/A"}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <dt className="text-muted-foreground">Writer</dt>
                    <dd className="text-foreground/90 leading-relaxed">
                      {writers.length > 0 ? writers.join(", ") : "N/A"}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <dt className="text-muted-foreground">Producer</dt>
                    <dd className="text-foreground/90 leading-relaxed">
                      {producers.length > 0 ? producers.join(", ") : "N/A"}
                    </dd>
                  </div>
                </dl>
              </div>

              {movie.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {movie.genres.map((genre) => (
                    <span
                      key={genre.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
                      {genre.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons - All using primary red color */}
            <div className="flex flex-wrap gap-3 mb-8">
              {trailerModalKey && (
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground action-btn"
                  onClick={openTrailerModal}
                >
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  Watch Trailer
                </Button>
              )}
              <Button
                size="lg"
                className={cn(
                  "action-btn",
                  watched
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-foreground hover:bg-primary/20 hover:text-primary",
                  watchAnimating && "animate-watched-pop"
                )}
                onClick={handleMarkWatched}
              >
                <Check className="w-5 h-5 mr-2" />
                {watched ? "Watched" : "Mark as Watched"}
              </Button>
              <ContentReactionButtons
                contentId={movie.id}
                contentType="movie"
                title={movie.title}
                posterPath={movie.poster_path}
                genres={movie.genres.map((genre) => genre.id)}
                language={movie.original_language}
              />
              <Button
                size="lg"
                className={cn(
                  "action-btn",
                  bookmarked
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-foreground hover:bg-primary/20 hover:text-primary",
                  bookmarkAnimating && "animate-heart-pop"
                )}
                onClick={handleToggleWatchlist}
              >
                <Bookmark className={cn("w-5 h-5 mr-2", bookmarked && "fill-current")} />
                {bookmarked ? "Watchlisted" : "Watchlist"}
              </Button>
            </div>

            <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                {/* Overview */}
                <h2 className="text-xl font-semibold mb-3">Overview</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {movie.overview || "No overview available."}
                </p>

                {/* Keywords */}
                {keywords.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Keywords
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((keyword) => (
                        <span
                          key={keyword.id}
                          className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-foreground/90"
                        >
                          {keyword.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side Panel */}
              <aside className="surface-panel h-fit p-4">
                <h3 className="text-lg font-semibold mb-4">Quick Facts</h3>
                <div className="space-y-3">
                  {detailRows.map((row) => (
                    <div key={row.label} className="grid grid-cols-[140px_1fr] items-start gap-3">
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <row.icon className="h-4 w-4" />
                        {row.label}
                      </p>
                      <p className="text-sm font-medium text-left text-foreground break-words">
                        {row.value}
                      </p>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            {/* Where to Watch */}
            <WhereToWatch providers={providers} link={watchLink} />

            {/* Cast */}
            <CastList cast={cast} title="Cast" />

            {/* Crew */}
            <CastList cast={crewAsCast} title="Crew" />
            <div ref={communitySectionRef} className="h-px" />
            {shouldRenderCommunity ? (
              <Suspense
                fallback={
                  <div className="mb-8 mt-4 rounded-xl border border-border/70 bg-card/35 p-4 animate-pulse">
                    <div className="h-5 w-44 rounded bg-muted" />
                    <div className="mt-3 h-4 w-72 rounded bg-muted" />
                    <div className="mt-6 h-28 rounded bg-muted" />
                  </div>
                }
              >
                <LazyCommentsSection
                  contentId={movie.id}
                  contentType="movie"
                  title={movie.title}
                  posterPath={movie.poster_path}
                  genres={movie.genres.map((genre) => genre.id)}
                  language={movie.original_language}
                />
              </Suspense>
            ) : (
              <div className="mb-8 mt-4 rounded-xl border border-border/70 bg-card/35 p-4 animate-pulse">
                <div className="h-5 w-44 rounded bg-muted" />
                <div className="mt-3 h-4 w-72 rounded bg-muted" />
                <div className="mt-6 h-28 rounded bg-muted" />
              </div>
            )}
          </div>
        </div>

        {/* Similar Movies */}
        {similarData && similarData.results.length > 0 && (
          <div className="mt-12">
            <MemoizedCarousel
              title="Similar Movies"
              items={similarData.results as Movie[]}
              isLoading={similarLoading}
              type="movie"
              viewAllHref="/movies"
            />
          </div>
        )}
      </div>

      <Dialog open={isTrailerModalOpen} onOpenChange={setIsTrailerModalOpen}>
        <DialogContent className="w-[96vw] max-w-5xl gap-0 border-0 bg-transparent p-0 text-white shadow-none sm:rounded-none [&>button]:hidden">
          <DialogTitle className="sr-only">{movie.title} trailer</DialogTitle>
          <DialogDescription className="sr-only">
            Trailer player with sound and playback controls.
          </DialogDescription>
          <div className="relative">
            <DialogClose asChild>
              <button
                type="button"
                className="absolute -top-3 -right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-primary/45 bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                aria-label="Close trailer"
              >
                <X className="h-5 w-5" />
              </button>
            </DialogClose>

            <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-primary/30 bg-black shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
              {modalTrailerEmbedUrl && (
                <iframe
                  key={`movie-trailer-${trailerSessionId}`}
                  src={modalTrailerEmbedUrl}
                  title={`${movie.title} trailer`}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
      <BottomNav />
    </div>
  );
}
