// MovieReckon - Netflix-inspired movie recommendation platform
// Version: 2.1.0 - Enhanced recommendations and UI polish
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { UserDataProvider } from "@/hooks/useUserData";
import ErrorBoundary from "@/components/ErrorBoundary";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Browse from "./pages/Browse";
import Search from "./pages/Search";
import MovieDetail from "./pages/MovieDetail";
import TVDetail from "./pages/TVDetail";
import Profile from "./pages/Profile";
import Reckon from "./pages/Reckon";
import NotFound from "./pages/NotFound";
import Movies from "./pages/Movies";
import Series from "./pages/Series";

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
            </BrowserRouter>
          </TooltipProvider>
        </UserDataProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
