import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import BrandLogo from "@/frontend/components/BrandLogo";
import MediaImage from "@/frontend/components/MediaImage";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useIsMobile } from "@/frontend/hooks/use-mobile";
import {
  getBollywoodMovies,
  getPosterUrl,
  getTrendingMovies,
  getTrendingTVShows,
} from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

type OverlayPhase = "hidden" | "center" | "moving" | "fading";

const MAX_AUTH_WAIT_MS = 2000;
const MIN_CENTER_DURATION_MS = 950;
const MOVE_DURATION_MS = 580;
const FADE_DURATION_MS = 180;
const ANCHOR_LOOKUP_TIMEOUT_MS = 800;

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
  const shouldFetchOverlayData =
    isAuthRoute(location.pathname) || phase !== "hidden" || isAuthenticating;

  const { data: trendingMovies } = useQuery({
    queryKey: ["trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    enabled: shouldFetchOverlayData,
    staleTime: 1000 * 60 * 10,
  });

  const { data: trendingTV } = useQuery({
    queryKey: ["trending-tv-week"],
    queryFn: () => getTrendingTVShows("week"),
    enabled: shouldFetchOverlayData,
    staleTime: 1000 * 60 * 10,
  });

  const { data: bollywoodData } = useQuery({
    queryKey: ["bollywood-movies"],
    queryFn: () => getBollywoodMovies(),
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
    setPhase("center");

    return clearPendingWork;
  }, [authTransitionRunId, clearPendingWork]);

  useEffect(() => {
    if (phase !== "center") return;

    const elapsed = performance.now() - startedAtRef.current;
    const authBusy = isLoading || isAuthenticating;

    const proceed = () => {
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
    };

    if (authBusy) {
      // Auth still loading — cap the wait so slow networks don't block forever
      const remaining = Math.max(0, MAX_AUTH_WAIT_MS - elapsed);
      timerRef.current = window.setTimeout(proceed, remaining);
    } else {
      // Auth done — just honour the minimum display time
      const waitMs = Math.max(0, MIN_CENTER_DURATION_MS - elapsed);
      timerRef.current = window.setTimeout(proceed, waitMs);
    }

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

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-0 z-120 cursor-progress transition-opacity duration-300",
        phase === "fading" ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 scale-[1.08] -rotate-2">
          <div
            className="flex h-full flex-col justify-center gap-3 opacity-64"
            style={{ filter: "saturate(1.16) contrast(1.06) brightness(0.9)" }}
          >
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

        <div className="absolute inset-0 bg-black/22" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,hsl(var(--secondary)/0.22),transparent_42%),radial-gradient(circle_at_84%_74%,hsl(var(--primary)/0.26),transparent_45%)]" />
        <div className="absolute inset-0 bg-linear-to-br from-background/68 via-background/44 to-background/62" />
        <div className="absolute top-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-primary/16 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-secondary/18 blur-[120px]" />
      </div>

      <div
        ref={logoRef}
        className={cn(
          "absolute left-1/2 top-1/2 will-change-transform",
          phase === "fading" ? "opacity-0" : "opacity-100",
        )}
        style={{
          transform: `translate(-50%, -50%) translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transition: `transform ${MOVE_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${FADE_DURATION_MS}ms ease, filter ${MOVE_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          filter: isCenter
            ? "drop-shadow(0 0 34px hsl(var(--primary) / 0.24))"
            : "drop-shadow(0 0 16px hsl(var(--primary) / 0.12))",
        }}
      >
        <div
          className={cn(
            "flex items-center",
            isCenter && "animate-auth-brand-intro",
          )}
        >
          <BrandLogo size="xl" animated />
        </div>
      </div>
    </div>
  );
}
