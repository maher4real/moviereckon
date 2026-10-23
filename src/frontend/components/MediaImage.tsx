import Image from "next/image";
import { ImgHTMLAttributes, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import { cn } from "@/shared/lib/utils";
import { buildTmdbImageProxyResponsiveSource } from "@/shared/lib/tmdbImageProxy";

interface MediaImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> {
  src?: string | null;
  srcSet?: string;
  fallbackSrc?: string;
  fadeIn?: boolean;
  priority?: boolean;
}

const TMDB_HOST = "image.tmdb.org";
const TMDB_BASE_PATH = "/t/p/";
const TMDB_IMAGE_PROXY_PATH = "/api/tmdb-image";
const NEXT_IMAGE_REMOTE_HOST_PATTERNS = [
  /^image\.tmdb\.org$/i,
  /^secure\.gravatar\.com$/i,
  /^www\.gravatar\.com$/i,
  /^avatars\.githubusercontent\.com$/i,
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)public\.blob\.vercel-storage\.com$/i,
];

const TMDB_GROUPS = [
  {
    tokens: ["w185", "w342", "w500", "original"],
    defaultSizes: "(max-width: 640px) 44vw, (max-width: 1024px) 24vw, 200px",
  },
  {
    tokens: ["w300", "w780", "w1280", "original"],
    defaultSizes: "100vw",
  },
  {
    tokens: ["w45", "w185", "h632", "original"],
    defaultSizes: "(max-width: 640px) 26vw, 120px",
  },
  {
    tokens: ["w185", "w300", "w500", "original"],
    defaultSizes: "(max-width: 640px) 70vw, 360px",
  },
] as const;

const TMDB_WIDTH_HINTS: Record<string, number> = {
  w45: 45,
  w92: 92,
  w154: 154,
  w185: 185,
  w300: 300,
  w342: 342,
  w500: 500,
  w780: 780,
  w1280: 1280,
  h632: 632,
  original: 2000,
};

interface ResponsiveSource {
  srcSet: string;
  sizes: string;
}

function getRemoteHostname(src: string): string | null {
  if (!src || src.startsWith("/") || src.startsWith("data:")) return null;

  try {
    return new URL(src).hostname;
  } catch {
    return null;
  }
}

function shouldUseNativeImageElement(src: string, srcSet?: string): boolean {
  if (!src || !!srcSet || src.startsWith("data:")) return true;
  if (src.startsWith(TMDB_IMAGE_PROXY_PATH)) return true;

  const hostname = getRemoteHostname(src);
  if (!hostname) return false;

  return !NEXT_IMAGE_REMOTE_HOST_PATTERNS.some((pattern) =>
    pattern.test(hostname),
  );
}

function buildTmdbResponsiveSource(src: string): ResponsiveSource | null {
  try {
    const url = new URL(src);
    if (url.hostname !== TMDB_HOST || !url.pathname.startsWith(TMDB_BASE_PATH)) {
      return null;
    }

    const pathWithoutBase = url.pathname.slice(TMDB_BASE_PATH.length);
    const firstSlash = pathWithoutBase.indexOf("/");
    if (firstSlash <= 0) return null;

    const currentToken = pathWithoutBase.slice(0, firstSlash);
    if (!currentToken || currentToken === "original") {
      return null;
    }

    const mediaPath = pathWithoutBase.slice(firstSlash + 1);
    if (!mediaPath) return null;

    const matchingGroups = TMDB_GROUPS.filter((candidate) =>
      (candidate.tokens as readonly string[]).includes(currentToken),
    );
    if (matchingGroups.length !== 1) return null;
    const [group] = matchingGroups;

    const srcSetValue = group.tokens
      .map((token) => {
        const width = TMDB_WIDTH_HINTS[token];
        if (!width) return null;
        return `${url.protocol}//${url.host}${TMDB_BASE_PATH}${token}/${mediaPath}${url.search} ${width}w`;
      })
      .filter((value): value is string => value !== null)
      .join(", ");

    if (!srcSetValue) return null;

    return {
      srcSet: srcSetValue,
      sizes: group.defaultSizes,
    };
  } catch {
    return null;
  }
}

/**
 * Warm the browser cache for an image before it is shown (e.g. the next slide
 * of a carousel), so swapping to it never flashes an empty frame. Uses the same
 * srcset/sizes MediaImage renders, so the browser fetches the exact candidate
 * it will later pick. React dedupes repeated calls for the same image.
 */
