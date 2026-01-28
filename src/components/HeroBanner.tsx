import { useNavigate } from "react-router-dom";
import { Movie, getBackdropUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { Play, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroBannerProps {
  movie: Movie | undefined;
  isLoading: boolean;
  currentIndex: number;
  totalSlides: number;
  onDotClick: (index: number) => void;
}

export default function HeroBanner({
  movie,
  isLoading,
  currentIndex,
  totalSlides,
  onDotClick,
}: HeroBannerProps) {
  const navigate = useNavigate();

  if (isLoading || !movie) {
    return (
      <div className="relative h-[70vh] md:h-[85vh] bg-muted animate-pulse">
        <div className="absolute inset-0 hero-gradient" />
      </div>
    );
  }

  const year = movie.release_date?.split("-")[0] || "";

  return (
    <div className="relative h-[70vh] md:h-[85vh] overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{ backgroundImage: `url(${getBackdropUrl(movie.backdrop_path, "original")})` }}
      />

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 hero-gradient" />

      {/* Content */}
      <div className="absolute inset-0 flex items-center">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl animate-slide-up">
            {/* Language Badge */}
            <div className="flex items-center gap-2 mb-4">
              <span
                className={cn(
                  "px-2 py-1 rounded text-xs font-semibold",
                  movie.original_language === "hi" ? "badge-hindi" : "badge-english"
                )}
              >
                {movie.original_language === "hi" ? "🇮🇳 Hindi" : "🇺🇸 English"}
              </span>
              {year && (
                <span className="px-2 py-1 rounded bg-muted text-xs font-medium">
                  {year}
                </span>
              )}
              {movie.vote_average > 0 && (
                <span className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-semibold">
                  ⭐ {movie.vote_average.toFixed(1)}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight">
              {movie.title}
            </h1>

            {/* Overview */}
            <p className="text-muted-foreground text-sm md:text-base lg:text-lg mb-6 line-clamp-3 md:line-clamp-4">
              {movie.overview}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 glow-primary font-semibold"
                onClick={() => navigate(`/movie/${movie.id}`)}
              >
                <Play className="w-5 h-5 mr-2 fill-current" />
                Watch Trailer
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-foreground/30 hover:bg-foreground/10"
                onClick={() => navigate(`/movie/${movie.id}`)}
              >
                <Info className="w-5 h-5 mr-2" />
                More Info
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dots Navigation */}
      {totalSlides > 1 && (
        <div className="absolute bottom-24 md:bottom-32 left-1/2 -translate-x-1/2 flex gap-2">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <button
              key={index}
              onClick={() => onDotClick(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index === currentIndex
                  ? "w-8 bg-primary"
                  : "bg-foreground/30 hover:bg-foreground/50"
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
