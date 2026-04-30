"use client";

// MovieReckon - Netflix-inspired movie recommendation platform
// Version: 2.1.0 - Enhanced recommendations and UI polish
import { Toaster } from "@/frontend/components/ui/toaster";
import { Toaster as Sonner } from "@/frontend/components/ui/sonner";
import { TooltipProvider } from "@/frontend/components/ui/tooltip";
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, StaticRouter } from "react-router-dom";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/frontend/hooks/useAuth";
import { UserDataProvider } from "@/frontend/hooks/useUserData";
import { WatchlistProvider } from "@/frontend/hooks/useWatchlist";
import WatchlistPanel from "@/frontend/components/WatchlistPanel";
import ErrorBoundary from "@/frontend/components/ErrorBoundary";
import StartupSoundManager from "@/frontend/components/StartupSoundManager";
import AuthTransitionOverlay from "@/frontend/components/AuthTransitionOverlay";
import { CenteredAppSkeleton } from "@/frontend/components/AppSkeletons";
import type { MongoUser } from "@/frontend/lib/mongodbClient";
import Auth from "@/frontend/features/auth/Auth";
import Home from "@/frontend/features/browse/Home";
import ProtectedRoute from "@/frontend/components/ProtectedRoute";

const routeLoaders = {
  upcoming: () => import("@/frontend/features/browse/Upcoming"),
  search: () => import("@/frontend/features/browse/Search"),
  movieDetail: () => import("@/frontend/features/browse/MovieDetail"),
  tvDetail: () => import("@/frontend/features/browse/TVDetail"),
  personDetail: () => import("@/frontend/features/browse/PersonDetail"),
  profile: () => import("@/frontend/features/profile/Profile"),
  profileEdit: () => import("@/frontend/features/profile/ProfileEdit"),
  reckon: () => import("@/frontend/features/recommendations/Reckon"),
  notFound: () => import("@/frontend/features/system/NotFound"),
  movies: () => import("@/frontend/features/browse/Movies"),
  series: () => import("@/frontend/features/browse/Series"),
  infoPage: () => import("@/frontend/features/info/InfoPage"),
  theaterHome: () => import("@/frontend/features/theater/TheaterHome"),
  theaterDetail: () => import("@/frontend/features/theater/TheaterDetail"),
  theaterPlayer: () => import("@/frontend/features/theater/TheaterPlayer"),
  theaterAdmin: () => import("@/frontend/features/theater/TheaterAdmin"),
  adminLogin: () => import("@/frontend/features/admin/AdminLogin"),
  verifyEmail: () => import("@/frontend/features/auth/VerifyEmail"),
  forgotPassword: () => import("@/frontend/features/auth/ForgotPassword"),
  resetPassword: () => import("@/frontend/features/auth/ResetPassword"),
} as const;

const Upcoming = lazy(routeLoaders.upcoming);
const Search = lazy(routeLoaders.search);
const MovieDetail = lazy(routeLoaders.movieDetail);
const TVDetail = lazy(routeLoaders.tvDetail);
const PersonDetail = lazy(routeLoaders.personDetail);
const Profile = lazy(routeLoaders.profile);
const ProfileEdit = lazy(routeLoaders.profileEdit);
const Reckon = lazy(routeLoaders.reckon);
const NotFound = lazy(routeLoaders.notFound);
const Movies = lazy(routeLoaders.movies);
const Series = lazy(routeLoaders.series);
const InfoPage = lazy(routeLoaders.infoPage);
const TheaterHome = lazy(routeLoaders.theaterHome);
const TheaterDetail = lazy(routeLoaders.theaterDetail);
const TheaterPlayer = lazy(routeLoaders.theaterPlayer);
const TheaterAdmin = lazy(routeLoaders.theaterAdmin);
const AdminLogin = lazy(routeLoaders.adminLogin);
const VerifyEmail = lazy(routeLoaders.verifyEmail);
const ForgotPassword = lazy(routeLoaders.forgotPassword);
const ResetPassword = lazy(routeLoaders.resetPassword);

function useIdleRoutePreload(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof globalThis.window === "undefined") return;

    const browserWindow = globalThis.window as Window &
      typeof globalThis & {
        requestIdleCallback?: (
          callback: IdleRequestCallback,
          options?: IdleRequestOptions,
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
      };

    const preload = () => {
      void Promise.allSettled([
        routeLoaders.movies(),
        routeLoaders.series(),
        routeLoaders.upcoming(),
        routeLoaders.search(),
        routeLoaders.reckon(),
        routeLoaders.profile(),
      ]);
    };

    if (browserWindow.requestIdleCallback && browserWindow.cancelIdleCallback) {
      const idleId = browserWindow.requestIdleCallback(preload, { timeout: 3000 });
      return () => browserWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = browserWindow.setTimeout(preload, 1200);
    return () => browserWindow.clearTimeout(timeoutId);
  }, [enabled]);
}

