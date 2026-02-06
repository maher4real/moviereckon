import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserData } from "@/hooks/useUserData";
import {
  getMovieDetails,
  getMovieCredits,
  getMovieVideos,
  getSimilarMovies,
  getMovieWatchProviders,
  getBackdropUrl,
  getPosterUrl,
  getYouTubeTrailerUrl,
  getLanguageLabel,
  getLanguageBadgeClass,
  Movie,
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
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Heart,
  Check,
  Clock,
  Star,
  Calendar,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MemoizedCarousel = memo(ContentCarousel);

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { addToWatchHistory, isWatched, toggleLike, isLiked } = useUserData();
  const [watchAnimating, setWatchAnimating] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [bgVideoIndex, setBgVideoIndex] = useState(0);
  const [bgFrameSize, setBgFrameSize] = useState({ width: 0, height: 0 });
  const heroMediaRef = useRef<HTMLDivElement>(null);
  const bgPlayerRef = useRef<HTMLIFrameElement>(null);

  const movieId = Number(id);

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
  }, [movieId]);

  // Fetch movie details
  const { data: movie, isLoading: movieLoading } = useQuery({
    queryKey: ["movie", movieId],
    queryFn: () => getMovieDetails(movieId),
    enabled: !!movieId,
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

  const cast = creditsData?.cast.slice(0, 12) || [];
  const trailerUrl = videosData ? getYouTubeTrailerUrl(videosData.results) : null;
  const preferredTrailerKey = trailerUrl?.split("/embed/")[1]?.split("?")[0] || null;
  const trailerWatchUrl = useMemo(() => {
    if (!trailerUrl) return null;
    const embedKey = trailerUrl.split("/embed/")[1]?.split("?")[0];
    return embedKey ? `https://www.youtube.com/watch?v=${embedKey}` : trailerUrl;
  }, [trailerUrl]);
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
  const activeBgVideoKey = backgroundTrailerKeys[bgVideoIndex];
  const youtubeOrigin = useMemo(
    () =>
      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "",
    [],
  );

  useEffect(() => {
    setBgVideoIndex(0);
  }, [movieId, backgroundTrailerKeys.length]);

  useEffect(() => {
    if (backgroundTrailerKeys.length <= 1) return;
    const intervalId = window.setInterval(() => {
      setBgVideoIndex((prev) => (prev + 1) % backgroundTrailerKeys.length);
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [backgroundTrailerKeys]);

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

      // Slight overscan prevents micro letterboxing across devices.
      setBgFrameSize({ width: Math.ceil(width * 1.08), height: Math.ceil(height * 1.08) });
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

  const handleToggleLike = async () => {
    if (!movie) return;
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 420);
    await toggleLike({
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

  if (authLoading || movieLoading) {
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

  if (!movie) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-muted-foreground mb-4">Movie not found</p>
          <Button onClick={() => navigate(-1)} className="bg-primary hover:bg-primary/90">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const watched = isWatched(movie.id, "movie");
  const liked = isLiked(movie.id, "movie");
  const year = movie.release_date?.split("-")[0] || "";
  const heroVisualSrc =
    backgroundTrailerKeys.length > 0
      ? getBackdropUrl(movie.backdrop_path, "original")
      : getPosterUrl(movie.poster_path, "large");
  const backgroundTrailerEmbedUrl = activeBgVideoKey
    ? `https://www.youtube.com/embed/${activeBgVideoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${activeBgVideoKey}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1${youtubeOrigin ? `&origin=${youtubeOrigin}` : ""}`
    : null;
  const openTrailerOnYouTube = () => {
    if (!trailerWatchUrl) return;
    window.open(trailerWatchUrl, "_blank", "noopener,noreferrer");
  };
  const controlBackgroundPreview = useCallback(
    (func: "mute" | "playVideo") => {
      const frame = bgPlayerRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args: [] }),
        "*",
      );
    },
    [],
  );

  useEffect(() => {
    if (!backgroundTrailerEmbedUrl) return;
    const timer = window.setTimeout(() => {
      controlBackgroundPreview("mute");
      controlBackgroundPreview("playVideo");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [backgroundTrailerEmbedUrl, activeBgVideoKey, controlBackgroundPreview]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 overflow-x-hidden">
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
          fallbackSrc="/fallbacks/poster.svg"
        />
        {backgroundTrailerEmbedUrl && (
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
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                controlBackgroundPreview("mute");
                controlBackgroundPreview("playVideo");
              }}
              tabIndex={-1}
            />
          </div>
        )}
        {activeBgVideoKey && (
          <div className="absolute inset-x-0 bottom-0 h-3 bg-background/85 pointer-events-none z-[3]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/25" />
        <div className="absolute inset-0 hero-gradient" />

        {trailerUrl && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <Button
              type="button"
              size="icon"
              onClick={openTrailerOnYouTube}
              className="pointer-events-auto h-16 w-16 rounded-full bg-background/70 border border-white/20 text-foreground backdrop-blur-md opacity-0 group-hover/hero:opacity-100 transition-all duration-300 hover:bg-primary hover:text-primary-foreground"
              aria-label="Play trailer on YouTube"
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
              className="w-[280px] lg:w-[320px] rounded-lg shadow-2xl"
              fallbackSrc="/fallbacks/poster.svg"
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
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Badge className={getLanguageBadgeClass(movie.original_language)}>
                <Globe className="w-3 h-3 mr-1" />
                {getLanguageLabel(movie.original_language)}
              </Badge>
              {year && (
                <Badge variant="outline">
                  <Calendar className="w-3 h-3 mr-1" />
                  {year}
                </Badge>
              )}
              {movie.runtime > 0 && (
                <Badge variant="outline">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatRuntime(movie.runtime)}
                </Badge>
              )}
              {movie.vote_average > 0 && (
                <Badge variant="secondary" className="bg-primary/20 text-primary">
                  <Star className="w-3 h-3 mr-1 fill-current" />
                  {movie.vote_average.toFixed(1)} / 10
                </Badge>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2 mb-6">
              {movie.genres.map((genre) => (
                <Badge key={genre.id} variant="secondary">
                  {genre.name}
                </Badge>
              ))}
            </div>

            {/* Action Buttons - All using primary red color */}
            <div className="flex flex-wrap gap-3 mb-8">
              {trailerUrl && (
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground action-btn"
                  onClick={openTrailerOnYouTube}
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

            <FeedbackButtons
              contentId={movie.id}
              contentType="movie"
              title={movie.title}
              posterPath={movie.poster_path}
              genres={movie.genres.map((genre) => genre.id)}
              language={movie.original_language}
            />

            {/* Overview */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">Overview</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {movie.overview || "No overview available."}
              </p>
            </div>

            {/* Where to Watch */}
            <WhereToWatch providers={providers} link={watchLink} />

            {/* Cast */}
            <CastList cast={cast} />
            <CommentsSection contentId={movie.id} contentType="movie" />
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

      <Footer />
      <BottomNav />
    </div>
  );
}
