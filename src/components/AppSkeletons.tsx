import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-8 w-44 mx-auto" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5 mx-auto" />
      </div>
    </div>
  );
}

export function AuthPageSkeleton() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <Skeleton className="h-10 w-56 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-8 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
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
