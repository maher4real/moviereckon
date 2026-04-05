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
import { lazy, Suspense, useState, type ReactNode } from "react";
import { AuthProvider } from "@/frontend/hooks/useAuth";
import { UserDataProvider } from "@/frontend/hooks/useUserData";
import ErrorBoundary from "@/frontend/components/ErrorBoundary";
import StartupSoundManager from "@/frontend/components/StartupSoundManager";
import AuthTransitionOverlay from "@/frontend/components/AuthTransitionOverlay";
import { CenteredAppSkeleton } from "@/frontend/components/AppSkeletons";
import type { MongoUser } from "@/frontend/lib/mongodbClient";
import Auth from "@/frontend/features/auth/Auth";
import Home from "@/frontend/features/browse/Home";
import ProtectedRoute from "@/frontend/components/ProtectedRoute";

const Upcoming = lazy(() => import("@/frontend/features/browse/Upcoming"));
const Search = lazy(() => import("@/frontend/features/browse/Search"));
const MovieDetail = lazy(() => import("@/frontend/features/browse/MovieDetail"));
const TVDetail = lazy(() => import("@/frontend/features/browse/TVDetail"));
const PersonDetail = lazy(() => import("@/frontend/features/browse/PersonDetail"));
const Profile = lazy(() => import("@/frontend/features/profile/Profile"));
const ProfileEdit = lazy(() => import("@/frontend/features/profile/ProfileEdit"));
const Reckon = lazy(() => import("@/frontend/features/recommendations/Reckon"));
const NotFound = lazy(() => import("@/frontend/features/system/NotFound"));
const Movies = lazy(() => import("@/frontend/features/browse/Movies"));
const Series = lazy(() => import("@/frontend/features/browse/Series"));
const InfoPage = lazy(() => import("@/frontend/features/info/InfoPage"));
const VerifyEmail = lazy(() => import("@/frontend/features/auth/VerifyEmail"));
const ForgotPassword = lazy(() => import("@/frontend/features/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/frontend/features/auth/ResetPassword"));

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
