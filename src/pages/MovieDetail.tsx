import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import {
  getMovieDetails,
  getMovieCredits,
  getMovieVideos,
  getSimilarMovies,
  getBackdropUrl,
  getPosterUrl,
  getProfileUrl,
  getYouTubeTrailerUrl,
  getLanguageLabel,
  MovieDetails,
  Cast,
  Video,
  Movie,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import ContentCarousel from "@/components/ContentCarousel";
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

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: userLoading, addToWatchHistory, isWatched, toggleLike, isLiked } = useUser();
  const [showTrailer, setShowTrailer] = useState(false);

  const movieId = Number(id);

  // Redirect if no user
  useEffect(() => {
    if (!userLoading && !user) {
      navigate("/");
    }
  }, [user, userLoading, navigate]);

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

  const cast = creditsData?.cast.slice(0, 10) || [];
  const trailerUrl = videosData ? getYouTubeTrailerUrl(videosData.results) : null;

  const handleMarkWatched = () => {
    if (!movie) return;
    addToWatchHistory({
      id: movie.id,
      type: "movie",
      title: movie.title,
      posterPath: movie.poster_path,
      genres: movie.genres.map((g) => g.id),
      language: movie.original_language,
    });
  };

  const handleToggleLike = () => {
    if (!movie) return;
    toggleLike({
      id: movie.id,
      type: "movie",
      title: movie.title,
      posterPath: movie.poster_path,
    });
  };

  const formatRuntime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (userLoading || movieLoading) {
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
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  const watched = isWatched(movie.id, "movie");
  const liked = isLiked(movie.id, "movie");
  const year = movie.release_date?.split("-")[0] || "";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />

      {/* Backdrop */}
      <div className="relative h-[50vh] md:h-[70vh]">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${getBackdropUrl(movie.backdrop_path, "original")})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
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
            <img
              src={getPosterUrl(movie.poster_path, "large")}
              alt={movie.title}
              className="w-[280px] lg:w-[320px] rounded-lg shadow-2xl"
            />
          </div>

          {/* Details */}
          <div className="flex-1">
            {/* Mobile Poster */}
            <div className="md:hidden flex gap-4 mb-6">
              <img
                src={getPosterUrl(movie.poster_path, "medium")}
                alt={movie.title}
                className="w-32 rounded-lg shadow-lg"
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
              <Badge
                className={cn(
                  movie.original_language === "hi" ? "badge-hindi" : "badge-english"
                )}
              >
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

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mb-8">
              {trailerUrl && (
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 glow-primary"
                  onClick={() => setShowTrailer(true)}
                >
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  Watch Trailer
                </Button>
              )}
              <Button
                size="lg"
                variant={watched ? "secondary" : "outline"}
                onClick={handleMarkWatched}
              >
                <Check className={cn("w-5 h-5 mr-2", watched && "text-green-500")} />
                {watched ? "Watched" : "Mark as Watched"}
              </Button>
              <Button
                size="lg"
                variant={liked ? "secondary" : "outline"}
                onClick={handleToggleLike}
              >
                <Heart className={cn("w-5 h-5 mr-2", liked && "fill-primary text-primary")} />
                {liked ? "Liked" : "Like"}
              </Button>
            </div>

            {/* Overview */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">Overview</h2>
              <p className="text-muted-foreground leading-relaxed">{movie.overview}</p>
            </div>

            {/* Cast */}
            {cast.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Top Cast</h2>
                <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                  {cast.map((actor) => (
                    <div key={actor.id} className="flex-shrink-0 text-center">
                      <img
                        src={getProfileUrl(actor.profile_path, "medium")}
                        alt={actor.name}
                        className="w-20 h-20 rounded-full object-cover mx-auto mb-2"
                      />
                      <p className="text-sm font-medium line-clamp-1 w-20">{actor.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1 w-20">
                        {actor.character}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Similar Movies */}
        {similarData && similarData.results.length > 0 && (
          <div className="mt-12">
            <ContentCarousel
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
