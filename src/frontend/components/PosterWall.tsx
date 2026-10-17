import type { CSSProperties } from "react";
import MediaImage from "@/frontend/components/MediaImage";
import { buildPosterWall, type WallPoster } from "@/frontend/lib/posterWall";
import { cn } from "@/shared/lib/utils";

interface PosterWallProps {
  posters: WallPoster[];
  rows?: number;
  /** Upper bound; fewer are used when there are not enough distinct posters. */
  maxPerRow?: number;
  /** Seconds for the first row to scroll once; later rows are a little slower. */
  baseDuration?: number;
  /** Load the first row eagerly (rows sit inside a rotated, clipped marquee, so lazy loading never fires). */
  eager?: boolean;
  className?: string;
}

/**
 * Scrolling poster rows for loading and transition screens.
 *
 * Tiles are sized so one row is always wider than the viewport. The marquee then
 * never shows the same poster twice at once, and no poster appears in two rows.
 */
export default function PosterWall({ posters, rows = 3, maxPerRow = 8, baseDuration = 36, eager = true, className }: PosterWallProps) {
  const { rows: layout, perRow } = buildPosterWall(posters, rows, maxPerRow);
  if (layout.length === 0) return null;

  return (
    <div
      className={cn("flex h-full flex-col justify-center gap-3", className)}
      style={{ "--poster-tile-w": `clamp(104px, calc(112vw / ${perRow}), 460px)` } as CSSProperties}
    >
      {layout.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={cn("auth-poster-row", rowIndex % 2 === 1 && "auth-poster-row-reverse")}
          style={{ animationDuration: `${baseDuration + rowIndex * 4}s` }}
        >
          {/* The second copy only makes the loop seamless; it is never on screen with the first. */}
          {[...row, ...row].map((poster, index) => (
            <div key={`${poster.id}-${index}`} className="auth-poster-tile" aria-hidden={index >= row.length || undefined}>
              <MediaImage
                src={poster.src}
                alt=""
                aria-hidden="true"
                className="h-full w-full bg-card object-cover"
                width={146}
                height={219}
                fallbackSrc="/fallbacks/poster.svg"
                loading={eager || rowIndex === 0 ? "eager" : "lazy"}
                priority={rowIndex === 0 && index < row.length}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
