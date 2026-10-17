import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Play, Info, Star, Pause, ChevronLeft, ChevronRight } from "lucide-react";
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
  /** Swipe/arrow navigation that keeps autoplay running. Falls back to onDotClick. */
  onStep?: (index: number) => void;
  onBackdropReady?: () => void;
  isPlaying?: boolean;
  onTogglePlayback?: () => void;
  onInteractionChange?: (active: boolean) => void;
  slideDuration?: number;
}

const SWIPE_THRESHOLD = 48;

export default function HeroBanner({ movie, isLoading, currentIndex, totalSlides, onDotClick, onStep, onBackdropReady, isPlaying = true, onTogglePlayback, onInteractionChange, slideDuration = 8000 }: HeroBannerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [interacting, setInteracting] = useState(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const from = `${location.pathname}${location.search}${location.hash}`;
  if (isLoading || !movie) return <div className="streaming-hero hero-skeleton" aria-label="Loading featured movies" aria-busy="true" />;

  const running = isPlaying && !interacting;
  const setInteraction = (active: boolean) => { setInteracting(active); onInteractionChange?.(active); };
  const step = (delta: number) => {
    if (totalSlides < 2) return;
    (onStep || onDotClick)((currentIndex + delta + totalSlides) % totalSlides);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  };
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") pointerStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    // Ignore mostly-vertical gestures so page scrolling never changes slides.
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5) step(dx < 0 ? 1 : -1);
  };
  const year = movie.release_date?.split("-")[0];

  return (
    <section className="streaming-hero" aria-label="Featured movies" aria-roledescription="carousel" tabIndex={-1}
      onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { pointerStart.current = null; }}
      onPointerEnter={event => { if (event.pointerType === "mouse") setInteraction(true); }}
      onPointerLeave={event => { if (event.pointerType === "mouse") setInteraction(false); }}
      onFocusCapture={() => setInteraction(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteraction(false); }}>
      <AnimatePresence initial={false}>
        <motion.div key={movie.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.6 }} className="absolute inset-0">
          <MediaImage src={getBackdropUrl(movie.backdrop_path, "large")} alt={`${movie.title} backdrop`} className={cn("hero-artwork", !reduceMotion && "hero-artwork-drift")} fallbackSrc="/fallbacks/backdrop.svg" width={1280} height={720} sizes="100vw" priority onLoad={onBackdropReady} draggable={false} />
        </motion.div>
      </AnimatePresence>
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-content-shell">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={movie.id} className="hero-copy"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <div className="hero-meta">
              <span className="hero-meta-chip">{getLanguageLabel(movie.original_language)}</span>
              {year && <span className="hero-meta-chip">{year}</span>}
              {movie.vote_average > 0 && <span className="hero-meta-chip text-[hsl(var(--rating-gold))]"><Star className="size-3.5 fill-current" aria-hidden="true" /><span>{movie.vote_average.toFixed(1)}<span className="sr-only"> out of 10</span></span></span>}
            </div>
            <h1 className={cn("hero-title", movie.title.length > 28 && "hero-title-long")}>{movie.title}</h1>
            {movie.overview && <p className="hero-overview">{movie.overview}</p>}
            <div className="hero-actions">
              <Button size="lg" className="brand-primary-button min-h-12 gap-2.5 rounded-full px-6 font-semibold" onClick={() => navigate(`/movie/${movie.id}`, { state: { from, autoPlayTrailer: true } })}><Play className="size-4.5 fill-current" />Watch Trailer</Button>
              <Button size="lg" variant="outline" className="min-h-12 gap-2.5 rounded-full border-white/25 bg-white/10 px-5 font-semibold text-white backdrop-blur-sm hover:bg-white/20 hover:text-white" onClick={() => navigate(`/movie/${movie.id}`, { state: { from } })}><Info className="size-4.5" />More Info</Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {totalSlides > 1 && <div className="hero-pagination">
        <button type="button" onClick={() => step(-1)} aria-label="Previous featured movie" className="hero-control hidden md:flex"><ChevronLeft className="size-4" /></button>
        <div className="flex items-center" aria-label="Choose featured movie">
          {Array.from({ length: totalSlides }, (_, index) => {
            const active = index === currentIndex;
            return <button key={index} type="button" onClick={() => onDotClick(index)} aria-label={`Go to slide ${index + 1}`} aria-pressed={active} className="group flex h-11 min-w-6 items-center justify-center px-1">
              <span className={cn("hero-dot", active && "hero-dot-active")}>
                {active && isPlaying && !reduceMotion && <span key={`${currentIndex}-${running}`} className="hero-dot-progress" style={{ animationDuration: `${slideDuration}ms`, animationPlayState: running ? "running" : "paused" }} />}
              </span>
            </button>;
          })}
        </div>
        <button type="button" onClick={() => step(1)} aria-label="Next featured movie" className="hero-control hidden md:flex"><ChevronRight className="size-4" /></button>
        {onTogglePlayback && <button type="button" onClick={onTogglePlayback} aria-label={isPlaying ? "Pause featured movies" : "Play featured movies"} className="hero-control ml-1">{isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}</button>}
      </div>}
    </section>
  );
}
