"use client";

// MovieReckon - Netflix-inspired movie recommendation platform
// Version: 2.1.0 - Enhanced recommendations and UI polish
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, StaticRouter } from "react-router-dom";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { UserDataProvider } from "@/hooks/useUserData";
import ErrorBoundary from "@/components/ErrorBoundary";
import StartupSoundManager from "@/components/StartupSoundManager";
import AuthTransitionOverlay from "@/components/AuthTransitionOverlay";
import { CenteredAppSkeleton } from "@/components/AppSkeletons";
import type { MongoUser } from "@/lib/mongodbClient";

const Auth = lazy(() => import("./screens/Auth"));
const Home = lazy(() => import("./screens/Home"));
const Upcoming = lazy(() => import("./screens/Upcoming"));
const Search = lazy(() => import("./screens/Search"));
const MovieDetail = lazy(() => import("./screens/MovieDetail"));
const TVDetail = lazy(() => import("./screens/TVDetail"));
const Profile = lazy(() => import("./screens/Profile"));
const Reckon = lazy(() => import("./screens/Reckon"));
const NotFound = lazy(() => import("./screens/NotFound"));
const Movies = lazy(() => import("./screens/Movies"));
const Series = lazy(() => import("./screens/Series"));
const InfoPage = lazy(() => import("./screens/InfoPage"));

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
            retry: 2,
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
    };

    const handleGlobalError = (event: ErrorEvent) => {
      console.error("Uncaught error:", event.error);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleGlobalError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleGlobalError);
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <AuthProvider initialUser={initialUser} authResolved={authResolved}>
            <UserDataProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <AppRouter initialLocation={initialLocation}>
                  <StartupSoundManager />
                  <AuthTransitionOverlay />
                  <Suspense fallback={<CenteredAppSkeleton />}>
                    <Routes>
                      <Route path="/" element={<Auth />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/home" element={<Home />} />
                      <Route path="/upcoming" element={<Upcoming />} />
                      <Route path="/browse" element={<Navigate to="/upcoming" replace />} />
                      <Route path="/browse/movies" element={<Navigate to="/upcoming?section=movies" replace />} />
                      <Route path="/browse/bollywood" element={<Navigate to="/upcoming?section=movies&movieType=bollywood" replace />} />
                      <Route path="/browse/hollywood" element={<Navigate to="/upcoming?section=movies&movieType=hollywood" replace />} />
                      <Route path="/browse/tv" element={<Navigate to="/upcoming?section=series" replace />} />
                      <Route path="/search" element={<Search />} />
                      <Route path="/movie/:id" element={<MovieDetail />} />
                      <Route path="/tv/:id" element={<TVDetail />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/reckon" element={<Reckon />} />
                      <Route path="/movies" element={<Movies />} />
                      <Route path="/series" element={<Series />} />
                      <Route path="/about" element={<InfoPage page="about" />} />
                      <Route path="/feedback" element={<InfoPage page="feedback" />} />
                      <Route path="/contact" element={<InfoPage page="contact" />} />
                      <Route path="/faq" element={<InfoPage page="faq" />} />
                      <Route path="/terms" element={<InfoPage page="terms" />} />
                      <Route path="/privacy" element={<InfoPage page="privacy" />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </AppRouter>
              </TooltipProvider>
            </UserDataProvider>
          </AuthProvider>
        </HydrationBoundary>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
