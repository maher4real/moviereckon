import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  consumeHomeHeroReady,
  HOME_HERO_READY_EVENT,
  clearStartupSoundPending,
  hasStartupSoundPlayed,
  isStartupSoundEnabled,
  isStartupSoundPending,
  markStartupSoundPlayed,
  playStartupSound,
  releaseStartupSoundAudio,
  warmStartupSound,
} from "@/lib/startupSound";

const isAuthRoute = (pathname: string) =>
  pathname === "/" || pathname.startsWith("/auth");

export default function StartupSoundManager() {
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (isAuthRoute(location.pathname)) return;
    if (!isStartupSoundEnabled()) {
      clearStartupSoundPending();
      return;
    }

    const pending = isStartupSoundPending();
    const alreadyPlayed = hasStartupSoundPlayed();
    if (!pending && (authLoading || !user)) return;
    if (!pending && alreadyPlayed) return;

    warmStartupSound();

    let disposed = false;
    let playAttempted = false;
    let visibilityAttached = false;
    let homeReadyAttached = false;
    let homeTimer: number | null = null;
    let fallbackTimer: number | null = null;
    let userInteractionListener: (() => void) | null = null;

    const detachUserInteraction = () => {
      if (!userInteractionListener) return;
      window.removeEventListener("pointerdown", userInteractionListener);
      window.removeEventListener("keydown", userInteractionListener);
      userInteractionListener = null;
    };

    const detachVisibility = () => {
      if (!visibilityAttached) return;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      visibilityAttached = false;
    };

    const detachHomeReady = () => {
      if (!homeReadyAttached) return;
      window.removeEventListener(HOME_HERO_READY_EVENT, onHomeReady);
      homeReadyAttached = false;
      if (homeTimer !== null) {
        window.clearTimeout(homeTimer);
        homeTimer = null;
      }
    };

    const clearFallback = () => {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      detachUserInteraction();
    };

    const markPlayed = () => {
      markStartupSoundPlayed();
      detachHomeReady();
      detachVisibility();
      clearFallback();
    };

    const tryPlay = () => {
      if (disposed || playAttempted || hasStartupSoundPlayed()) return;
      playAttempted = true;

      void playStartupSound()
        .then(() => {
          if (disposed) return;
          markPlayed();
        })
        .catch(() => {
          if (disposed) return;
          // Only attach user interaction listener after a short delay to avoid triggering on the login click
          if (fallbackTimer === null) {
            fallbackTimer = window.setTimeout(() => {
              if (disposed || hasStartupSoundPlayed()) return;
              userInteractionListener = () => {
                if (disposed || hasStartupSoundPlayed()) return;
                clearFallback();
                playWhenVisible();
              };
              window.addEventListener("pointerdown", userInteractionListener, {
                once: true,
              });
              window.addEventListener("keydown", userInteractionListener, {
                once: true,
              });
            }, 100);
          }
        });
    };

    const playWhenVisible = () => {
      if (disposed || hasStartupSoundPlayed()) return;
      if (document.visibilityState === "visible") {
        tryPlay();
        return;
      }
      if (!visibilityAttached) {
        document.addEventListener("visibilitychange", onVisibilityChange);
        visibilityAttached = true;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        detachVisibility();
        playWhenVisible();
      }
    };

    const onHomeReady = () => {
      detachHomeReady();
      playWhenVisible();
    };

    if (location.pathname === "/home") {
      if (consumeHomeHeroReady()) {
        playWhenVisible();
      } else {
        window.addEventListener(HOME_HERO_READY_EVENT, onHomeReady, {
          once: true,
        });
        homeReadyAttached = true;
        // Fallback in case the ready signal is missed by the listener.
        homeTimer = window.setTimeout(onHomeReady, 200);
      }
    } else {
      playWhenVisible();
    }

    return () => {
      disposed = true;
      detachHomeReady();
      detachVisibility();
      clearFallback();
    };
  }, [authLoading, user, location.pathname]);

  useEffect(
    () => () => {
      releaseStartupSoundAudio();
    },
    [],
  );

  return null;
}
