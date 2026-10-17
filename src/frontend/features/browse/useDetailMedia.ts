import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getYouTubeTrailerUrl, type Video } from "@/shared/lib/tmdb";
import { BACKGROUND_VIDEO_BOOT_DELAY_MS, PREVIEW_AUTOPLAY_TIMEOUT_MS } from "./detailShared";

/**
 * Behaviour shared by the movie and series detail pages: back navigation,
 * scroll-to-top, the muted background trailer, the trailer dialog (including
 * auto-open from the home hero) and lazy mounting of the community section.
 */
export function useDetailMedia(contentId: number, videosData: { results: Video[] } | undefined) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);
  const [trailerSessionId, setTrailerSessionId] = useState(0);
  const [isBackgroundVideoVisible, setIsBackgroundVideoVisible] = useState(true);
  const [shouldLoadBackgroundVideo, setShouldLoadBackgroundVideo] = useState(false);
  const [isBackgroundVideoPlaying, setIsBackgroundVideoPlaying] = useState(false);
  const [shouldRenderCommunity, setShouldRenderCommunity] = useState(false);
  const [bgFrameSize, setBgFrameSize] = useState({ width: 1920, height: 1080 });
  const heroMediaRef = useRef<HTMLDivElement>(null);
  const bgPlayerRef = useRef<HTMLIFrameElement>(null);
  const communitySectionRef = useRef<HTMLDivElement>(null);
  const hasAutoPlayedRef = useRef(false);

  const handleBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) {
      navigate(from);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/home");
  };

  // Always open detail page from top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [contentId]);

  const trailerUrl = videosData ? getYouTubeTrailerUrl(videosData.results) : null;
  const preferredTrailerKey = trailerUrl?.split("/embed/")[1]?.split("?")[0] || null;
  const backgroundTrailerKeys = useMemo(() => {
    const results = videosData?.results || [];
    const ranked = results
      .filter(
        (video) =>
          video.site === "YouTube" &&
          !!video.key &&
          (video.type === "Trailer" || video.type === "Teaser" || video.type === "Clip"),
      )
      .sort((a, b) => {
        const score = (video: (typeof results)[number]) => {
          const typeScore =
            video.type === "Trailer" ? 3 : video.type === "Teaser" ? 2 : 1;
          return (video.official ? 10 : 0) + typeScore;
        };
        return score(b) - score(a);
      });

    const unique = Array.from(new Map(ranked.map((video) => [video.key, video])).values());
    const candidateKeys = [
      preferredTrailerKey,
      ...unique.map((video) => video.key),
    ].filter((key): key is string => Boolean(key));
    return Array.from(new Set(candidateKeys)).slice(0, 3);
  }, [videosData, preferredTrailerKey]);
  const activeBgVideoKey = backgroundTrailerKeys[0] || null;
  const trailerModalKey = preferredTrailerKey || activeBgVideoKey;
  const youtubeOrigin = useMemo(
    () =>
      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "",
    [],
  );

  useEffect(() => {
    setIsTrailerModalOpen(false);
    hasAutoPlayedRef.current = false;
  }, [contentId]);

  // Auto-open trailer when navigated from hero "Watch Trailer" button
  const autoPlayTrailer = (location.state as { autoPlayTrailer?: boolean } | null)?.autoPlayTrailer;
  useEffect(() => {
    if (!autoPlayTrailer || !trailerModalKey || hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    setTrailerSessionId((prev) => prev + 1);
    setIsTrailerModalOpen(true);
  }, [autoPlayTrailer, trailerModalKey]);

  useEffect(() => {
    setShouldRenderCommunity(false);
  }, [contentId]);

  useEffect(() => {
    if (shouldRenderCommunity) return;

    const target = communitySectionRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setShouldRenderCommunity(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setShouldRenderCommunity(true);
        observer.disconnect();
      },
      { rootMargin: "280px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldRenderCommunity, contentId]);

  useEffect(() => {
    const updateFrameSize = () => {
      const container = heroMediaRef.current;
      if (!container) return;
      const { width: containerWidth, height: containerHeight } =
        container.getBoundingClientRect();
      const aspectRatio = 16 / 9;

      let width = containerWidth;
      let height = width / aspectRatio;
      if (height < containerHeight) {
        height = containerHeight;
        width = height * aspectRatio;
      }

      // Extra overscan keeps the trailer in cover mode across unusual aspect ratios.
      setBgFrameSize({ width: Math.ceil(width * 1.16), height: Math.ceil(height * 1.16) });
    };

    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    if (heroMediaRef.current) observer.observe(heroMediaRef.current);
    window.addEventListener("resize", updateFrameSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFrameSize);
    };
  }, []);


  const backgroundTrailerEmbedUrl = activeBgVideoKey
    ? `https://www.youtube.com/embed/${activeBgVideoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${activeBgVideoKey}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1${youtubeOrigin ? `&origin=${youtubeOrigin}` : ""}`
    : null;
  const modalTrailerEmbedUrl =
    trailerModalKey && isTrailerModalOpen
      ? `https://www.youtube.com/embed/${trailerModalKey}?autoplay=1&mute=0&controls=1&loop=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&start=0&enablejsapi=1${youtubeOrigin ? `&origin=${youtubeOrigin}` : ""}`
      : null;
  const controlBackgroundPreview = useCallback(
    (
      func: "addEventListener" | "mute" | "playVideo" | "pauseVideo" | "seekTo",
      args: Array<string | number | boolean> = [],
    ) => {
      const frame = bgPlayerRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "https://www.youtube.com",
      );
    },
    [],
  );

  useEffect(() => {
    setIsBackgroundVideoVisible(Boolean(activeBgVideoKey));
    setIsBackgroundVideoPlaying(false);
    setShouldLoadBackgroundVideo(false);
    if (!activeBgVideoKey) return;
    const timer = window.setTimeout(
      () => setShouldLoadBackgroundVideo(true),
      BACKGROUND_VIDEO_BOOT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activeBgVideoKey]);

  useEffect(() => {
    if (!backgroundTrailerEmbedUrl || !isBackgroundVideoVisible || !shouldLoadBackgroundVideo) {
      return;
    }
    const timer = window.setTimeout(() => {
      controlBackgroundPreview("addEventListener", ["onStateChange"]);
      controlBackgroundPreview("addEventListener", ["onError"]);
      controlBackgroundPreview("mute");
      controlBackgroundPreview("playVideo");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    backgroundTrailerEmbedUrl,
    controlBackgroundPreview,
    isBackgroundVideoVisible,
    shouldLoadBackgroundVideo,
  ]);

  useEffect(() => {
    if (
      !backgroundTrailerEmbedUrl ||
      !isBackgroundVideoVisible ||
      !shouldLoadBackgroundVideo ||
      isBackgroundVideoPlaying
    ) {
      return;
    }

    const fallbackTimeout = window.setTimeout(() => {
      setIsBackgroundVideoVisible(false);
    }, PREVIEW_AUTOPLAY_TIMEOUT_MS);

    return () => window.clearTimeout(fallbackTimeout);
  }, [
    backgroundTrailerEmbedUrl,
    isBackgroundVideoVisible,
    isBackgroundVideoPlaying,
    shouldLoadBackgroundVideo,
  ]);

  useEffect(() => {
    if (!activeBgVideoKey) return;

    const onPlayerMessage = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.youtube.com" &&
        event.origin !== "https://www.youtube-nocookie.com"
      ) {
        return;
      }

      let payload = event.data as unknown;
      if (typeof payload === "string") {
        if (!payload.startsWith("{")) return;
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (!payload || typeof payload !== "object") return;
      const message = payload as {
        event?: string;
        info?: number | string | { currentTime?: number };
      };

      if (message.event === "onStateChange") {
        const state = Number(message.info);
        if (state === 1) {
          setIsBackgroundVideoPlaying(true);
          setIsBackgroundVideoVisible(true);
        }
        if (state === 0) {
          controlBackgroundPreview("seekTo", [0, true]);
          controlBackgroundPreview("playVideo");
        }
      }

      if (
        message.event === "infoDelivery" &&
        message.info &&
        typeof message.info === "object" &&
        typeof message.info.currentTime === "number" &&
        message.info.currentTime > 0.5
      ) {
        setIsBackgroundVideoPlaying(true);
        setIsBackgroundVideoVisible(true);
      }

      if (message.event === "onError") {
        setIsBackgroundVideoVisible(false);
      }
    };

    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [activeBgVideoKey, controlBackgroundPreview]);

  useEffect(() => {
    if (!backgroundTrailerEmbedUrl || !isBackgroundVideoVisible || !shouldLoadBackgroundVideo) {
      return;
    }

    if (isTrailerModalOpen) {
      controlBackgroundPreview("pauseVideo");
      return;
    }

    const resumeTimeout = window.setTimeout(() => {
      controlBackgroundPreview("mute");
      controlBackgroundPreview("playVideo");
    }, 120);

    return () => window.clearTimeout(resumeTimeout);
  }, [
    backgroundTrailerEmbedUrl,
    controlBackgroundPreview,
    isBackgroundVideoVisible,
    shouldLoadBackgroundVideo,
    isTrailerModalOpen,
  ]);

  const openTrailerModal = () => {
    if (!trailerModalKey) return;
    setTrailerSessionId((prev) => prev + 1);
    setIsTrailerModalOpen(true);
  };

  return {
    handleBack,
    heroMediaRef,
    bgPlayerRef,
    communitySectionRef,
    isTrailerModalOpen,
    setIsTrailerModalOpen,
    trailerSessionId,
    isBackgroundVideoVisible,
    shouldLoadBackgroundVideo,
    shouldRenderCommunity,
    bgFrameSize,
    activeBgVideoKey,
    trailerModalKey,
    backgroundTrailerEmbedUrl,
    modalTrailerEmbedUrl,
    controlBackgroundPreview,
    openTrailerModal,
  };
}

export type DetailMedia = ReturnType<typeof useDetailMedia>;
