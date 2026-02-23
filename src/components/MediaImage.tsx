import { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  fallbackSrc?: string;
  fadeIn?: boolean;
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
