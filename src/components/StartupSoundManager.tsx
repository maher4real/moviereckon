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

const isAuthRoute = (pathname: string) => pathname === "/" || pathname.startsWith("/auth");

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
    let fallbackAttached = false;
    let visibilityAttached = false;
    let homeReadyAttached = false;
    let homeTimer: number | null = null;

    const detachFallback = () => {
      if (!fallbackAttached) return;
      window.removeEventListener("pointerdown", onUserInteraction);
      window.removeEventListener("keydown", onUserInteraction);
      fallbackAttached = false;
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

    const markPlayed = () => {
      markStartupSoundPlayed();
      detachHomeReady();
      detachVisibility();
      detachFallback();
    };

    const tryPlay = () => {
      if (disposed) return;
      void playStartupSound()
        .then(() => {
          if (disposed) return;
          markPlayed();
        })
        .catch(() => {
          if (disposed || fallbackAttached) return;
          window.addEventListener("pointerdown", onUserInteraction, { once: true });
          window.addEventListener("keydown", onUserInteraction, { once: true });
          fallbackAttached = true;
        });
    };

    const playWhenVisible = () => {
      if (disposed) return;
      if (document.visibilityState === "visible") {
        tryPlay();
        return;
      }
      if (!visibilityAttached) {
        document.addEventListener("visibilitychange", onVisibilityChange);
        visibilityAttached = true;
      }
    };

    const onUserInteraction = () => {
      detachFallback();
      playWhenVisible();
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
        window.addEventListener(HOME_HERO_READY_EVENT, onHomeReady, { once: true });
        homeReadyAttached = true;
        // Fallback in case the ready signal is missed by the listener.
        homeTimer = window.setTimeout(onHomeReady, 350);
      }
    } else {
      playWhenVisible();
    }

    return () => {
      disposed = true;
      detachHomeReady();
      detachVisibility();
      detachFallback();
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
