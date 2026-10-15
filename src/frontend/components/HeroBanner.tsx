import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Play, Info, Star, Pause } from "lucide-react";
import { Movie, getBackdropUrl, getLanguageLabel } from "@/shared/lib/tmdb";
import { Button } from "@/frontend/components/ui/button";
import MediaImage from "@/frontend/components/MediaImage";
import { cn } from "@/shared/lib/utils";

interface HeroBannerProps {
  movie: Movie | undefined;
  isLoading: boolean;
  currentIndex: number;
  totalSlides: number;
  onDotClick: (index: number) => void;
  onBackdropReady?: () => void;
  isPlaying?: boolean;
  onTogglePlayback?: () => void;
  onInteractionChange?: (active: boolean) => void;
}

export default function HeroBanner({ movie, isLoading, currentIndex, totalSlides, onDotClick, onBackdropReady, isPlaying = true, onTogglePlayback, onInteractionChange }: HeroBannerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const from = `${location.pathname}${location.search}${location.hash}`;
  if (isLoading || !movie) return <div className="streaming-hero bg-muted" aria-label="Loading featured movies" aria-busy="true" />;

  return (
    <section className="streaming-hero" aria-label="Featured movies" aria-roledescription="carousel"
      onMouseEnter={() => onInteractionChange?.(true)} onMouseLeave={() => onInteractionChange?.(false)}
      onFocusCapture={() => onInteractionChange?.(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onInteractionChange?.(false); }}>
      <AnimatePresence initial={false}>
        <motion.div key={movie.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.4 }} className="absolute inset-0">
          <MediaImage src={getBackdropUrl(movie.backdrop_path, "large")} alt={`${movie.title} backdrop`} className="hero-artwork" fallbackSrc="/fallbacks/backdrop.svg" width={1280} height={720} sizes="100vw" priority onLoad={onBackdropReady} />
        </motion.div>
      </AnimatePresence>
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-content-shell">
        <div className="hero-copy">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm font-medium text-white/80">
            <span>{getLanguageLabel(movie.original_language)}</span>
            {movie.release_date && <><span aria-hidden="true" className="size-1 rounded-full bg-white/40" /><span>{movie.release_date.split("-")[0]}</span></>}
            {movie.vote_average > 0 && <span className="inline-flex items-center gap-1.5 text-[hsl(var(--rating-gold))]"><Star className="size-3.5 fill-current" aria-hidden="true" /><span>{movie.vote_average.toFixed(1)}<span className="sr-only"> out of 10</span></span></span>}
          </div>
          <h1 className={cn("hero-title", movie.title.length > 28 && "hero-title-long")}>{movie.title}</h1>
          {movie.overview && <p className="hero-overview">{movie.overview}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" className="brand-primary-button min-h-12 gap-2.5 rounded-lg px-6 font-semibold" onClick={() => navigate(`/movie/${movie.id}`, { state: { from, autoPlayTrailer: true } })}><Play className="size-[18px] fill-current" />Watch Trailer</Button>
            <Button size="lg" variant="outline" className="min-h-12 gap-2.5 rounded-lg border-white/25 bg-white/10 px-5 font-semibold text-white backdrop-blur-sm hover:bg-white/20 hover:text-white" onClick={() => navigate(`/movie/${movie.id}`, { state: { from } })}><Info className="size-[18px]" />More Info</Button>
          </div>
        </div>
      </div>
      {totalSlides > 1 && <div className="hero-pagination">
        <div className="flex items-center" aria-label="Choose featured movie">
          {Array.from({ length: totalSlides }, (_, index) => <button key={index} type="button" onClick={() => onDotClick(index)} aria-label={`Go to slide ${index + 1}`} aria-pressed={index === currentIndex} className="group flex size-11 items-center justify-center rounded-sm"><span className={cn("h-[3px] rounded-full transition-[width,background-color] duration-200", index === currentIndex ? "w-8 bg-primary" : "w-4 bg-white/35 group-hover:bg-white/75")} /></button>)}
        </div>
        {onTogglePlayback && <button type="button" onClick={onTogglePlayback} aria-label={isPlaying ? "Pause featured movies" : "Play featured movies"} className="ml-2 flex size-11 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:bg-white/10">{isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}</button>}
      </div>}
    </section>
  );
}