export function preloadMediaImage(
  src: string | null | undefined,
  options: {
    srcSet?: string;
    sizes?: string;
    fetchPriority?: "high" | "low" | "auto";
  } = {},
): void {
  if (!src || src.startsWith("data:")) return;

  const responsiveSource = options.srcSet
    ? null
    : buildTmdbImageProxyResponsiveSource(src) ?? buildTmdbResponsiveSource(src);
  const imageSrcSet = options.srcSet ?? responsiveSource?.srcSet;

  preload(src, {
    as: "image",
    fetchPriority: options.fetchPriority ?? "auto",
    ...(imageSrcSet
      ? {
          imageSrcSet,
          imageSizes: options.sizes ?? responsiveSource?.sizes,
        }
      : {}),
  });
}

export default function MediaImage({
  src,
  srcSet,
  fallbackSrc = "/fallbacks/poster.svg",
  fadeIn = false,
  priority = false,
  className,
  onLoad,
  onError,
  ...imgProps
}: MediaImageProps) {
  const normalizedSrc = useMemo(() => src || fallbackSrc, [src, fallbackSrc]);
  const [resolvedSrc, setResolvedSrc] = useState(normalizedSrc);
  const [isLoaded, setIsLoaded] = useState(!fadeIn);
  const nativeImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setResolvedSrc(normalizedSrc);
    setIsLoaded(!fadeIn);
  }, [normalizedSrc, fadeIn]);

  useEffect(() => {
    if (!fadeIn) {
      setIsLoaded(true);
    }
  }, [fadeIn]);

  // A server-rendered <img> can finish loading before React hydrates, so its
  // load event is never seen. Without this check a fadeIn image would stay at
  // opacity 0 forever.
  useEffect(() => {
    const element = nativeImgRef.current;
    if (element?.complete && element.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [resolvedSrc]);

  const responsiveSource = useMemo(() => {
    if (srcSet || !resolvedSrc) return null;
    return (
      buildTmdbImageProxyResponsiveSource(resolvedSrc) ??
      buildTmdbResponsiveSource(resolvedSrc)
    );
  }, [resolvedSrc, srcSet]);
  const shouldUseNativeImg = useMemo(
    () => shouldUseNativeImageElement(resolvedSrc, srcSet),
    [resolvedSrc, srcSet],
  );
  // Hoist priority (above-the-fold / LCP) images into <head> during SSR so the
  // browser starts fetching them before it parses the body. next/image does this
  // itself, so only the native <img> path needs it.
  if (priority && shouldUseNativeImg) {
    preloadMediaImage(resolvedSrc, {
      srcSet,
      sizes: imgProps.sizes,
      fetchPriority: "high",
    });
  }
  const loading = imgProps.loading ?? (priority ? "eager" : "lazy");
  const fetchPriority = imgProps.fetchPriority ?? (priority ? "high" : "auto");
  const alt = imgProps.alt || "";
  const width =
    typeof imgProps.width === "number" ? imgProps.width : undefined;
  const height =
    typeof imgProps.height === "number" ? imgProps.height : undefined;
  const sizes = imgProps.sizes ?? responsiveSource?.sizes ?? "100vw";
  const imageClassName = cn(
    "block",
    className,
    fadeIn && "transition-opacity duration-700 ease-out",
    fadeIn && (isLoaded ? "opacity-100" : "opacity-0"),
  );

  const handleNativeLoad: ImgHTMLAttributes<HTMLImageElement>["onLoad"] = (
    event,
  ) => {
    setIsLoaded(true);
    onLoad?.(event);
  };

  const handleNativeError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (
    event,
  ) => {
    if (resolvedSrc !== fallbackSrc) {
      setResolvedSrc(fallbackSrc);
      setIsLoaded(!fadeIn);
    }
    onError?.(event);
  };

  const handleNextLoad = () => {
    setIsLoaded(true);
  };

  const handleNextError = () => {
    if (resolvedSrc !== fallbackSrc) {
      setResolvedSrc(fallbackSrc);
      setIsLoaded(!fadeIn);
    }
  };

  if (shouldUseNativeImg) {
    return (
      <img
        {...imgProps}
        ref={nativeImgRef}
        alt={alt}
        src={resolvedSrc}
        srcSet={srcSet ?? responsiveSource?.srcSet}
        sizes={imgProps.sizes ?? responsiveSource?.sizes}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding={imgProps.decoding ?? "async"}
        onLoad={handleNativeLoad}
        onError={handleNativeError}
        className={imageClassName}
      />
    );
  }

  if (width && height) {
    return (
      <Image
        alt={alt}
        src={resolvedSrc}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : loading}
        fetchPriority={fetchPriority}
        className={imageClassName}
        onLoad={handleNextLoad}
        onError={handleNextError}
      />
    );
  }

  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <Image
        alt={alt}
        src={resolvedSrc}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : loading}
        fetchPriority={fetchPriority}
        className={imageClassName}
        onLoad={handleNextLoad}
        onError={handleNextError}
      />
    </span>
  );
}
