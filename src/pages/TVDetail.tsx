import { useEffect, useState, memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserData } from "@/hooks/useUserData";
import {
  getTVShowDetails,
  getTVShowCredits,
  getTVShowVideos,
  getSimilarTVShows,
  getTVSeasonDetails,
  getTVWatchProviders,
  getBackdropUrl,
  getPosterUrl,
  getStillUrl,
  getYouTubeTrailerUrl,
  getLanguageLabel,
  getLanguageBadgeClass,
  TVShow,
  Episode,
} from "@/lib/tmdb";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import ContentCarousel from "@/components/ContentCarousel";
import WhereToWatch from "@/components/WhereToWatch";
import CastList from "@/components/CastList";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MemoizedCarousel = memo(ContentCarousel);

export default function TVDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { addToWatchHistory, isWatched, toggleLike, isLiked } = useUserData();
  const [showTrailer, setShowTrailer] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);

  const tvId = Number(id);

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

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

  // Update selected season when TV show loads
  useEffect(() => {
    if (tvShow?.seasons) {
      const firstRealSeason = tvShow.seasons.find((s) => s.season_number > 0);
      if (firstRealSeason) {
        setSelectedSeason(firstRealSeason.season_number);
      }
    }
  }, [tvShow]);

  const cast = creditsData?.cast.slice(0, 12) || [];
  const trailerUrl = videosData ? getYouTubeTrailerUrl(videosData.results) : null;
  
  // Filter out "Specials" (season 0) from seasons list
  const seasons = tvShow?.seasons?.filter((s) => s.season_number > 0) || [];

  // Get providers for IN (India) or US as fallback
  const providers = watchProvidersData?.results?.IN || watchProvidersData?.results?.US || null;
  const watchLink = providers?.link;

  const handleMarkWatched = async () => {
    if (!tvShow) return;
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

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
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
              <Badge className={getLanguageBadgeClass(tvShow.original_language)}>
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

            {/* Action Buttons - Red Primary */}
            <div className="flex flex-wrap gap-3 mb-8">
              {trailerUrl && (
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
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

            {/* Where to Watch */}
            <WhereToWatch providers={providers} link={watchLink} />

            {/* Cast */}
            <CastList cast={cast} />
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
                              <img
                                src={getStillUrl(episode.still_path)}
                                alt={episode.name}
                                className="w-32 sm:w-40 h-20 sm:h-24 object-cover rounded"
                                loading="lazy"
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
      <BottomNav />
    </div>
  );
}
