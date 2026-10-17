import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CenteredAppSkeleton, PosterGridSkeleton } from "@/frontend/components/AppSkeletons";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

/**
 * Page-shaped loading states. Each one reuses the layout classes of the real
 * page (hero heights, container padding, grid columns) so content replaces the
 * skeleton without the page jumping.
 */

function Live({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Static copy of the app header so the top bar never flickers while a page loads. */
export function SkeletonHeader() {
  return (
    <div className="app-header" data-scrolled="true" aria-hidden="true">
      <div className="app-header-inner">
        <Skeleton className="h-7 w-36 rounded-lg" />
        <div className="hidden items-center gap-2 lg:flex">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function PosterCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("shrink-0", className)}>
      <Skeleton className="aspect-2/3 rounded-xl" />
      <Skeleton className="mt-3 h-4 w-4/5" />
      <Skeleton className="mt-1.5 h-3 w-1/3" />
    </div>
  );
}

/** Heading plus a row of posters sized like a real content shelf. */
export function ShelfSkeleton({ posters = 8 }: { posters?: number }) {
  return (
    <section className="content-shelf" aria-hidden="true">
      <div className="shelf-heading">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex gap-3 overflow-hidden pt-2 pb-3 sm:gap-4">
        {Array.from({ length: posters }).map((_, index) => (
          <PosterCardSkeleton
            key={index}
            className="w-[42vw] max-w-[170px] sm:w-[160px] sm:max-w-none md:w-[180px] lg:w-[200px] xl:w-[210px]"
          />
        ))}
      </div>
    </section>
  );
}

export function HomeSkeleton() {
  return (
    <Live label="Loading home" className="app-page pb-20 md:pb-0">
      <SkeletonHeader />
      <div className="streaming-hero">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="hero-scrim" />
        <div className="hero-content-shell">
          <div className="hero-copy">
            <div className="mb-4 flex gap-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-14 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
            <Skeleton className="h-14 w-4/5 sm:h-16" />
            <Skeleton className="mt-3 h-14 w-3/5 sm:h-16" />
            <Skeleton className="mt-6 h-4 w-full max-w-md" />
            <Skeleton className="mt-2 h-4 w-5/6 max-w-md" />
            <div className="mt-7 flex gap-3">
              <Skeleton className="h-12 w-40 rounded-full" />
              <Skeleton className="h-12 w-36 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="home-collections">
        <div className="space-y-10 md:space-y-12">
          <ShelfSkeleton />
          <ShelfSkeleton />
        </div>
      </div>
    </Live>
  );
}

/** Header band, sticky-style filter bar and poster grid (Movies, Series, Upcoming). */
export function BrowseSkeleton({ count = 18, genreChips = true }: { count?: number; genreChips?: boolean }) {
  return (
    <Live label="Loading titles" className="app-page flex flex-col pb-20 md:pb-0">
      <SkeletonHeader />
      <main className="flex-1 pb-12">
        <div className="browse-hero">
          <div className="browse-hero-content container mx-auto px-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-lg" />
              <div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-8 w-44" />
              </div>
            </div>
            <Skeleton className="mt-4 h-4 w-full max-w-xl" />
            <Skeleton className="mt-4 h-7 w-28 rounded-full" />
          </div>
        </div>
        <div className="container mx-auto px-4">
          <div className="browse-filters" style={{ position: "static" }}>
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-28 shrink-0 rounded-full" />
              ))}
            </div>
            {genreChips && (
              <div className="flex gap-1.5 overflow-hidden">
                {Array.from({ length: 10 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-24 shrink-0 rounded-full" />
                ))}
              </div>
            )}
          </div>
          <PosterGridSkeleton count={count} />
        </div>
      </main>
    </Live>
  );
}

