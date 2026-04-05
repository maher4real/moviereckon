import BrandLogo from "@/frontend/components/BrandLogo";
import { Skeleton } from "@/frontend/components/ui/skeleton";
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
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={`poster-skeleton-${index}`}>
          <Skeleton className="aspect-[2/3] rounded-lg" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-1 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

interface UpcomingTimelineSkeletonProps {
  dateChipCount?: number;
  sectionCount?: number;
}

export function UpcomingTimelineSkeleton({
  dateChipCount = 14,
  sectionCount = 3,
}: UpcomingTimelineSkeletonProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-card/45 px-4 py-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-2 h-7 w-60" />
        <Skeleton className="mt-2 h-3 w-72" />
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/35 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/40 px-4 py-2.5">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="hidden sm:block h-3 w-24" />
        </div>
        <div className="overflow-x-auto scrollbar-hide px-3 py-3">
          <div className="flex w-max items-stretch gap-2">
            <Skeleton className="h-[74px] w-[108px] rounded-xl" />
            {Array.from({ length: dateChipCount }).map((_, index) => (
              <Skeleton key={`upcoming-date-chip-skeleton-${index}`} className="h-[74px] w-[98px] rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {Array.from({ length: sectionCount }).map((_, sectionIndex) => (
        <div key={`upcoming-section-skeleton-${sectionIndex}`} className="rounded-xl border border-border/70 bg-card/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, itemIndex) => (
              <div key={`upcoming-poster-skeleton-${sectionIndex}-${itemIndex}`}>
                <Skeleton className="aspect-[2/3] rounded-lg" />
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-1 h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AppPageSkeletonProps {
  cardCount?: number;
  showFilterRow?: boolean;
  className?: string;
}

export function AppPageSkeleton({
  cardCount = 12,
  showFilterRow = true,
  className,
}: AppPageSkeletonProps) {
  return (
    <div className={cn("min-h-screen bg-background pb-20 md:pb-0", className)}>
      <div className="border-b border-border/60 px-4 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Skeleton className="h-8 w-36" />
          <div className="hidden md:flex items-center gap-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 pt-20 pb-12">
        <Skeleton className="h-9 w-52 mb-6" />
        {showFilterRow && (
          <div className="flex flex-wrap gap-3 mb-6">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-28" />
          </div>
        )}
        <PosterGridSkeleton count={cardCount} />
      </main>
    </div>
  );
}

export function CenteredAppSkeleton() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <BrandLogo size="xl" animated />
    </div>
  );
}

export function AuthPageSkeleton() {
  const rowCount = 3;
  const postersPerRow = 8;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 scale-110 -rotate-2">
          <div
            className="flex h-full flex-col justify-center gap-3 opacity-62"
            style={{ filter: "saturate(1.12) contrast(1.04) brightness(0.92)" }}
          >
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
              <div
                key={`auth-skeleton-row-${rowIndex}`}
                className={cn(
                  "auth-poster-row",
                  rowIndex % 2 === 1 && "auth-poster-row-reverse",
                )}
                style={{ animationDuration: `${34 + rowIndex * 4}s` }}
              >
                {Array.from({ length: postersPerRow * 2 }).map((_, posterIndex) => (
                  <div
                    key={`auth-skeleton-tile-${rowIndex}-${posterIndex}`}
                    className="auth-poster-tile"
                  >
                    <Skeleton className="h-full w-full rounded-none" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-black/24" />
        <div className="absolute inset-0 bg-linear-to-br from-background/70 via-background/46 to-background/66" />
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/16 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-secondary/18 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center">
            <BrandLogo size="xl" animated />
          </div>
          <Skeleton className="h-4 w-64 mx-auto bg-white/12" />
        </div>

        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-8 shadow-2xl">
          <Skeleton className="h-10 w-full rounded-md" />
          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-12 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        </div>

        <Skeleton className="h-4 w-44 mx-auto" />
      </div>
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
    <div className={cn("flex items-center justify-center gap-2 py-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={`inline-skeleton-${index}`}
          className={cn("h-2.5 w-14 rounded-full", barClassName)}
        />
      ))}
    </div>
  );
}
