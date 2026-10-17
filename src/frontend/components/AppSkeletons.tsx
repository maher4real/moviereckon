import BrandLogo from "@/frontend/components/BrandLogo";
import PosterWall from "@/frontend/components/PosterWall";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { getPosterUrl } from "@/shared/lib/tmdb";
import { TMDB_FALLBACK_POSTERS } from "@/shared/lib/tmdbFallbacks";
import { cn } from "@/shared/lib/utils";

interface PosterGridSkeletonProps {
  count?: number;
  className?: string;
}

export function PosterGridSkeleton({
  count = 12,
  className,
}: PosterGridSkeletonProps) {
  return (
    <div className={cn("content-grid", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={`poster-skeleton-${index}`}>
          <Skeleton className="aspect-[2/3] rounded-xl" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-1.5 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

interface UpcomingTimelineSkeletonProps {
  dateChipCount?: number;
  sectionCount?: number;
}

/** Date strip plus day cards, matching the Upcoming page layout. */
export function UpcomingTimelineSkeleton({
  dateChipCount = 14,
  sectionCount = 3,
}: UpcomingTimelineSkeletonProps) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Loading release calendar</span>
      <div className="surface-panel overflow-hidden" aria-hidden="true">
        <div className="border-b border-border/70 bg-background/40 px-4 py-2.5">
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="overflow-hidden px-3 py-3">
          <div className="flex w-max items-stretch gap-2">
            <Skeleton className="h-[74px] w-[108px] rounded-lg" />
            {Array.from({ length: dateChipCount }).map((_, index) => (
              <Skeleton key={`upcoming-date-chip-skeleton-${index}`} className="h-[74px] w-[98px] rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {Array.from({ length: sectionCount }).map((_, sectionIndex) => (
        <div key={`upcoming-section-skeleton-${sectionIndex}`} className="upcoming-day" aria-hidden="true">
          <div className="upcoming-day-head">
            <Skeleton className="h-[3.75rem] w-14 shrink-0 rounded-[0.875rem]" />
            <div className="flex-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 5 }).map((_, itemIndex) => (
              <div key={`upcoming-poster-skeleton-${sectionIndex}-${itemIndex}`}>
                <Skeleton className="aspect-[2/3] rounded-xl" />
                <Skeleton className="mt-3 h-4 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CenteredAppSkeleton() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <LoadingPosterCarouselBackdrop />

      <div className="relative z-10 flex flex-col items-center justify-center gap-5" role="status">
        <BrandLogo size="xl" animated />
        <div className="skeleton-splash-bar" aria-hidden="true" />
        <span className="sr-only">Loading MovieReckon</span>
      </div>
    </div>
  );
}

// Static, API-independent posters so the loading screen is never an empty grid.
const LOADING_POSTERS = TMDB_FALLBACK_POSTERS.map((poster, index) => ({
  id: `loading-poster-${index}`,
  src: getPosterUrl(poster.path, "small"),
}));

function LoadingPosterCarouselBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 scale-110 -rotate-2">
        <div className="h-full opacity-62" style={{ filter: "saturate(1.12) contrast(1.04) brightness(0.92)" }}>
          <PosterWall posters={LOADING_POSTERS} rows={3} />
        </div>
      </div>
      <div className="absolute inset-0 bg-black/24" />
      <div className="absolute inset-0 bg-linear-to-br from-background/70 via-background/46 to-background/66" />
    </div>
  );
}

interface InlineLoadMoreSkeletonProps {
  count?: number;
  className?: string;
  barClassName?: string;
}

export function InlineLoadMoreSkeleton({
  count = 3,
  className,
  barClassName,
}: InlineLoadMoreSkeletonProps) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2 py-4", className)}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={`inline-skeleton-${index}`}
          className={cn("h-2.5 w-14 rounded-full", barClassName)}
        />
      ))}
    </div>
  );
}
