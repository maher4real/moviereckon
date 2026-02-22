// MovieReckon - Netflix-inspired movie recommendation platform
// Version: 2.1.0 - Enhanced recommendations and UI polish
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { UserDataProvider } from "@/hooks/useUserData";
import ErrorBoundary from "@/components/ErrorBoundary";
import StartupSoundManager from "@/components/StartupSoundManager";
import AuthTransitionOverlay from "@/components/AuthTransitionOverlay";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserDataProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <StartupSoundManager />
              <AuthTransitionOverlay />
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
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
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </UserDataProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