export function DetailSkeleton() {
  return (
    <Live label="Loading details" className="app-page pb-20 md:pb-0 overflow-x-hidden">
      <SkeletonHeader />
      <div className="detail-hero-media relative overflow-hidden">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-0 hero-gradient" />
      </div>
      <div className="detail-content-shell container mx-auto px-4 relative z-10 pb-10">
        <div className="detail-header flex flex-col gap-6 md:flex-row lg:gap-8">
          <Skeleton className="hidden aspect-2/3 w-48 shrink-0 rounded-lg md:block lg:w-56" />
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-start gap-4 md:hidden">
              <Skeleton className="aspect-2/3 w-24 shrink-0 rounded-lg sm:w-28" />
              <div className="flex-1">
                <Skeleton className="h-7 w-4/5" />
                <Skeleton className="mt-3 h-4 w-2/3" />
              </div>
            </div>
            <Skeleton className="mb-3 hidden h-12 w-3/5 md:block" />
            <Skeleton className="mb-4 hidden h-5 w-2/5 md:block" />
            <div className="mb-4 flex flex-wrap gap-2">
              {[16, 12, 14, 20, 16].map((width, index) => (
                <Skeleton key={index} className="h-8 rounded-full" style={{ width: `${width * 4}px` }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
              <Skeleton className="h-12 w-full rounded-lg sm:w-40" />
              <Skeleton className="h-12 w-full rounded-lg sm:w-32" />
              <Skeleton className="h-12 w-full rounded-lg sm:w-44" />
            </div>
          </div>
        </div>
        <div className="my-5 flex gap-2 overflow-hidden border-y border-border/40 py-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-28 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 md:gap-6">
          <div className="max-w-[72ch] space-y-3">
            <Skeleton className="h-6 w-32" />
            {[100, 96, 92, 98, 60].map((width, index) => (
              <Skeleton key={index} className="h-4" style={{ width: `${width}%` }} />
            ))}
          </div>
          <div className="skeleton-surface grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3 md:p-5 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Live>
  );
}

export function ProfileSkeleton() {
  return (
    <Live label="Loading profile" className="app-page pb-20 md:pb-0">
      <SkeletonHeader />
      <main className="flex-1 pb-12">
        <section className="profile-hero">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-4 md:gap-5">
              <Skeleton className="size-20 rounded-full md:size-24" />
              <div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-9 w-56" />
                <Skeleton className="mt-2 h-4 w-44" />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="profile-stat">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-8 w-12" />
                </div>
              ))}
            </div>
          </div>
        </section>
        <div className="container mx-auto px-4">
          <div className="mb-8 flex gap-2 overflow-hidden border-y border-border/40 py-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-28 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="skeleton-surface p-5"><Skeleton className="h-6 w-32" /><Skeleton className="mt-5 h-20 w-full" /></div>
            <div className="skeleton-surface space-y-3 p-5">
              <Skeleton className="h-6 w-44" />
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-16 w-11 rounded-md" />
                  <div className="flex-1"><Skeleton className="h-4 w-3/5" /><Skeleton className="mt-2 h-3 w-2/5" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </Live>
  );
}

export function ReckonSkeleton() {
  return (
    <Live label="Loading your recommendations" className="app-page reckon-page flex flex-col pb-20 md:pb-0">
      <SkeletonHeader />
      <main className="page-main">
        <div className="reckon-container">
          <section className="reckon-hero">
            <Skeleton className="absolute inset-0 rounded-none opacity-60" />
            <div className="relative max-w-2xl">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-3 h-14 w-56" />
              <Skeleton className="mt-4 h-4 w-full max-w-md" />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-6 w-16 rounded-full" />
                ))}
              </div>
            </div>
          </section>
          <div className="mb-4 flex items-baseline justify-between">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mb-6 flex gap-3 overflow-hidden">
            <Skeleton className="h-11 w-56 rounded-xl" />
            <Skeleton className="h-11 w-40 rounded-xl" />
            <Skeleton className="hidden h-11 w-40 rounded-xl sm:block" />
          </div>
          <PosterGridSkeleton count={12} />
        </div>
      </main>
    </Live>
  );
}

export function SearchSkeleton() {
  return (
    <Live label="Loading search" className="app-page flex flex-col pb-20 md:pb-0">
      <SkeletonHeader />
      <main className="flex-1 pb-12">
        <section className="search-hero">
          <div className="container mx-auto max-w-3xl px-4">
            <Skeleton className="mx-auto h-3 w-36" />
            <Skeleton className="mx-auto mt-3 h-10 w-4/5 max-w-lg" />
            <Skeleton className="mt-6 h-14 w-full rounded-full" />
          </div>
        </section>
        <div className="container mx-auto grid max-w-3xl gap-6 px-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, panel) => (
            <div key={panel} className="skeleton-surface p-5">
              <Skeleton className="h-5 w-40" />
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-24 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </Live>
  );
}

/** Generic page: header, a title and a grid. Used where no specific layout applies. */
export function GenericPageSkeleton() {
  return (
    <Live label="Loading page" className="app-page flex flex-col pb-20 md:pb-0">
      <SkeletonHeader />
      <main className="page-main">
        <div className="container mx-auto px-4">
          <Skeleton className="mb-3 h-3 w-28" />
          <Skeleton className="mb-8 h-10 w-64" />
          <PosterGridSkeleton count={12} />
        </div>
      </main>
    </Live>
  );
}

/** Sign-in / password screens: the real page is a centred card. */
export function AuthFormSkeleton() {
  return (
    <Live label="Loading" className="app-page relative flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Skeleton className="h-12 w-56 rounded-xl" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="surface-panel space-y-4 px-8 py-9">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </Live>
  );
}

const AUTH_PATHS = new Set(["/auth", "/verify-email", "/forgot-password", "/reset-password"]);

/** Suspense / auth-check fallback that matches the page being opened. */
export function RouteSkeleton() {
  const { pathname } = useLocation();
  if (pathname === "/") return <CenteredAppSkeleton />;
  if (AUTH_PATHS.has(pathname)) return <AuthFormSkeleton />;
  if (pathname === "/home") return <HomeSkeleton />;
  if (/^\/(movies|series|upcoming)\/?$/.test(pathname)) return <BrowseSkeleton genreChips={pathname !== "/upcoming"} />;
  if (/^\/(movie|tv)\/\d+/.test(pathname)) return <DetailSkeleton />;
  if (pathname.startsWith("/profile")) return <ProfileSkeleton />;
  if (pathname.startsWith("/reckon")) return <ReckonSkeleton />;
  if (pathname.startsWith("/search")) return <SearchSkeleton />;
  return <GenericPageSkeleton />;
}
