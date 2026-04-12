import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { ArrowLeft, Play, Star, Calendar, Tag, Users } from "lucide-react";

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
  const data = await res.json();
  return data.movie as TheaterMovie;
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
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="pt-16 container mx-auto px-4 py-10">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="flex gap-6">
              <div className="w-48 aspect-[2/3] bg-muted rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-4">
                <div className="h-10 w-3/4 bg-muted rounded" />
                <div className="h-4 w-1/2 bg-muted rounded" />
                <div className="h-24 bg-muted rounded" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (isError || !movie) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="pt-16 container mx-auto px-4 py-10 text-center">
          <p className="text-muted-foreground mb-4">Movie not found.</p>
          <Button onClick={() => navigate("/theater")}>Back to Cinema</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="pt-16 pb-20 md:pb-0">
        {/* Backdrop blurred bg */}
        {movie.thumbnail && (
          <div className="absolute inset-0 top-16 z-0 pointer-events-none overflow-hidden" style={{ height: "60vh" }}>
            <img
              src={movie.thumbnail}
              alt=""
              className="w-full h-full object-cover opacity-15 blur-2xl scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
          </div>
        )}

        <div className="relative z-10 container mx-auto px-4 md:px-8 py-6 space-y-8">
          {/* Back button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cinema
          </Button>

          {/* Hero */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-10">
            {/* Poster */}
            <div className="flex-shrink-0 w-40 md:w-56 mx-auto md:mx-0">
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-muted shadow-2xl ring-1 ring-white/10">
                <MediaImage
                  src={movie.thumbnail}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 space-y-4">
              <h1 className="text-2xl md:text-4xl font-bold">{movie.title}</h1>

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {movie.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
                    <span className="text-foreground font-semibold">{movie.rating.toFixed(1)}</span>
                  </span>
                )}
                {movie.year > 0 && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {movie.year}
                  </span>
                )}
                {movie.genre && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-4 h-4" />
                    {movie.genre}
                  </span>
                )}
              </div>

              {/* Description */}
              {movie.description && (
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">
                  {movie.description}
                </p>
              )}

              {/* Play button */}
              <Button
                size="lg"
                className="gap-2 btn-primary mt-2"
                onClick={() => navigate(`/theater/${movie._id}/play`, { state: { from: location.pathname } })}
              >
                <Play className="w-5 h-5" fill="currentColor" />
                Play Now
              </Button>
            </div>
          </div>

          {/* Cast & Crew */}
          {movie.cast && movie.cast.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Cast &amp; Crew</h2>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {movie.cast.map((member, i) => (
                  <CastCard key={i} member={member} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}

function CastCard({ member }: { member: TheaterCastMember }) {
  return (
    <div className="flex-shrink-0 w-24 text-center space-y-2">
      <div className="w-16 h-16 mx-auto rounded-full overflow-hidden bg-muted ring-2 ring-white/10">
        <MediaImage
          src={member.photo}
          alt={member.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div>
        <p className="text-xs font-medium truncate">{member.name}</p>
        <p className="text-xs text-muted-foreground truncate">{member.role}</p>
      </div>
    </div>
  );
}
