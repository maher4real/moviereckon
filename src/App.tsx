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

const Auth = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const Browse = lazy(() => import("./pages/Browse"));
const Search = lazy(() => import("./pages/Search"));
const MovieDetail = lazy(() => import("./pages/MovieDetail"));
const TVDetail = lazy(() => import("./pages/TVDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Reckon = lazy(() => import("./pages/Reckon"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Movies = lazy(() => import("./pages/Movies"));
const Series = lazy(() => import("./pages/Series"));

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
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <Routes>
                  <Route path="/" element={<Auth />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/home" element={<Home />} />
                  <Route path="/browse" element={<Browse />} />
                  <Route path="/browse/movies" element={<Navigate to="/browse?type=all" replace />} />
                  <Route path="/browse/bollywood" element={<Navigate to="/browse?type=bollywood" replace />} />
                  <Route path="/browse/hollywood" element={<Navigate to="/browse?type=hollywood" replace />} />
                  <Route path="/browse/tv" element={<Navigate to="/browse?type=tv" replace />} />
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
