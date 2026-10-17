import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Play, Star, Settings, Film, HardDrive, Video, Info, Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/frontend/hooks/useAuth";
import { Skeleton } from "@/frontend/components/ui/skeleton";

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

export default function TheaterHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [genre, setGenre] = useState("all");
  const [filter, setFilter] = useState("");

  const { data: movies = [], isLoading } = useQuery({
    queryKey: ["theater-movies"],
    queryFn: fetchTheaterMovies,
    staleTime: 1000 * 60 * 5,
  });

  const genres = useMemo(
    () => [...new Set(movies.flatMap((movie) => (movie.genre || "").split(/[,/|]/).map((g) => g.trim()).filter(Boolean)))].sort(),
    [movies],
  );
  const featured = movies[0] ?? null;
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return movies.filter((movie) =>
      (genre === "all" || (movie.genre || "").toLowerCase().includes(genre.toLowerCase())) &&
      (!needle || movie.title.toLowerCase().includes(needle)));
  }, [filter, genre, movies]);

  return (
    <div className="app-page text-foreground">
      <Header />

      <main className="flex-1 pb-20 md:pb-12">
        {isLoading ? <TheaterSkeleton /> : movies.length === 0 ? (
          <>
            <TheaterHeading isAdmin={user?.role === "admin"} onManage={() => navigate("/theater/admin")} />
            <EmptyState />
          </>
        ) : (
          <>
            {featured && (
              <section className="theater-feature" aria-label="Featured film">
                {featured.thumbnail && (
                  <img src={featured.thumbnail} alt="" aria-hidden="true" className="theater-feature-art" />
                )}
                <div className="theater-feature-scrim" aria-hidden="true" />
                <div className="relative z-10 container mx-auto flex flex-col items-center gap-6 px-4 pb-10 pt-28 md:flex-row md:gap-12 md:px-8 md:pb-16 md:pt-32">
                  <div className="order-2 w-full flex-1 space-y-4 md:order-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="page-kicker">MovieReckon Theater</span>
                      {user?.role === "admin" && (
                        <Button variant="ghost" size="sm" onClick={() => navigate("/theater/admin")} className="gap-2 rounded-full border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground">
                          <Settings className="size-4" />Manage
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-primary">Featured</span>
                      {featured.genre && <span className="text-xs uppercase tracking-wider text-muted-foreground">{featured.genre}</span>}
                    </div>
                    <h1 className="text-balance text-4xl font-black leading-none tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">{featured.title}</h1>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {featured.rating > 0 && (
                        <span className="flex items-center gap-1.5 font-semibold text-[hsl(var(--rating-gold))]">
                          <Star className="size-4" fill="currentColor" />{featured.rating.toFixed(1)}
                        </span>
                      )}
                      {featured.year > 0 && <span className="text-muted-foreground">{featured.year}</span>}
                      <SourceBadge source={featured.source} />
                    </div>
                    {featured.description && (
                      <p className="line-clamp-3 max-w-lg text-sm leading-relaxed text-white/65 md:text-base">{featured.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Button size="lg" className="brand-primary-button h-12 gap-2 rounded-full px-7 font-semibold" onClick={() => navigate(`/theater/${featured._id}/play`)}>
                        <Play className="size-5" fill="currentColor" />Watch now
                      </Button>
                      <Button variant="ghost" size="lg" className="h-12 gap-2 rounded-full border border-white/15 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => navigate(`/theater/${featured._id}`)}>
                        <Info className="size-5" />Details
                      </Button>
                    </div>
                  </div>
                  <button type="button" onClick={() => navigate(`/theater/${featured._id}`)} className="order-1 w-36 shrink-0 sm:w-44 md:order-2 md:w-60" aria-label={`Open ${featured.title}`}>
                    <div className="aspect-2/3 overflow-hidden rounded-xl shadow-[0_24px_48px_hsl(0_0%_0%/0.7)] ring-1 ring-white/15 transition-colors hover:ring-primary/50">
                      {featured.thumbnail ? (
                        <img src={featured.thumbnail} alt={featured.title} className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-muted"><Film className="size-12 text-muted-foreground/30" /></div>
                      )}
                    </div>
                  </button>
                </div>
              </section>
            )}

            <section className="container mx-auto px-4 py-10 md:px-8" aria-labelledby="theater-library">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 id="theater-library" className="text-2xl font-bold tracking-tight">All films</h2>
                  <p className="text-sm text-muted-foreground">{visible.length} of {movies.length} titles</p>
                </div>
                <label className="relative w-full sm:w-64">
                  <span className="sr-only">Filter films by title</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by title" className="h-11 rounded-full pl-9" />
                </label>
              </div>
              {genres.length > 1 && (
                <div className="filter-row mb-6 gap-1.5" aria-label="Genre">
                  {["all", ...genres].map((value) => (
                    <button key={value} type="button" aria-pressed={genre === value} onClick={() => setGenre(value)}
                      className={cn("browse-genre-chip", genre === value && "browse-genre-chip-active")}>
                      {value === "all" ? "All genres" : value}
                    </button>
                  ))}
                </div>
              )}
              {visible.length === 0 ? (
                <div className="empty-state"><p className="text-muted-foreground">No films match these filters.</p></div>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-5 lg:grid-cols-5 xl:grid-cols-6">
                  {visible.map((movie) => <li key={movie._id}><FilmCard movie={movie} /></li>)}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function TheaterHeading({ isAdmin, onManage }: { isAdmin: boolean; onManage: () => void }) {
  return (
    <div className="container mx-auto flex items-end justify-between gap-4 px-4 pb-4 pt-28 md:px-8">
      <div>
        <p className="page-kicker">MovieReckon</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] md:text-5xl">Theater</h1>
      </div>
      {isAdmin && (
        <Button variant="ghost" size="sm" onClick={onManage} className="gap-2 rounded-full border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground">
          <Settings className="size-4" />Manage
        </Button>
      )}
    </div>
  );
}

function FilmCard({ movie }: { movie: TheaterMovie }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="theater-card group block w-full text-left"
      onClick={() => navigate(`/theater/${movie._id}`)}
      aria-label={`Open ${movie.title}`}
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
            <Star className="size-2.5 text-[hsl(var(--rating-gold))]" fill="currentColor" />
            <span className="text-white font-medium">{movie.rating.toFixed(1)}</span>
          </div>
        )}

        {/* Center play button on hover */}
        <div className="theater-play poster-hover-scrim absolute inset-0 flex items-center justify-center">
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
    </button>
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
    <div role="status" aria-busy="true" className="pt-16">
      <span className="sr-only">Loading the Theater catalogue</span>
      <div className="relative h-[480px] overflow-hidden" aria-hidden="true">
        <Skeleton className="absolute inset-0 rounded-none opacity-60" />
        <div className="container relative mx-auto flex h-full items-center gap-10 px-4 md:px-8">
          <div className="flex-1 space-y-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-14 w-4/5 max-w-lg" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-3/4 max-w-md" />
            <Skeleton className="mt-4 h-12 w-40 rounded-full" />
          </div>
          <Skeleton className="hidden aspect-2/3 w-56 rounded-xl md:block" />
        </div>
      </div>
      <div className="container mx-auto px-4 py-10 md:px-8" aria-hidden="true">
        <Skeleton className="mb-6 h-7 w-36" />
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-2/3 rounded-xl" />
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
