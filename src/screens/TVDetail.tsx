import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserData } from "@/hooks/useUserData";
import {
  getTVShowDetails,
  getTVShowCredits,
  getTVShowVideos,
  getTVShowKeywords,
  getSimilarTVShows,
  getTVSeasonDetails,
  getTVWatchProviders,
  getBackdropUrl,
  getPosterUrl,
  getStillUrl,
  getYouTubeTrailerUrl,
  getLanguageLabel,
  Cast,
  CrewMember,
  MovieKeyword,
  TVShow,
  Episode,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import ContentCarousel from "@/components/ContentCarousel";
import WhereToWatch from "@/components/WhereToWatch";
import CastList from "@/components/CastList";
import MediaImage from "@/components/MediaImage";
import FeedbackButtons from "@/components/FeedbackButtons";
import CommentsSection from "@/components/CommentsSection";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Play,
  Heart,
  Check,
  Star,
  Calendar,
  Globe,
  Tv,
  Clock,
  Users,
  TrendingUp,
  Tag,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MemoizedCarousel = memo(ContentCarousel);
const PREVIEW_AUTOPLAY_TIMEOUT_MS = 12000;

export default function TVDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { addToWatchHistory, isWatched, toggleLike, isLiked } = useUserData();
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);
  const [watchAnimating, setWatchAnimating] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);
  const [trailerSessionId, setTrailerSessionId] = useState(0);
  const [isBackgroundVideoVisible, setIsBackgroundVideoVisible] = useState(true);
  const [isBackgroundVideoPlaying, setIsBackgroundVideoPlaying] = useState(false);
  const [bgFrameSize, setBgFrameSize] = useState({ width: 1920, height: 1080 });
  const heroMediaRef = useRef<HTMLDivElement>(null);
  const bgPlayerRef = useRef<HTMLIFrameElement>(null);

  const tvId = Number(id);

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

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
  }, [tvId]);

  // Fetch TV show details
  const { data: tvShow, isLoading: tvLoading } = useQuery({
    queryKey: ["tv", tvId],
    queryFn: () => getTVShowDetails(tvId),
    enabled: !!tvId,
  });

  // Fetch credits
  const { data: creditsData } = useQuery({
    queryKey: ["tv-credits", tvId],
    queryFn: () => getTVShowCredits(tvId),
    enabled: !!tvId,
  });

  // Fetch videos
  const { data: videosData } = useQuery({
    queryKey: ["tv-videos", tvId],
    queryFn: () => getTVShowVideos(tvId),
    enabled: !!tvId,
  });

  // Fetch similar TV shows
  const { data: similarData, isLoading: similarLoading } = useQuery({
    queryKey: ["similar-tv", tvId],
    queryFn: () => getSimilarTVShows(tvId),
    enabled: !!tvId,
  });

  // Fetch season details
  const { data: seasonData, isLoading: seasonLoading } = useQuery({
    queryKey: ["tv-season", tvId, selectedSeason],
    queryFn: () => getTVSeasonDetails(tvId, selectedSeason),
    enabled: !!tvId && selectedSeason > 0,
  });

  // Fetch watch providers
  const { data: watchProvidersData } = useQuery({
    queryKey: ["tv-watch-providers", tvId],
    queryFn: () => getTVWatchProviders(tvId),
    enabled: !!tvId,
  });

  const { data: keywords = [] } = useQuery<MovieKeyword[]>({
    queryKey: ["tv-keywords", tvId],
    queryFn: () => getTVShowKeywords(tvId),
    enabled: !!tvId,
    staleTime: 1000 * 60 * 30,
  });

  // Update selected season when TV show loads
  useEffect(() => {
    if (tvShow?.seasons) {
      const firstRealSeason = tvShow.seasons.find((s) => s.season_number > 0);
      if (firstRealSeason) {
        setSelectedSeason(firstRealSeason.season_number);
      }
    }
  }, [tvShow]);

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

  const pickUniqueNames = (members: CrewMember[]) =>
    Array.from(new Set(members.map((member) => member.name)));

  const creators = useMemo(() => {
    const createdBy = (tvShow?.created_by || []).map((member) => member.name).filter(Boolean);
    if (createdBy.length > 0) return Array.from(new Set(createdBy)).slice(0, 3);
    return pickUniqueNames(crew.filter((member) => member.job === "Creator")).slice(0, 3);
  }, [crew, tvShow]);
  const writers = useMemo(
    () =>
      pickUniqueNames(
        crew.filter((member) =>
          [
            "Writer",
            "Screenplay",
            "Story",
            "Novel",
            "Teleplay",
            "Script Editor",
          ].includes(member.job),
        ),
      ).slice(0, 4),
    [crew],
  );
  const producers = useMemo(
    () =>
      pickUniqueNames(
        crew.filter((member) =>
          ["Producer", "Executive Producer", "Co-Executive Producer"].includes(member.job),
        ),
      ).slice(0, 4),
    [crew],
  );
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
  }, [tvId]);

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

  // Filter out "Specials" (season 0) from seasons list
  const seasons = tvShow?.seasons?.filter((s) => s.season_number > 0) || [];

  // Get providers for IN (India) or US as fallback
  const providers = watchProvidersData?.results?.IN || watchProvidersData?.results?.US || null;
  const watchLink = providers?.link;

  const handleMarkWatched = async () => {
    if (!tvShow) return;
    setWatchAnimating(true);
    setTimeout(() => setWatchAnimating(false), 420);
    await addToWatchHistory({
      content_id: tvShow.id,
      content_type: "tv",
      title: tvShow.name,
      poster_path: tvShow.poster_path,
      genres: tvShow.genres.map((g) => g.id),
      language: tvShow.original_language,
    });
  };

  const handleToggleLike = async () => {
    if (!tvShow) return;
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 420);
    await toggleLike({
      content_id: tvShow.id,
      content_type: "tv",
      title: tvShow.name,
      poster_path: tvShow.poster_path,
    });
  };

  const formatRuntime = (minutes: number | null): string => {
    if (!minutes) return "";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatFirstAirDate = (date: string): string => {
    if (!date) return "N/A";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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
        "*",
      );
    },
    [],
  );

  useEffect(() => {
    setIsBackgroundVideoVisible(Boolean(activeBgVideoKey));
    setIsBackgroundVideoPlaying(false);
  }, [activeBgVideoKey]);

  useEffect(() => {
    if (!backgroundTrailerEmbedUrl || !isBackgroundVideoVisible) return;
    const timer = window.setTimeout(() => {
      controlBackgroundPreview("addEventListener", ["onStateChange"]);
      controlBackgroundPreview("addEventListener", ["onError"]);
      controlBackgroundPreview("mute");
      controlBackgroundPreview("playVideo");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [backgroundTrailerEmbedUrl, controlBackgroundPreview, isBackgroundVideoVisible]);

  useEffect(() => {
    if (!backgroundTrailerEmbedUrl || !isBackgroundVideoVisible || isBackgroundVideoPlaying) {
      return;
    }

    const fallbackTimeout = window.setTimeout(() => {
      setIsBackgroundVideoVisible(false);
    }, PREVIEW_AUTOPLAY_TIMEOUT_MS);

    return () => window.clearTimeout(fallbackTimeout);
  }, [backgroundTrailerEmbedUrl, isBackgroundVideoVisible, isBackgroundVideoPlaying]);

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
    if (!backgroundTrailerEmbedUrl || !isBackgroundVideoVisible) return;

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
    isTrailerModalOpen,
  ]);

  const openTrailerModal = () => {
    if (!trailerModalKey) return;
    setTrailerSessionId((prev) => prev + 1);
    setIsTrailerModalOpen(true);
  };

  if (authLoading || tvLoading) {
    return (
      <div className="min-h-screen bg-background">
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

  if (!tvShow) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-muted-foreground mb-4">TV Show not found</p>
          <Button onClick={() => navigate(-1)} className="bg-primary hover:bg-primary/90">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const watched = isWatched(tvShow.id, "tv");
  const liked = isLiked(tvShow.id, "tv");
  const year = tvShow.first_air_date?.split("-")[0] || "";
  const matchScore = tvShow.vote_average > 0 ? Math.round(tvShow.vote_average * 10) : null;
  const languageLabel = getLanguageLabel(tvShow.original_language);
  const firstAired = formatFirstAirDate(tvShow.first_air_date);
  const averageRuntime = tvShow.episode_run_time?.[0] ?? null;
  const runtimeLabel = averageRuntime ? formatRuntime(averageRuntime) : "N/A";
  const detailRows = [
    { label: "Status", value: tvShow.status || "N/A", icon: BadgeCheck },
    { label: "First Aired", value: firstAired, icon: Calendar },
    { label: "Type", value: tvShow.type || "N/A", icon: Tv },
    {
      label: "Total Seasons",
      value: tvShow.number_of_seasons > 0 ? String(tvShow.number_of_seasons) : "N/A",
      icon: Tv,
    },
    {
      label: "Total Episodes",
      value: tvShow.number_of_episodes > 0 ? String(tvShow.number_of_episodes) : "N/A",
      icon: Tv,
    },
    { label: "Avg Runtime", value: runtimeLabel, icon: Clock },
    { label: "Original Language", value: languageLabel, icon: Globe },
  ];
  const statsRows = [
    {
      label: "TMDB Rating",
      value: tvShow.vote_average > 0 ? `${tvShow.vote_average.toFixed(1)} / 10` : "N/A",
      icon: Star,
    },
    {
      label: "Votes",
      value: tvShow.vote_count > 0 ? tvShow.vote_count.toLocaleString("en-US") : "N/A",
      icon: Users,
    },
    {
      label: "Popularity",
      value: tvShow.popularity > 0 ? tvShow.popularity.toFixed(0) : "N/A",
      icon: TrendingUp,
    },
    {
      label: "Match Score",
      value: matchScore !== null ? `${matchScore}% Match` : "N/A",
      icon: BadgeCheck,
    },
  ];
  const heroVisualSrc = getBackdropUrl(tvShow.backdrop_path, "original");

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 overflow-x-hidden">
      <Header />

      {/* Backdrop */}
      <div
        ref={heroMediaRef}
        className="relative h-[54vh] sm:h-[60vh] md:h-[70vh] lg:h-[74vh] xl:h-[78vh] overflow-hidden group/hero"
      >
        <MediaImage
          src={heroVisualSrc}
          alt={`${tvShow.name} visual`}
          className="absolute inset-0 w-full h-full object-cover"
          fallbackSrc="/fallbacks/backdrop.svg"
          fadeIn
        />
        {backgroundTrailerEmbedUrl && isBackgroundVideoVisible && (
          <div className="absolute inset-0">
            <iframe
              key={activeBgVideoKey}
              ref={bgPlayerRef}
              src={backgroundTrailerEmbedUrl}
              title={`${tvShow.name} background trailer`}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                width: `${bgFrameSize.width}px`,
                height: `${bgFrameSize.height}px`,
                willChange: "transform",
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              loading="eager"
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
              aria-label={`Play ${tvShow.name} trailer`}
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
              src={getPosterUrl(tvShow.poster_path, "large")}
              alt={tvShow.name}
              className="w-[280px] lg:w-[320px] rounded-lg shadow-2xl"
              fallbackSrc="/fallbacks/poster.svg"
            />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            {/* Mobile Poster */}
            <div className="md:hidden flex gap-4 mb-6">
              <MediaImage
                src={getPosterUrl(tvShow.poster_path, "medium")}
                alt={tvShow.name}
                className="w-32 rounded-lg shadow-lg"
                fallbackSrc="/fallbacks/poster.svg"
              />
              <div className="flex-1">
                <h1 className="text-2xl font-bold mb-2">{tvShow.name}</h1>
                {tvShow.tagline && (
                  <p className="text-muted-foreground italic text-sm">{tvShow.tagline}</p>
                )}
              </div>
            </div>

            {/* Desktop Title */}
            <div className="hidden md:block mb-6">
              <h1 className="text-4xl lg:text-5xl font-bold mb-3">{tvShow.name}</h1>
              {tvShow.tagline && (
                <p className="text-xl text-muted-foreground italic">{tvShow.tagline}</p>
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

                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {tvShow.status || "Status Unknown"}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {year || "TBA"}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {runtimeLabel}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Star className="h-3.5 w-3.5 text-primary fill-current" />
                  {tvShow.vote_average > 0
                    ? `${tvShow.vote_average.toFixed(1)} IMDb`
                    : "Not Rated"}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Tv className="h-3.5 w-3.5 text-muted-foreground" />
                  {tvShow.number_of_seasons > 0
                    ? `${tvShow.number_of_seasons} Season${tvShow.number_of_seasons !== 1 ? "s" : ""}`
                    : "Season N/A"}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {languageLabel}
                </span>
              </div>

              <div className="mt-3 rounded-lg border border-border/60 bg-card/45 px-3 py-2.5">
                <dl className="space-y-2 text-sm">
                  <div className="grid grid-cols-[98px_1fr] items-start gap-2">
                    <dt className="text-muted-foreground">Created By</dt>
                    <dd className="text-foreground/90 leading-relaxed">
                      {creators.length > 0 ? creators.join(", ") : "N/A"}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[98px_1fr] items-start gap-2">
                    <dt className="text-muted-foreground">Writer</dt>
                    <dd className="text-foreground/90 leading-relaxed">
                      {writers.length > 0 ? writers.join(", ") : "N/A"}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[98px_1fr] items-start gap-2">
                    <dt className="text-muted-foreground">Producer</dt>
                    <dd className="text-foreground/90 leading-relaxed">
                      {producers.length > 0 ? producers.join(", ") : "N/A"}
                    </dd>
                  </div>
                </dl>
              </div>

              {tvShow.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tvShow.genres.map((genre) => (
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
              <Button
                size="lg"
                className={cn(
                  "action-btn",
                  liked
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-foreground hover:bg-primary/20 hover:text-primary",
                  likeAnimating && "animate-heart-pop"
                )}
                onClick={handleToggleLike}
              >
                <Heart className={cn("w-5 h-5 mr-2", liked && "fill-current")} />
                {liked ? "Liked" : "Like"}
              </Button>
            </div>

            <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                {/* Overview */}
                <h2 className="text-xl font-semibold mb-3">Overview</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {tvShow.overview || "No overview available."}
                </p>

                {/* Stats */}
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">Stats</h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {statsRows.map((row) => (
                      <div
                        key={row.label}
                        className="rounded-lg border border-border/60 bg-card/45 px-3 py-2.5"
                      >
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <row.icon className="h-3.5 w-3.5" />
                          {row.label}
                        </p>
                        <p className="mt-1 text-sm font-medium text-foreground break-words">
                          {row.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

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
              <aside className="h-fit rounded-xl border border-border/70 bg-card/55 p-4 backdrop-blur-sm">
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

            <FeedbackButtons
              contentId={tvShow.id}
              contentType="tv"
              title={tvShow.name}
              posterPath={tvShow.poster_path}
              genres={tvShow.genres.map((genre) => genre.id)}
              language={tvShow.original_language}
            />
            <CommentsSection contentId={tvShow.id} contentType="tv" />
          </div>
        </div>

        {/* Episodes Section */}
        {seasons.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">📺 Episodes</h2>
            
            {/* Season Tabs */}
            <Tabs
              value={String(selectedSeason)}
              onValueChange={(value) => setSelectedSeason(Number(value))}
            >
              <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-6">
                <TabsList className="bg-muted inline-flex w-auto">
                  {seasons.map((season) => (
                    <TabsTrigger key={season.season_number} value={String(season.season_number)}>
                      Season {season.season_number}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {seasons.map((season) => (
                <TabsContent key={season.season_number} value={String(season.season_number)}>
                  {seasonLoading && selectedSeason === season.season_number ? (
                    <div className="space-y-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-card rounded-lg p-4 animate-pulse">
                          <div className="flex gap-4">
                            <div className="w-32 h-20 bg-muted rounded" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 bg-muted rounded w-1/2" />
                              <div className="h-3 bg-muted rounded w-full" />
                              <div className="h-3 bg-muted rounded w-3/4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {seasonData?.episodes?.map((episode: Episode) => (
                        <div
                          key={episode.id}
                          className="bg-card rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
                        >
                          <div
                            className="flex gap-4 p-4 cursor-pointer"
                            onClick={() =>
                              setExpandedEpisode(
                                expandedEpisode === episode.id ? null : episode.id
                              )
                            }
                          >
                            {/* Episode Thumbnail */}
                            <div className="relative flex-shrink-0">
                              <MediaImage
                                src={getStillUrl(episode.still_path)}
                                alt={episode.name}
                                className="w-32 sm:w-40 h-20 sm:h-24 object-cover rounded"
                                loading="lazy"
                                fallbackSrc="/fallbacks/still.svg"
                              />
                              {episode.runtime && (
                                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-background/80 rounded text-xs flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatRuntime(episode.runtime)}
                                </div>
                              )}
                            </div>

                            {/* Episode Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-medium text-sm sm:text-base">
                                    E{episode.episode_number}. {episode.name}
                                  </h3>
                                  {episode.air_date && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {new Date(episode.air_date).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {episode.vote_average > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Star className="w-3 h-3 fill-accent text-accent" />
                                      {episode.vote_average.toFixed(1)}
                                    </div>
                                  )}
                                  {expandedEpisode === episode.id ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                              <p className="text-xs sm:text-sm text-muted-foreground mt-2 line-clamp-2">
                                {episode.overview || "No description available."}
                              </p>
                            </div>
                          </div>

                          {/* Expanded Overview */}
                          {expandedEpisode === episode.id && episode.overview && (
                            <div className="px-4 pb-4 pt-0">
                              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                                {episode.overview}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        {/* Similar TV Shows */}
        {similarData && similarData.results.length > 0 && (
          <div className="mt-12">
            <MemoizedCarousel
              title="Similar TV Shows"
              items={similarData.results as TVShow[]}
              isLoading={similarLoading}
              type="tv"
              viewAllHref="/series"
            />
          </div>
        )}
      </div>

      <Dialog open={isTrailerModalOpen} onOpenChange={setIsTrailerModalOpen}>
        <DialogContent className="w-[96vw] max-w-5xl gap-0 border-0 bg-transparent p-0 text-white shadow-none sm:rounded-none [&>button]:hidden">
          <DialogTitle className="sr-only">{tvShow.name} trailer</DialogTitle>
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
                  key={`tv-trailer-${trailerSessionId}`}
                  src={modalTrailerEmbedUrl}
                  title={`${tvShow.name} trailer`}
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
