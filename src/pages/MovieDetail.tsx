import { useEffect, useState, memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MemoizedCarousel = memo(ContentCarousel);

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { addToWatchHistory, isWatched, toggleLike, isLiked } = useUserData();
  const [showTrailer, setShowTrailer] = useState(false);
  const [watchAnimating, setWatchAnimating] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);

  const movieId = Number(id);

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

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

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0 overflow-x-hidden">
      <Header />

      {/* Backdrop with optional video */}
      <div className="relative h-[50vh] md:h-[70vh] overflow-hidden">
        <MediaImage
          src={getBackdropUrl(movie.backdrop_path, "original")}
          alt={`${movie.title} backdrop`}
          className="absolute inset-0 w-full h-full object-cover"
          fallbackSrc="/fallbacks/backdrop.svg"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/25" />
        <div className="absolute inset-0 hero-gradient" />

        {/* Back Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
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
                  onClick={() => setShowTrailer(true)}
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
            />
          </div>
        )}
      </div>

      {/* Trailer Modal */}
      {showTrailer && trailerUrl && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-5xl aspect-video">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowTrailer(false)}
              className="absolute -top-12 right-0 text-foreground"
            >
              <X className="w-6 h-6" />
            </Button>
            <iframe
              src={`${trailerUrl}?autoplay=1`}
              title={`${movie.title} Trailer`}
              className="w-full h-full rounded-lg"
              allowFullScreen
              allow="autoplay; encrypted-media"
            />
          </div>
        </div>
      )}

      <Footer />
      <BottomNav />
    </div>
  );
}
