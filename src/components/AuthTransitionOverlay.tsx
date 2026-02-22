import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Film } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type OverlayPhase = "hidden" | "center" | "moving" | "fading";

const MIN_CENTER_DURATION_MS = 800;
const MOVE_DURATION_MS = 900;
const FADE_DURATION_MS = 320;
const ANCHOR_LOOKUP_TIMEOUT_MS = 5000;

const INITIAL_TRANSFORM = {
  x: 0,
  y: 0,
  scale: 1,
};

export default function AuthTransitionOverlay() {
  const { user, isLoading, isAuthenticating, authTransitionRunId } = useAuth();
  const location = useLocation();
  const logoRef = useRef<HTMLDivElement | null>(null);
  const runIdRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const [phase, setPhase] = useState<OverlayPhase>("hidden");
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);

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
      const anchor = document.querySelector<HTMLElement>("[data-brand-logo-anchor='true']");

      if (movingLogo && anchor) {
        const sourceRect = movingLogo.getBoundingClientRect();
        const targetRect = anchor.getBoundingClientRect();

        if (sourceRect.width > 0 && sourceRect.height > 0 && targetRect.width > 0 && targetRect.height > 0) {
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

    const authBusy = isLoading || isAuthenticating;
    if (authBusy) return;

    const elapsed = performance.now() - startedAtRef.current;
    const waitMs = Math.max(0, MIN_CENTER_DURATION_MS - elapsed);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (user) {
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
  }, [phase, isLoading, isAuthenticating, user, location.pathname, beginMoveToNavbar]);

  useEffect(() => {
    if (phase !== "moving" && phase !== "fading") return;

    const timeoutMs = phase === "moving" ? MOVE_DURATION_MS : FADE_DURATION_MS;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPhase("hidden");
      setTransform(INITIAL_TRANSFORM);
    }, timeoutMs);

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
    <div className="pointer-events-auto fixed inset-0 z-[120] cursor-progress">
      <div
        className={cn(
          "absolute inset-0 bg-background/96 backdrop-blur-md transition-opacity duration-500",
          phase === "moving" || phase === "fading" ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        ref={logoRef}
        className={cn(
          "absolute left-1/2 top-1/2 flex items-center gap-2 sm:gap-3 will-change-transform",
          isCenter
            ? "duration-300 ease-out"
            : "transition-[transform,opacity,filter] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          phase === "fading" ? "opacity-0" : "opacity-100",
        )}
        style={{
          transform: `translate(-50%, -50%) translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          filter: isCenter
            ? "drop-shadow(0 0 30px hsl(var(--primary) / 0.38))"
            : "drop-shadow(0 0 12px hsl(var(--primary) / 0.16))",
        }}
      >
        <Film
          className={cn(
            "h-10 w-10 text-primary sm:h-12 sm:w-12",
            isCenter && "animate-auth-brand-pulse",
          )}
        />
        <span className="relative text-3xl font-bold leading-none sm:text-4xl">
          <span className="text-gradient">MovieReckon</span>
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,hsl(var(--foreground)/0.95)_45%,transparent_70%)] bg-[length:220%_100%] bg-clip-text text-transparent transition-opacity duration-300",
              isCenter ? "animate-auth-brand-shimmer opacity-100" : "opacity-0",
            )}
          >
            MovieReckon
          </span>
        </span>
      </div>
    </div>
  );
}
