import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Movie, getBackdropUrl, getLanguageBadgeClass, getLanguageLabel } from "@/shared/lib/tmdb";
import { Button } from "@/frontend/components/ui/button";
import { Play, Info, Star } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import MediaImage from "@/frontend/components/MediaImage";

interface HeroBannerProps {
  movie: Movie | undefined;
  isLoading: boolean;
  currentIndex: number;
  totalSlides: number;
  onDotClick: (index: number) => void;
  onBackdropReady?: () => void;
}

export default function HeroBanner({
  movie,
  isLoading,
  currentIndex,
  totalSlides,
  onDotClick,
  onBackdropReady,
}: HeroBannerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = `${location.pathname}${location.search}${location.hash}`;

  if (isLoading || !movie) {
    return (
      <div className="relative h-[70vh] md:h-[85vh] bg-muted animate-pulse overflow-hidden">
        <div className="absolute inset-0 hero-gradient" />
        <div className="hero-bottom-blend" />
      </div>
    );
  }

  const year = movie.release_date?.split("-")[0] || "";

  return (
    <div className="relative h-[70vh] md:h-[85vh] overflow-hidden">
      {/* Background Image */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`hero-backdrop-${movie.id}`}
          initial={{ opacity: 0, scale: 1.035 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.015 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <MediaImage
            src={getBackdropUrl(movie.backdrop_path, "large")}
            alt={`${movie.title} backdrop`}
            className="w-full h-full object-cover"
            fallbackSrc="/fallbacks/backdrop.svg"
            width={1280}
            height={720}
            sizes="100vw"
            priority
            fadeIn
            onLoad={onBackdropReady}
          />
        </motion.div>
      </AnimatePresence>

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/50 to-background/10" />
      <div className="absolute inset-0 hero-gradient" />
      <div className="hero-bottom-blend" />

      {/* Content */}
      <div className="absolute inset-0 flex items-center">
        <div className="container mx-auto px-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`hero-copy-${movie.id}`}
              initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-2xl"
            >
              {/* Language Badge */}
              <div className="flex items-center gap-2 mb-4">
                <span
                  className={cn(
                    "language-badge",
                    getLanguageBadgeClass(movie.original_language)
                  )}
                >
                  {getLanguageLabel(movie.original_language)}
                </span>
                {year && (
                  <span className="language-badge bg-muted text-xs font-medium">
                    {year}
                  </span>
                )}
                {movie.vote_average > 0 && (
                  <span className="rating-badge">
                    <Star className="h-3 w-3 fill-current" />
                    {movie.vote_average.toFixed(1)}
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
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-wrap gap-3"
              >
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <Button
                    size="lg"
                    className="brand-primary-button font-semibold"
                    onClick={() =>
                      navigate(`/movie/${movie.id}`, { state: { from: fromPath, autoPlayTrailer: true } })
                    }
                  >
                    <Play className="w-5 h-5 mr-2 fill-current" />
                    Watch Trailer
                  </Button>
                </motion.div>
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/70 bg-white text-black shadow-lg shadow-black/35 transition-colors duration-200 hover:bg-white/90 hover:text-black font-semibold"
                    onClick={() =>
                      navigate(`/movie/${movie.id}`, { state: { from: fromPath } })
                    }
                  >
                    <Info className="w-5 h-5 mr-2" />
                    More Info
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Dots Navigation */}
      {totalSlides > 1 && (
        <div className="absolute bottom-24 md:bottom-32 left-1/2 -translate-x-1/2 flex gap-2">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <motion.button
              key={index}
              onClick={() => onDotClick(index)}
              animate={{ width: index === currentIndex ? 32 : 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className={cn(
                "h-2 rounded-full transition-colors duration-300",
                index === currentIndex
                  ? "bg-primary shadow-[0_0_16px_hsl(var(--brand-red-bright)/0.28)]"
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
