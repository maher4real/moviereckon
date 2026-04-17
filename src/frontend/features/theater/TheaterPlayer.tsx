import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";

interface TheaterMovie {
  _id: string;
  title: string;
  thumbnail: string;
  videoUrl: string;
  source: "youtube" | "gdrive" | "dailymotion";
}

function getEmbedUrl(videoUrl: string, source: "youtube" | "gdrive" | "dailymotion"): string {
  if (source === "gdrive") {
    const match = videoUrl.match(/\/file\/d\/([^/]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    return videoUrl;
  }
  if (source === "dailymotion") {
    try {
      if (videoUrl.includes("dai.ly/")) {
        const id = videoUrl.split("dai.ly/")[1]?.split("?")[0];
        if (id) return `https://www.dailymotion.com/embed/video/${id}?autoplay=1`;
      }
      const url = new URL(videoUrl);
      const pathId = url.pathname.split("/video/")[1]?.split("_")[0];
      if (pathId) return `https://www.dailymotion.com/embed/video/${pathId}?autoplay=1`;
    } catch {
      // fall through
    }
    return videoUrl;
  }
  // YouTube
  try {
    if (videoUrl.includes("youtu.be/")) {
      const id = videoUrl.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    }
    const url = new URL(videoUrl);
    const id = url.searchParams.get("v");
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  } catch {
    // fall through
  }
  return videoUrl;
}

async function fetchTheaterMovie(id: string): Promise<TheaterMovie> {
  const res = await fetch(`/api/theater/${id}`, {
    headers: { "x-requested-with": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error("Movie not found");
  const data = await res.json();
  return data.movie as TheaterMovie;
}

export default function TheaterPlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: movie, isLoading, isError } = useQuery({
    queryKey: ["theater-movie", id],
    queryFn: () => fetchTheaterMovie(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 10,
  });

  const handleBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) navigate(from);
    else navigate(`/theater/${id}`);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !movie) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4 text-white">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-lg">Could not load movie.</p>
        <Button variant="outline" onClick={() => navigate("/theater")}>
          Back to Cinema
        </Button>
      </div>
    );
  }

  const embedUrl = getEmbedUrl(movie.videoUrl, movie.source);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/90 to-transparent absolute top-0 left-0 right-0 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="text-white hover:bg-white/10 rounded-full"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-white font-semibold text-sm md:text-base truncate">{movie.title}</span>
      </div>

      {/* Player */}
      <div className="flex-1 relative">
        {movie.source === "youtube" ? (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={movie.title}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : movie.source === "dailymotion" ? (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={movie.title}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        ) : (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={movie.title}
            className="absolute inset-0 w-full h-full"
            allow="autoplay"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
