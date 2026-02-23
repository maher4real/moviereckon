import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Film } from "lucide-react";
import MediaImage from "@/components/MediaImage";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getBollywoodMovies,
  getPosterUrl,
  getTrendingMovies,
  getTrendingTVShows,
} from "@/lib/tmdb";
import { cn } from "@/lib/utils";

type OverlayPhase = "hidden" | "center" | "moving" | "fading";

const MIN_CENTER_DURATION_MS = 900;
const MOVE_DURATION_MS = 1450;
const FADE_DURATION_MS = 450;
const ANCHOR_LOOKUP_TIMEOUT_MS = 5000;

const INITIAL_TRANSFORM = {
  x: 0,
  y: 0,
  scale: 1,
};
const ROW_COUNT = 3;
const POSTERS_PER_ROW = 8;
const isAuthRoute = (pathname: string) =>
  pathname === "/" || pathname.startsWith("/auth");

export default function AuthTransitionOverlay() {
  const { user, isLoading, isAuthenticating, authTransitionRunId } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const logoRef = useRef<HTMLDivElement | null>(null);
  const runIdRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const [phase, setPhase] = useState<OverlayPhase>("hidden");
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [compactTarget, setCompactTarget] = useState(false);
  const shouldFetchOverlayData =
    isAuthRoute(location.pathname) || phase !== "hidden" || isAuthenticating;

  const { data: trendingMovies } = useQuery({
    queryKey: ["auth-bg-trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    enabled: shouldFetchOverlayData,
    staleTime: 1000 * 60 * 10,
  });

  const { data: trendingTV } = useQuery({
    queryKey: ["auth-bg-trending-tv"],
    queryFn: () => getTrendingTVShows("week"),
    enabled: shouldFetchOverlayData,
    staleTime: 1000 * 60 * 10,
  });

  const { data: bollywoodData } = useQuery({
    queryKey: ["auth-bg-bollywood"],
    queryFn: () => getBollywoodMovies(1),
    enabled: shouldFetchOverlayData,
    staleTime: 1000 * 60 * 10,
  });

  const backgroundPosters = useMemo(() => {
    const maxItems = 24;

    const moviePosters = (trendingMovies || [])
      .filter((item) => item.poster_path)
      .map((item, index) => ({
        id: `overlay-movie-${item.id}-${index}`,
        src: getPosterUrl(item.poster_path, "small"),
      }));

    const tvPosters = (trendingTV || [])
      .filter((item) => item.poster_path)
      .map((item, index) => ({
        id: `overlay-tv-${item.id}-${index}`,
        src: getPosterUrl(item.poster_path, "small"),
      }));

    const bollywoodPosters = (bollywoodData?.results || [])
      .filter((item) => item.poster_path)
      .map((item, index) => ({
        id: `overlay-bollywood-${item.id}-${index}`,
        src: getPosterUrl(item.poster_path, "small"),
      }));

    const curatedPools = {
      movie: moviePosters.slice(0, 14),
      tv: tvPosters.slice(0, 14),
      bollywood: bollywoodPosters.slice(0, 8),
    };

    const orderedKeys: (keyof typeof curatedPools)[] = [
      "movie",
      "tv",
      "bollywood",
    ];
    const mixed: { id: string; src: string }[] = [];
    let cursor = 0;

    while (
      mixed.length < maxItems &&
      orderedKeys.some((key) => cursor < curatedPools[key].length)
    ) {
      orderedKeys.forEach((key) => {
        if (mixed.length >= maxItems) return;
        const item = curatedPools[key][cursor];
        if (item) mixed.push(item);
      });
      cursor += 1;
    }

    if (mixed.length < maxItems) {
      const extraPool = [
        ...moviePosters.slice(14),
        ...tvPosters.slice(14),
        ...bollywoodPosters.slice(8),
      ];

      for (const item of extraPool) {
        if (mixed.length >= maxItems) break;
        mixed.push(item);
      }
    }

    if (mixed.length > 0) return mixed;

    return Array.from({ length: 24 }, (_, index) => ({
      id: `overlay-fallback-${index}`,
      src: "/fallbacks/poster.svg",
    }));
  }, [bollywoodData, trendingMovies, trendingTV]);

  const posterRows = useMemo(() => {
    if (!backgroundPosters.length) return [];

    return Array.from({ length: ROW_COUNT }, (_, rowIndex) => {
      const start = (rowIndex * 6) % backgroundPosters.length;
      return Array.from({ length: POSTERS_PER_ROW }, (_, offset) => {
        return backgroundPosters[(start + offset) % backgroundPosters.length];
      });
    });
  }, [backgroundPosters]);

  const clearPendingWork = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const beginMoveToNavbar = useCallback(() => {
    clearPendingWork();

    const moveStartTs = performance.now();

    const tick = () => {
      const movingLogo = logoRef.current;
      const anchor = document.querySelector<HTMLElement>(
        "[data-brand-logo-anchor='true']",
      );

      if (movingLogo && anchor) {
        const sourceRect = movingLogo.getBoundingClientRect();
        const targetRect = anchor.getBoundingClientRect();

        if (
          sourceRect.width > 0 &&
          sourceRect.height > 0 &&
          targetRect.width > 0 &&
          targetRect.height > 0
        ) {
          const anchorText = anchor.querySelector<HTMLElement>("span");
          const textRect = anchorText?.getBoundingClientRect();
          const textStyles = anchorText
            ? window.getComputedStyle(anchorText)
            : null;
          const labelVisible = Boolean(
            anchorText &&
            textRect &&
            textRect.width > 0 &&
            textStyles &&
            textStyles.display !== "none" &&
            textStyles.visibility !== "hidden",
          );
          setCompactTarget(!labelVisible);

          const sourceCenterX = sourceRect.left + sourceRect.width / 2;
          const sourceCenterY = sourceRect.top + sourceRect.height / 2;
          const targetCenterX = targetRect.left + targetRect.width / 2;
          const targetCenterY = targetRect.top + targetRect.height / 2;
          const targetScale = Math.max(
            0.22,
            Math.min(1, targetRect.width / sourceRect.width),
          );

          setTransform({
            x: targetCenterX - sourceCenterX,
            y: targetCenterY - sourceCenterY,
            scale: targetScale,
          });
          setPhase("moving");
          return;
        }
      }

      if (performance.now() - moveStartTs >= ANCHOR_LOOKUP_TIMEOUT_MS) {
        setPhase("fading");
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [clearPendingWork]);

  useEffect(() => {
    if (runIdRef.current === authTransitionRunId) return;

    clearPendingWork();
    runIdRef.current = authTransitionRunId;
    startedAtRef.current = performance.now();
    setTransform(INITIAL_TRANSFORM);
    setCompactTarget(false);
    setPhase("center");

    return clearPendingWork;
  }, [authTransitionRunId, clearPendingWork]);

  useEffect(() => {
    if (phase !== "center") return;

    const authBusy = isLoading || isAuthenticating;
    if (authBusy) return;

    const elapsed = performance.now() - startedAtRef.current;
    const waitMs = Math.max(0, MIN_CENTER_DURATION_MS - elapsed);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (user) {
        if (isMobile) {
          setPhase("fading");
          return;
        }
        beginMoveToNavbar();
        return;
      }
      setPhase("fading");
    }, waitMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase, isLoading, isAuthenticating, user, isMobile, beginMoveToNavbar]);

  useEffect(() => {
    if (phase !== "moving") return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPhase("fading");
    }, MOVE_DURATION_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "fading") return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPhase("hidden");
      setTransform(INITIAL_TRANSFORM);
    }, FADE_DURATION_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  useEffect(() => {
    return clearPendingWork;
  }, [clearPendingWork]);

  if (phase === "hidden") return null;

  const isCenter = phase === "center";
  const morphToIcon = compactTarget && phase !== "center";

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-0 z-120 cursor-progress transition-opacity duration-450",
        phase === "fading" ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute inset-0 scale-[1.08] -rotate-2">
          <div className="flex h-full flex-col justify-center gap-3 opacity-34">
            {posterRows.map((row, rowIndex) => (
              <div
                key={`overlay-row-${rowIndex}`}
                className={cn(
                  "auth-poster-row",
                  rowIndex % 2 === 1 && "auth-poster-row-reverse",
                )}
                style={{ animationDuration: `${38 + rowIndex * 4}s` }}
              >
                {[...row, ...row].map((poster, index) => (
                  <div
                    key={`${poster.id}-${rowIndex}-${index}`}
                    className="auth-poster-tile"
                  >
                    <MediaImage
                      src={poster.src}
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full object-cover"
                      fallbackSrc="/fallbacks/poster.svg"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-0 bg-black/58" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,hsl(var(--secondary)/0.12),transparent_42%),radial-gradient(circle_at_84%_74%,hsl(var(--primary)/0.14),transparent_45%)]" />
        <div className="absolute inset-0 bg-linear-to-br from-background/96 via-background/90 to-background/95" />
        <div className="absolute top-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-secondary/8 blur-[120px]" />
      </div>

      <div
        ref={logoRef}
        className={cn(
          "absolute left-1/2 top-1/2 flex items-center gap-2 sm:gap-3 will-change-transform",
          "transition-[transform,opacity,filter] duration-1450 ease-[cubic-bezier(0.22,1,0.36,1)]",
          phase === "fading" ? "opacity-0" : "opacity-100",
        )}
        style={{
          transform: `translate(-50%, -50%) translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          filter: isCenter
            ? "drop-shadow(0 0 30px hsl(var(--primary) / 0.38))"
            : "drop-shadow(0 0 12px hsl(var(--primary) / 0.16))",
        }}
      >
        <div
          className={cn(
            "flex items-center gap-2 sm:gap-3",
            isCenter && "animate-auth-brand-intro",
          )}
        >
          <Film
            className={cn(
              "h-10 w-10 text-primary sm:h-12 sm:w-12",
              isCenter && "animate-auth-brand-pulse",
            )}
          />
          <span
            className={cn(
              "relative text-3xl font-bold leading-none sm:text-4xl transition-[opacity,transform,filter] duration-900 ease-[cubic-bezier(0.22,1,0.36,1)]",
              morphToIcon
                ? "opacity-0 -translate-x-1 scale-95 blur-[1px]"
                : "opacity-100 translate-x-0 scale-100 blur-0",
            )}
          >
            <span className="text-gradient">MovieReckon</span>
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,hsl(var(--foreground)/0.95)_45%,transparent_70%)] bg-size-[220%_100%] bg-clip-text text-transparent transition-opacity duration-300",
                isCenter
                  ? "animate-auth-brand-shimmer opacity-100"
                  : "opacity-0",
              )}
            >
              MovieReckon
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