function AuthenticatedRoutePreload() {
  const { user, isLoading } = useAuth();
  useIdleRoutePreload(Boolean(user) && !isLoading);
  return null;
}

type AppProps = {
  initialLocation?: string;
  dehydratedState?: DehydratedState;
  initialUser?: MongoUser | null;
  authResolved?: boolean;
};

function AppRouter({
  children,
  initialLocation = "/",
}: {
  children: ReactNode;
  initialLocation?: string;
}) {
  if (typeof window === "undefined") {
    return <StaticRouter location={initialLocation}>{children}</StaticRouter>;
  }

  return <BrowserRouter>{children}</BrowserRouter>;
}

const App = ({
  initialLocation = "/",
  dehydratedState,
  initialUser,
  authResolved = false,
}: AppProps) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 1000 * 60 * 10, // 10 minutes
            gcTime: 1000 * 60 * 60,    // 60 minutes — keep data in memory longer
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <AuthProvider initialUser={initialUser} authResolved={authResolved}>
            <UserDataProvider>
              <WatchlistProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <AppRouter initialLocation={initialLocation}>
                  <StartupSoundManager />
                  <AuthenticatedRoutePreload />
                  <AuthTransitionOverlay />
                  <WatchlistPanel />
                  <Suspense fallback={<CenteredAppSkeleton />}>
                    <Routes>
                      {/* Public routes */}
                      <Route path="/" element={<Auth />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/verify-email" element={<VerifyEmail />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />

                      {/* Redirect aliases */}
                      <Route path="/browse" element={<Navigate to="/upcoming" replace />} />
                      <Route path="/browse/movies" element={<Navigate to="/upcoming?section=movies" replace />} />
                      <Route path="/browse/bollywood" element={<Navigate to="/upcoming?section=movies&movieType=bollywood" replace />} />
                      <Route path="/browse/hollywood" element={<Navigate to="/upcoming?section=movies&movieType=hollywood" replace />} />
                      <Route path="/browse/tv" element={<Navigate to="/upcoming?section=series" replace />} />

                      {/* Protected routes */}
                      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                      <Route path="/upcoming" element={<ProtectedRoute><Upcoming /></ProtectedRoute>} />
                      <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
                      <Route path="/movie/:id" element={<ProtectedRoute><MovieDetail /></ProtectedRoute>} />
                      <Route path="/tv/:id" element={<ProtectedRoute><TVDetail /></ProtectedRoute>} />
                      <Route path="/person/:id" element={<ProtectedRoute><PersonDetail /></ProtectedRoute>} />
                      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                      <Route path="/profile/edit" element={<ProtectedRoute><ProfileEdit /></ProtectedRoute>} />
                      <Route path="/reckon" element={<ProtectedRoute><Reckon /></ProtectedRoute>} />
                      <Route path="/movies" element={<ProtectedRoute><Movies /></ProtectedRoute>} />
                      <Route path="/series" element={<ProtectedRoute><Series /></ProtectedRoute>} />
                      <Route path="/about" element={<InfoPage page="about" />} />
                      <Route path="/feedback" element={<InfoPage page="feedback" />} />
                      <Route path="/contact" element={<InfoPage page="contact" />} />
                      <Route path="/faq" element={<InfoPage page="faq" />} />
                      <Route path="/terms" element={<InfoPage page="terms" />} />
                      <Route path="/privacy" element={<InfoPage page="privacy" />} />
                      {/* Admin login - public, no auth required */}
                      <Route path="/admin" element={<AdminLogin />} />
                      {/* Theater Mode routes */}
                      <Route path="/theater" element={<ProtectedRoute><TheaterHome /></ProtectedRoute>} />
                      <Route path="/theater/admin" element={<ProtectedRoute><TheaterAdmin /></ProtectedRoute>} />
                      <Route path="/theater/:id" element={<ProtectedRoute><TheaterDetail /></ProtectedRoute>} />
                      <Route path="/theater/:id/play" element={<ProtectedRoute><TheaterPlayer /></ProtectedRoute>} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </AppRouter>
              </TooltipProvider>
              </WatchlistProvider>
            </UserDataProvider>
          </AuthProvider>
        </HydrationBoundary>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
