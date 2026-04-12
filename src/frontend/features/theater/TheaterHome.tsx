import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { Clapperboard, Play, Settings, Star } from "lucide-react";
import { useAuth } from "@/frontend/hooks/useAuth";
import { cn } from "@/shared/lib/utils";

interface TheaterMovie {
  _id: string;
  title: string;
  description: string;
  thumbnail: string;
  genre: string;
  year: number;
  rating: number;
  videoUrl: string;
  source: "youtube" | "gdrive";
  cast: { name: string; role: string; photo: string }[];
  createdAt: string;
}

async function fetchTheaterMovies(): Promise<TheaterMovie[]> {
  const res = await fetch("/api/theater", {
    headers: { "x-requested-with": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error("Failed to fetch theater movies");
  const data = await res.json();
  return data.movies as TheaterMovie[];
}

export default function TheaterHome() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: movies = [], isLoading } = useQuery({
    queryKey: ["theater-movies"],
    queryFn: fetchTheaterMovies,
    staleTime: 1000 * 60 * 5,
  });

  const recentlyAdded = movies.slice(0, 6);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="pt-16 pb-20 md:pb-0">
        {/* Hero banner */}
        <section className="relative flex items-end px-4 md:px-8 py-12 overflow-hidden"
          style={{ minHeight: "30vh", background: "linear-gradient(135deg, hsl(0 79% 10%) 0%, hsl(0 0% 4%) 100%)" }}>
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Clapperboard className="w-5 h-5 text-primary" />
              <span className="text-primary text-sm font-semibold tracking-widest uppercase">MovieReckon Cinema</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-3">Theater Mode</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Stream curated movies directly. No ads, no fuss.
            </p>
          </div>
          {/* decorative glow */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 80% 50%, hsl(0 79% 52% / 0.08) 0%, transparent 70%)" }} />
        </section>

        <div className="container mx-auto px-4 md:px-8 py-8 space-y-10">
          {/* Admin link */}
          {user?.role === "admin" && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/theater/admin")}
                className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
              >
                <Settings className="w-4 h-4" />
                Manage Cinema
              </Button>
            </div>
          )}

          {/* Recently Added */}
          {recentlyAdded.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 text-foreground/80">Recently Added</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {recentlyAdded.map((movie) => (
                  <TheaterCard key={movie._id} movie={movie} />
                ))}
              </div>
            </section>
          )}

          {/* All Movies */}
          <section>
            <h2 className="text-lg font-semibold mb-4 text-foreground/80">All Movies</h2>
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : movies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                <Clapperboard className="w-12 h-12 opacity-30" />
                <p>No movies yet. Check back soon.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {movies.map((movie) => (
                  <TheaterCard key={movie._id} movie={movie} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}

function TheaterCard({ movie }: { movie: TheaterMovie }) {
  const navigate = useNavigate();

  return (
    <div
      className="group/card relative cursor-pointer min-w-0 w-full"
      onClick={() => navigate(`/theater/${movie._id}`)}
    >
      <div className="poster-card relative aspect-[2/3] rounded-lg overflow-hidden bg-muted">
        <MediaImage
          src={movie.thumbnail}
          alt={movie.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105"
          fallbackClassName="w-full h-full"
        />
        {/* hover overlay */}
        <div className={cn(
          "absolute inset-0 bg-black/60 flex items-center justify-center",
          "opacity-0 group-hover/card:opacity-100 transition-opacity duration-200"
        )}>
          <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
          </div>
        </div>
        {/* rating badge */}
        {movie.rating > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 rounded px-1.5 py-0.5 text-xs">
            <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
            <span className="text-white font-medium">{movie.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-sm font-medium truncate text-foreground group-hover/card:text-primary transition-colors">
          {movie.title}
        </p>
        {movie.year > 0 && (
          <p className="text-xs text-muted-foreground">{movie.year}</p>
        )}
      </div>
    </div>
  );
}
