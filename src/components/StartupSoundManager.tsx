import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  STARTUP_SOUND_SRC,
  clearStartupSoundPending,
  hasStartupSoundPlayed,
  isStartupSoundEnabled,
  isStartupSoundPending,
  markStartupSoundPlayed,
} from "@/lib/startupSound";

const isAuthRoute = (pathname: string) => pathname === "/" || pathname.startsWith("/auth");

export default function StartupSoundManager() {
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    if (isAuthRoute(location.pathname)) return;
    if (!isStartupSoundEnabled()) {
      clearStartupSoundPending();
      return;
    }

    const pending = isStartupSoundPending();
    const alreadyPlayed = hasStartupSoundPlayed();
    if (!pending && alreadyPlayed) return;

    const audio = audioRef.current ?? new Audio(STARTUP_SOUND_SRC);
    audio.preload = "auto";
    audio.volume = 0.85;
    audioRef.current = audio;

    let disposed = false;
    let fallbackAttached = false;

    const detachFallback = () => {
      if (!fallbackAttached) return;
      window.removeEventListener("pointerdown", onUserInteraction);
      window.removeEventListener("keydown", onUserInteraction);
      fallbackAttached = false;
    };

    const markPlayed = () => {
      markStartupSoundPlayed();
      detachFallback();
    };

    const tryPlay = () => {
      if (disposed) return;
      audio.currentTime = 0;
      void audio
        .play()
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

    const onUserInteraction = () => {
      detachFallback();
      tryPlay();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        tryPlay();
      }
    };

    if (document.visibilityState === "visible") {
      tryPlay();
    } else {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      disposed = true;
      detachFallback();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authLoading, user, location.pathname]);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    },
    [],
  );

  return null;
}

