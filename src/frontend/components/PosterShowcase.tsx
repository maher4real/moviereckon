"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";
import { useReducedMotion } from "motion/react";
import MediaImage from "@/frontend/components/MediaImage";
import { cn } from "@/shared/lib/utils";

// Every field except id/src/title/eyebrow is optional and only rendered when
// present, so fallback slides never show details they cannot back up.
export type ShowcaseSlide = {
  id: string;
  src: string;
  title: string;
  eyebrow: string;
  rating?: number;
  overview?: string;
  year?: string;
  /** Full backdrop URL, for callers that theme their background off the active slide. */
  backdrop?: string;
};

type PosterShowcaseProps = {
  slides: ShowcaseSlide[];
  label: string;
  interval?: number;
  className?: string;
  /** Hide the caption block, e.g. when the surrounding layout has its own copy. */
  hideCaption?: boolean;
  onActiveChange?: (slide: ShowcaseSlide) => void;
};

const SWIPE_THRESHOLD = 40;
const VISIBLE_RADIUS = 2;

/** Signed shortest distance from the active slide on a circular track. */
function circularOffset(index: number, active: number, total: number) {
  let offset = index - active;
  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;
  return offset;
}

function isKeyboardFocus(target: EventTarget) {
  try {
    return target instanceof Element && target.matches(":focus-visible");
  } catch {
    return false;
  }
}

export default function PosterShowcase({ slides, label, interval = 6000, className, hideCaption = false, onActiveChange }: PosterShowcaseProps) {
  const reduceMotion = useReducedMotion();
  const total = slides.length;
  const [active, setActive] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const pointerStart = useRef<number | null>(null);

  const autoplay = !reduceMotion && total > 1;
  const playing = autoplay && !userPaused && !hovered && !pageHidden;

  const go = useCallback((delta: number) => {
    if (total < 2) return;
    setActive((current) => (current + delta + total) % total);
  }, [total]);

  useEffect(() => {
    if (active >= total) setActive(0);
  }, [active, total]);

  const activeSlide = slides[Math.min(active, Math.max(total - 1, 0))];
  useEffect(() => {
    if (activeSlide) onActiveChange?.(activeSlide);
  }, [activeSlide, onActiveChange]);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timeout = window.setTimeout(() => go(1), interval);
    return () => window.clearTimeout(timeout);
  }, [active, go, interval, playing]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => { pointerStart.current = event.clientX; };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return;
    const delta = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(delta) >= SWIPE_THRESHOLD) go(delta < 0 ? 1 : -1);
  };

  if (!total) return null;
  const current = slides[Math.min(active, total - 1)];

  return (
    <div
      className={cn("poster-showcase", className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      // Touch devices emit sticky enter events; only a real mouse or keyboard
      // focus pauses autoplay, so a tap never freezes the carousel.
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false); }}
      onFocusCapture={(event) => { if (isKeyboardFocus(event.target)) setHovered(true); }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false); }}
    >
      <div
        className="poster-showcase-stage"
        tabIndex={0}
        aria-label={`${label}. Use the arrow keys to browse.`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerStart.current = null; }}
      >
        {slides.map((slide, index) => {
          const offset = circularOffset(index, active, total);
          const distance = Math.abs(offset);
          const isActive = offset === 0;
          const style = {
            "--offset": offset,
            "--distance": distance,
            zIndex: 20 - distance,
          } as CSSProperties;
          return (
            <button
              key={slide.id}
              type="button"
              className="poster-showcase-slide"
              data-active={isActive}
              data-hidden={distance > VISIBLE_RADIUS}
              style={style}
              tabIndex={isActive || distance > VISIBLE_RADIUS ? -1 : 0}
              aria-hidden={!isActive}
              aria-label={isActive ? undefined : `Show ${slide.title}`}
              onClick={() => { if (!isActive) setActive(index); }}
            >
              <MediaImage
                src={slide.src}
                alt={isActive ? `${slide.title} poster` : ""}
                className="size-full object-cover"
                width={342}
                height={513}
                sizes="(max-width: 640px) 46vw, 240px"
                fallbackSrc="/fallbacks/poster.svg"
                priority={index === 0}
                loading={distance <= 1 ? "eager" : "lazy"}
                draggable={false}
              />
              <span aria-hidden="true" className="poster-showcase-sheen" />
            </button>
          );
        })}
      </div>

      {!hideCaption && (
        <div className="poster-showcase-caption" aria-live={playing ? "off" : "polite"}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{current.eyebrow}</span>
            {current.rating !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--rating-gold)/0.25)] bg-[hsl(var(--rating-gold)/0.1)] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--rating-gold))]">
                <Star className="size-3 fill-current" aria-hidden="true" />
                {current.rating.toFixed(1)} on TMDB
              </span>
            )}
          </div>
          <p className="mt-2 truncate text-lg font-bold tracking-tight text-white sm:text-xl">
            {current.title}
            {current.year && <span className="ml-2 text-sm font-medium text-white/45">{current.year}</span>}
          </p>
          {current.overview && <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/58">{current.overview}</p>}
        </div>
      )}

      {total > 1 && (
        <div className="poster-showcase-controls">
          <button type="button" className="poster-showcase-arrow" onClick={() => go(-1)} aria-label="Previous title">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 items-center" aria-label="Choose title">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Show ${slide.title}`}
                aria-pressed={index === active}
                className="group flex h-8 min-w-5 items-center justify-center px-1"
              >
                <span className="poster-showcase-dot" data-active={index === active}>
                  {index === active && autoplay && (
                    <span
                      key={`${active}-${playing}`}
                      className="poster-showcase-progress"
                      style={{ animationDuration: `${interval}ms`, animationPlayState: playing ? "running" : "paused" }}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="poster-showcase-arrow" onClick={() => go(1)} aria-label="Next title">
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
          {autoplay && (
            <button
              type="button"
              className="poster-showcase-arrow"
              onClick={() => setUserPaused((paused) => !paused)}
              aria-label={userPaused ? "Play carousel" : "Pause carousel"}
            >
              {userPaused ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
