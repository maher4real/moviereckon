import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import {
  getTVShowDetails,
  getTVShowCredits,
  getTVShowVideos,
  getSimilarTVShows,
  getBackdropUrl,
  getPosterUrl,
  getProfileUrl,
  getYouTubeTrailerUrl,
  getLanguageLabel,
  TVShowDetails,
  TVShow,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ContentCarousel from "@/components/ContentCarousel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Heart,
  Check,
  Star,
  Calendar,
  Globe,
  Tv,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function TVDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: userLoading, addToWatchHistory, isWatched, toggleLike, isLiked } = useUser();
  const [showTrailer, setShowTrailer] = useState(false);

  const tvId = Number(id);

  // Redirect if no user
  useEffect(() => {
    if (!userLoading && !user) {
      navigate("/");
    }
  }, [user, userLoading, navigate]);

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

  const cast = creditsData?.cast.slice(0, 10) || [];
  const trailerUrl = videosData ? getYouTubeTrailerUrl(videosData.results) : null;

  const handleMarkWatched = () => {
    if (!tvShow) return;
    addToWatchHistory({
      id: tvShow.id,
      type: "tv",
      title: tvShow.name,
      posterPath: tvShow.poster_path,
      genres: tvShow.genres.map((g) => g.id),
      language: tvShow.original_language,
    });
  };

  const handleToggleLike = () => {
    if (!tvShow) return;
    toggleLike({
      id: tvShow.id,
      type: "tv",
      title: tvShow.name,
      posterPath: tvShow.poster_path,
    });
  };

  if (userLoading || tvLoading) {
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
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  const watched = isWatched(tvShow.id, "tv");
  const liked = isLiked(tvShow.id, "tv");
  const year = tvShow.first_air_date?.split("-")[0] || "";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Backdrop */}
      <div className="relative h-[50vh] md:h-[70vh]">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${getBackdropUrl(tvShow.backdrop_path, "original")})` }}
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
              src={getPosterUrl(tvShow.poster_path, "large")}
              alt={tvShow.name}
              className="w-[280px] lg:w-[320px] rounded-lg shadow-2xl"
            />
          </div>

          {/* Details */}
          <div className="flex-1">
            {/* Mobile Poster */}
            <div className="md:hidden flex gap-4 mb-6">
              <img
                src={getPosterUrl(tvShow.poster_path, "medium")}
                alt={tvShow.name}
                className="w-32 rounded-lg shadow-lg"
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
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Badge
                className={cn(
                  tvShow.original_language === "hi" ? "badge-hindi" : "badge-english"
                )}
              >
                <Globe className="w-3 h-3 mr-1" />
                {getLanguageLabel(tvShow.original_language)}
              </Badge>
              {year && (
                <Badge variant="outline">
                  <Calendar className="w-3 h-3 mr-1" />
                  {year}
                </Badge>
              )}
              <Badge variant="outline">
                <Tv className="w-3 h-3 mr-1" />
                {tvShow.number_of_seasons} Season{tvShow.number_of_seasons !== 1 ? "s" : ""}
              </Badge>
              {tvShow.vote_average > 0 && (
                <Badge variant="secondary" className="bg-primary/20 text-primary">
                  <Star className="w-3 h-3 mr-1 fill-current" />
                  {tvShow.vote_average.toFixed(1)} / 10
                </Badge>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2 mb-6">
              {tvShow.genres.map((genre) => (
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
              <p className="text-muted-foreground leading-relaxed">{tvShow.overview}</p>
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

        {/* Similar TV Shows */}
        {similarData && similarData.results.length > 0 && (
          <div className="mt-12">
            <ContentCarousel
              title="Similar TV Shows"
              items={similarData.results as TVShow[]}
              isLoading={similarLoading}
              type="tv"
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
              title={`${tvShow.name} Trailer`}
              className="w-full h-full rounded-lg"
              allowFullScreen
              allow="autoplay; encrypted-media"
            />
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
