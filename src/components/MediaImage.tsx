import { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  fallbackSrc?: string;
}

export default function MediaImage({
  src,
  fallbackSrc = "/fallbacks/poster.svg",
  onError,
  ...imgProps
}: MediaImageProps) {
  const normalizedSrc = useMemo(() => src || fallbackSrc, [src, fallbackSrc]);
  const [resolvedSrc, setResolvedSrc] = useState(normalizedSrc);

  useEffect(() => {
    setResolvedSrc(normalizedSrc);
  }, [normalizedSrc]);

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    if (resolvedSrc !== fallbackSrc) {
      setResolvedSrc(fallbackSrc);
    }
    onError?.(event);
  };

  return <img {...imgProps} src={resolvedSrc} onError={handleError} />;
}
