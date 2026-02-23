import { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  fallbackSrc?: string;
  fadeIn?: boolean;
}

const TMDB_HOST = "image.tmdb.org";
const TMDB_BASE_PATH = "/t/p/";

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

    const srcSet = group.tokens
      .map((token) => {
        const width = TMDB_WIDTH_HINTS[token];
        if (!width) return null;
        return `${url.protocol}//${url.host}${TMDB_BASE_PATH}${token}/${mediaPath}${url.search} ${width}w`;
      })
      .filter((value): value is string => value !== null)
      .join(", ");

    if (!srcSet) return null;

    return {
      srcSet,
      sizes: group.defaultSizes,
    };
  } catch {
    return null;
  }
}

export default function MediaImage({
  src,
  fallbackSrc = "/fallbacks/poster.svg",
  fadeIn = false,
  className,
  onLoad,
  onError,
  ...imgProps
}: MediaImageProps) {
  const normalizedSrc = useMemo(() => src || fallbackSrc, [src, fallbackSrc]);
  const [resolvedSrc, setResolvedSrc] = useState(normalizedSrc);
  const [isLoaded, setIsLoaded] = useState(!fadeIn);

  useEffect(() => {
    setResolvedSrc(normalizedSrc);
    setIsLoaded(!fadeIn);
  }, [normalizedSrc, fadeIn]);

  useEffect(() => {
    if (!fadeIn) {
      setIsLoaded(true);
    }
  }, [fadeIn]);

  const responsiveSource = useMemo(() => {
    if (imgProps.srcSet || !resolvedSrc || resolvedSrc.startsWith("/")) return null;
    return buildTmdbResponsiveSource(resolvedSrc);
  }, [imgProps.srcSet, resolvedSrc]);

  const handleLoad: ImgHTMLAttributes<HTMLImageElement>["onLoad"] = (event) => {
    setIsLoaded(true);
    onLoad?.(event);
  };

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    if (resolvedSrc !== fallbackSrc) {
      setResolvedSrc(fallbackSrc);
      setIsLoaded(!fadeIn);
    }
    onError?.(event);
  };

  return (
    <img
      {...imgProps}
      src={resolvedSrc}
      srcSet={imgProps.srcSet ?? responsiveSource?.srcSet}
      sizes={imgProps.sizes ?? responsiveSource?.sizes}
      decoding={imgProps.decoding ?? "async"}
      onLoad={handleLoad}
      onError={handleError}
      className={cn(
        className,
        fadeIn && "transition-opacity duration-700 ease-out",
        fadeIn && (isLoaded ? "opacity-100" : "opacity-0"),
      )}
    />
  );
}
