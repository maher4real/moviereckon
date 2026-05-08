import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { ArrowLeft, Play, Star, Calendar, Tag, Users, Film, User } from "lucide-react";

const BLOB_HOST = "public.blob.vercel-storage.com";
const FONT_URL = "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap";

function isVercelBlob(url: string) {
  try { return new URL(url).hostname.includes(BLOB_HOST); } catch { return false; }
}

function proxiedImageUrl(url: string) {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (isVercelBlob(url)) return url;
  return `/api/theater/proxy-image?url=${encodeURIComponent(url)}`;
}

interface TheaterCastMember {
  name: string;
  role: string;
  photo: string;
}

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
  cast: TheaterCastMember[];
  createdAt: string;
}

async function fetchTheaterMovie(id: string): Promise<TheaterMovie> {
  const res = await fetch(`/api/theater/${id}`, {
    headers: { "x-requested-with": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error("Movie not found");
  return (await res.json()).movie as TheaterMovie;
}

export default function TheaterDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: movie, isLoading, isError } = useQuery({
    queryKey: ["theater-movie", id],
    queryFn: () => fetchTheaterMovie(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

  const handleBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) navigate(from);
    else navigate("/theater");
  };

  if (isLoading) {
    return (
      <div className="app-page text-foreground">
        <Header />
        <main className="pt-24">
          {/* Hero skeleton */}
          <div className="relative h-[60vh] md:h-[75vh] bg-muted animate-pulse" />
          <div className="container mx-auto px-4 md:px-8 py-8 space-y-4">
            <div className="h-8 w-64 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            <div className="h-20 bg-muted rounded animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (isError || !movie) {
    return (
      <div className="app-page text-foreground">
        <Header />
        <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 pt-24">
          <Film className="w-16 h-16 text-muted-foreground/30" />
          <p className="text-muted-foreground">Movie not found.</p>
          <Button onClick={() => navigate("/theater")}>Back to Cinema</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-page text-foreground">
      <link rel="stylesheet" href={FONT_URL} />
      <style>{`.bebas { font-family: 'Bebas Neue', sans-serif; }`}</style>

      <Header />

      <main className="pb-20 md:pb-0">
        {/* ── Full-width Hero ──────────────────────────────────────────────── */}
        <section className="relative w-full h-[55vh] sm:h-[60vh] md:h-[78vh] overflow-hidden">
          {/* Backdrop */}
          {movie.thumbnail ? (
            <img
              src={movie.thumbnail}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-105"
              style={{ filter: "brightness(0.45)" }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-muted to-background" />
          )}

          {/* Gradient overlays — bottom fade + left vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />

          {/* Back button */}
          <div className="absolute top-20 left-4 md:left-8 z-10">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-2 text-white/80 hover:text-white hover:bg-white/10 backdrop-blur-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Cinema
            </Button>
          </div>

          {/* Hero content anchored to bottom-left */}
          <div className="absolute bottom-0 left-0 right-0 z-10 px-4 md:px-8 pb-8 md:pb-12">
            <div className="flex items-end gap-6 max-w-5xl">
              {/* Poster */}
              <div className="hidden md:block shrink-0 w-44 -mb-16 shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/10 bg-muted">
                <div className="aspect-2/3 relative">
                  <MediaImage
                    src={proxiedImageUrl(movie.thumbnail)}
                    alt={movie.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    priority
                    fadeIn
                  />
                </div>
              </div>

              {/* Title + meta */}
              <div className="flex-1 space-y-3 pb-2">
                {movie.genre && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase text-primary">
                    <Tag className="w-3 h-3" />
                    {movie.genre}
                  </span>
                )}
                <h1 className="bebas text-4xl sm:text-5xl md:text-6xl leading-none tracking-wide drop-shadow-lg" style={{ textShadow: "0 4px 24px hsl(0 0% 0% / 0.5)" }}>
                  {movie.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
                  {movie.rating > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
                      <span className="text-white font-semibold">{movie.rating.toFixed(1)}</span>
                    </span>
                  )}
                  {movie.year > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {movie.year}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Below-the-fold content ───────────────────────────────────────── */}
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-10 space-y-10 max-w-5xl">
          {/* On mobile show poster here since it's hidden in hero on mobile */}
          <div className="flex md:hidden justify-center -mt-8">
            <div className="w-36 sm:w-40 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-muted">
              <div className="aspect-2/3 relative">
                <MediaImage
                  src={proxiedImageUrl(movie.thumbnail)}
                  alt={movie.title}
                  className="absolute inset-0 w-full h-full object-cover"
                  priority
                  fadeIn
                />
              </div>
            </div>
          </div>

          {/* Play button + description row */}
          <div className="md:pl-52 space-y-4">
            <Button
              size="lg"
              className="gap-2 btn-primary text-base px-6 sm:px-8 h-11 sm:h-12 rounded-full"
              onClick={() =>
                navigate(`/theater/${movie._id}/play`, {
                  state: { from: location.pathname },
                })
              }
            >
              <Play className="w-5 h-5" fill="currentColor" />
              Play Now
            </Button>

            {movie.description && (
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">
                {movie.description}
              </p>
            )}
          </div>

          {/* Cast & Crew */}
          {movie.cast && movie.cast.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Users className="w-5 h-5 text-muted-foreground" />
                <h2 className="text-base font-semibold tracking-wide">Cast &amp; Crew</h2>
              </div>
              <div className="flex gap-5 overflow-x-auto pb-3 scrollbar-hide">
                {movie.cast.map((member, i) => (
                  <CastCard key={i} member={member} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function CastCard({ member }: { member: TheaterCastMember }) {
  const [failed, setFailed] = useState(false);
  const src = member.photo ? proxiedImageUrl(member.photo) : "";

  return (
    <div className="flex-shrink-0 w-24 text-center space-y-2">
      <div className="w-16 h-16 mx-auto rounded-full overflow-hidden bg-muted ring-2 ring-white/10 flex items-center justify-center">
        {src && !failed ? (
          <img
            src={src}
            alt={member.name}
            className="w-full h-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <User className="w-7 h-7 text-muted-foreground/40" />
        )}
      </div>
      <div className="px-1">
        <p className="text-xs font-medium truncate">{member.name}</p>
        <p className="text-xs text-muted-foreground truncate">{member.role}</p>
      </div>
    </div>
  );
}
