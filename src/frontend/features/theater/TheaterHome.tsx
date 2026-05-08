import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import { Button } from "@/frontend/components/ui/button";
import { Play, Star, Settings, Film, HardDrive, Video } from "lucide-react";
import { useAuth } from "@/frontend/hooks/useAuth";

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
  const res = await fetch("/api/theater", { headers: { "x-requested-with": "XMLHttpRequest" } });
  if (!res.ok) throw new Error("Failed");
  return (await res.json()).movies as TheaterMovie[];
}

const FONT_URL = "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap";

export default function TheaterHome() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: movies = [], isLoading } = useQuery({
    queryKey: ["theater-movies"],
    queryFn: fetchTheaterMovies,
    staleTime: 1000 * 60 * 5,
  });

  const featured = movies[0] ?? null;
  const grid = movies.slice(1);

  return (
    <div className="app-page text-foreground">
      {/* Bebas Neue for cinematic headings */}
      <link rel="stylesheet" href={FONT_URL} />

      <style>{`
        .bebas { font-family: 'Bebas Neue', sans-serif; }
        .theater-card-img { transition: filter 0.25s ease; }
        .theater-card:hover .theater-card-img { filter: saturate(1.12) contrast(1.05); }
        .theater-card:hover .theater-play { opacity: 1; }
        .theater-play { opacity: 0; transition: opacity 0.25s ease; }
        @keyframes cinema-pulse { 0%,100%{box-shadow:0 0 0 0 hsl(var(--primary) / 0.5)} 50%{box-shadow:0 0 0 12px hsl(var(--primary) / 0)} }
        .play-pulse { animation: cinema-pulse 2s ease-in-out infinite; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.6s ease forwards; }
        .fade-up-1 { animation-delay: 0.1s; opacity: 0; }
        .fade-up-2 { animation-delay: 0.2s; opacity: 0; }
        .fade-up-3 { animation-delay: 0.35s; opacity: 0; }
        .fade-up-4 { animation-delay: 0.5s; opacity: 0; }
        .film-grain::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 1;
          opacity: 0.4;
        }
      `}</style>

      <Header />

      <main className="pt-24 pb-20 md:pb-0">

        {/* ── Cinematic page header ── */}
        <div className="relative overflow-hidden border-b border-white/5"
          style={{ background: "linear-gradient(160deg, hsl(0 79% 8%) 0%, hsl(0 0% 4%) 60%)" }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.08) 100%)" }} />
          <div className="container mx-auto px-4 md:px-8 py-8 flex items-center justify-between">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-primary/80 font-medium mb-1">MovieReckon</p>
              <h1 className="bebas text-5xl md:text-6xl tracking-wide text-white leading-none">Cinema</h1>
            </div>
            {user?.role === "admin" && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/theater/admin")}
                className="gap-2 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5">
                <Settings className="w-4 h-4" />
                Manage
              </Button>
            )}
          </div>
        </div>

        {isLoading ? <TheaterSkeleton /> : movies.length === 0 ? <EmptyState /> : (
          <>
            {/* ── Featured spotlight ── */}
            {featured && (
              <section className="relative overflow-hidden film-grain min-h-[440px] sm:min-h-[500px] md:min-h-[520px]">
                {/* Blurred backdrop */}
                {featured.thumbnail && (
                  <>
                    <img src={featured.thumbnail} alt="" aria-hidden
                      className="absolute inset-0 w-full h-full object-cover scale-110"
                      style={{ filter: "blur(28px) brightness(0.3) saturate(1.4)" }} />
                    <div className="absolute inset-0"
                      style={{ background: "linear-gradient(to right, hsl(0 0% 4% / 0.97) 30%, hsl(0 0% 4% / 0.6) 65%, transparent 100%)" }} />
                    <div className="absolute inset-0"
                      style={{ background: "linear-gradient(to top, hsl(0 0% 4%) 0%, transparent 50%)" }} />
                  </>
                )}

                <div className="relative z-10 container mx-auto px-4 md:px-8 py-8 sm:py-12 md:py-16 flex flex-col md:flex-row items-center gap-6 md:gap-12">
                  {/* Text side */}
                  <div className="flex-1 space-y-4 order-2 md:order-1 w-full">
                    <div className="fade-up fade-up-1 flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase">
                        Featured
                      </span>
                      {featured.genre && (
                        <span className="text-xs text-muted-foreground tracking-wider uppercase">{featured.genre}</span>
                      )}
                    </div>

                    <h2 className="bebas fade-up fade-up-2 text-[2.6rem] sm:text-5xl md:text-7xl leading-none tracking-wide text-white" style={{ textShadow: "0 4px 24px hsl(0 0% 0% / 0.5)" }}>
                      {featured.title}
                    </h2>

                    <div className="fade-up fade-up-3 flex flex-wrap items-center gap-3 text-sm">
                      {featured.rating > 0 && (
                        <span className="flex items-center gap-1.5 text-primary font-semibold">
                          <Star className="w-4 h-4" fill="currentColor" />
                          {featured.rating.toFixed(1)}
                        </span>
                      )}
                      {featured.year > 0 && <span className="text-muted-foreground">{featured.year}</span>}
                      <SourceBadge source={featured.source} />
                    </div>

                    {featured.description && (
                      <p className="fade-up fade-up-4 text-sm md:text-base text-white/60 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-lg">
                        {featured.description}
                      </p>
                    )}

                    <div className="fade-up fade-up-4 flex flex-wrap items-center gap-3 pt-1">
                      <Button
                        size="lg"
                        className="gap-2 bg-primary hover:bg-primary/90 text-white font-semibold px-6 sm:px-8 h-11 sm:h-12 play-pulse rounded-full"
                        onClick={() => navigate(`/theater/${featured._id}`)}
                      >
                        <Play className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" />
                        Watch Now
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        className="gap-2 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 h-11 sm:h-12 rounded-full"
                        onClick={() => navigate(`/theater/${featured._id}`)}
                      >
                        More Info
                      </Button>
                    </div>
                  </div>

                  {/* Poster side */}
                  <div className="order-1 md:order-2 flex-shrink-0 fade-up fade-up-2">
                    <div
                      className="w-32 sm:w-44 md:w-56 cursor-pointer group"
                      onClick={() => navigate(`/theater/${featured._id}`)}
                      style={{ filter: "drop-shadow(0 24px 48px hsl(0 0% 0% / 0.7))" }}
                    >
                      <div className="aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/15 transition-colors duration-200 group-hover:ring-primary/45">
                        {featured.thumbnail ? (
                          <img src={featured.thumbnail} alt={featured.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Film className="w-12 h-12 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ── Films grid ── */}
            {grid.length > 0 && (
              <section className="container mx-auto px-4 md:px-8 py-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-1 h-5 rounded-full bg-primary" />
                  <h2 className="text-sm font-semibold tracking-widest uppercase text-muted-foreground">
                    All Films
                  </h2>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
                  {grid.map((movie) => (
                    <FilmCard key={movie._id} movie={movie} />
                  ))}
                </div>
              </section>
            )}

            {/* If only 1 movie, still show grid section */}
            {movies.length === 1 && (
              <section className="container mx-auto px-4 md:px-8 py-6">
                <p className="text-center text-xs text-muted-foreground/50 tracking-widest uppercase">More films coming soon</p>
              </section>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function FilmCard({ movie }: { movie: TheaterMovie }) {
  const navigate = useNavigate();
  return (
    <div
      className="theater-card group cursor-pointer"
      onClick={() => navigate(`/theater/${movie._id}`)}
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted">
        {movie.thumbnail ? (
          <img src={movie.thumbnail} alt={movie.title} className="theater-card-img w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Film className="w-10 h-10 text-muted-foreground/20" />
          </div>
        )}

        {/* Always-visible bottom gradient with title */}
        <div className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to top, hsl(0 0% 0% / 0.95) 0%, hsl(0 0% 0% / 0.5) 50%, transparent 100%)" }} />

        {/* Rating top-right */}
        {movie.rating > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs">
            <Star className="w-2.5 h-2.5 text-primary" fill="currentColor" />
            <span className="text-white font-medium">{movie.rating.toFixed(1)}</span>
          </div>
        )}

        {/* Center play button on hover */}
        <div className="theater-play absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-primary/95 flex items-center justify-center shadow-lg shadow-primary/40">
            <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
          </div>
        </div>

        {/* Bottom info overlay */}
        <div className="absolute bottom-0 inset-x-0 p-3">
          <p className="text-sm font-semibold text-white truncate leading-tight">{movie.title}</p>
          <div className="flex items-center gap-2 mt-1">
            {movie.year > 0 && <span className="text-xs text-white/50">{movie.year}</span>}
            {movie.genre && <span className="text-xs text-white/40 truncate">{movie.genre}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: "youtube" | "gdrive" }) {
  if (source === "youtube") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
        <Video className="w-3 h-3" />
        YouTube
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
      <HardDrive className="w-3 h-3" />
      Drive
    </span>
  );
}

function TheaterSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[520px] bg-gradient-to-b from-muted/30 to-transparent" />
      <div className="container mx-auto px-4 md:px-8 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
      <Film className="w-16 h-16 opacity-20" />
      <p className="text-sm tracking-widest uppercase opacity-50">No films yet</p>
    </div>
  );
}
