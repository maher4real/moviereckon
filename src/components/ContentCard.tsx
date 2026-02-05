import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Heart } from "lucide-react";
import { Movie, TVShow, getPosterUrl, getLanguageLabel } from "@/lib/tmdb";
import { useUserData } from "@/hooks/useUserData";
import { cn } from "@/lib/utils";
import MediaImage from "@/components/MediaImage";

interface ContentCardProps {
  item: Movie | TVShow;
  type: "movie" | "tv" | "mixed";
  showActions?: boolean;
}

function ContentCardComponent({ item, type, showActions = true }: ContentCardProps) {
  const navigate = useNavigate();
  const { isWatched, isLiked, addToWatchHistory, toggleLike } = useUserData();
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [watchAnimating, setWatchAnimating] = useState(false);

  const isTV = "first_air_date" in item;
  const itemType = type === "mixed" ? (isTV ? "tv" : "movie") : type;
  const contentType = itemType as "movie" | "tv";

  const title = "title" in item ? item.title : item.name;
  const year = ("release_date" in item ? item.release_date : item.first_air_date)?.split("-")[0] || "";

  const watched = isWatched(item.id, contentType);
  const liked = isLiked(item.id, contentType);

  const handleClick = () => {
    navigate(`/${itemType}/${item.id}`);
  };

  const handleWatched = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!watched) {
      setWatchAnimating(true);
      setTimeout(() => setWatchAnimating(false), 300);
      await addToWatchHistory({
        content_id: item.id,
        content_type: contentType,
        title,
        poster_path: item.poster_path,
        genres: item.genre_ids || [],
        language: item.original_language || "en",
      });
    }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 300);
    await toggleLike({
      content_id: item.id,
      content_type: contentType,
      title,
      poster_path: item.poster_path,
    });
  };

  const getLangBadgeClass = (lang: string) => {
    switch (lang) {
      case "hi":
        return "badge-hindi";
      case "en":
        return "badge-english";
      case "ta":
        return "badge-tamil";
      case "te":
        return "badge-telugu";
      case "gu":
        return "badge-gujarati";
      default:
        return "bg-muted";
    }
  };

  return (
    <div
      onClick={handleClick}
      className="flex-shrink-0 w-[140px] md:w-[180px] lg:w-[200px] cursor-pointer group/card"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
        <MediaImage
          src={getPosterUrl(item.poster_path, "medium")}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
          fallbackSrc="/fallbacks/poster.svg"
        />

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center glow-primary">
            <span className="text-xl">▶</span>
          </div>
        </div>

        {/* Action Buttons - Red themed for consistency */}
        {showActions && (
          <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-all duration-200 transform translate-y-2 group-hover/card:translate-y-0">
            <button
              onClick={handleWatched}
              className={cn(
                "flex-1 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 action-btn transition-all",
                watched
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/80 text-foreground hover:bg-primary/20 hover:text-primary",
                watchAnimating && "animate-watched-pop"
              )}
              title={watched ? "Watched" : "Mark as watched"}
            >
              <Eye className={cn("w-3 h-3", watchAnimating && "animate-pulse")} />
              {watched ? "Watched" : "Watch"}
            </button>
            <button
              onClick={handleLike}
              className={cn(
                "p-1.5 rounded action-btn transition-all",
                liked
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/80 text-foreground hover:bg-primary/20 hover:text-primary",
                likeAnimating && "animate-heart-pop"
              )}
              title={liked ? "Unlike" : "Like"}
            >
              <Heart className={cn("w-3 h-3", liked && "fill-current", likeAnimating && "animate-pulse")} />
            </button>
          </div>
        )}

        {/* Rating Badge */}
        {item.vote_average > 0 && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
            ⭐ {item.vote_average.toFixed(1)}
          </div>
        )}

        {/* Language Badge */}
        <div
          className={cn(
            "absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold",
            getLangBadgeClass(item.original_language)
          )}
        >
          {getLanguageLabel(item.original_language).slice(0, 2).toUpperCase()}
        </div>

        {/* Watched Indicator */}
        {watched && (
          <div className="absolute inset-0 bg-background/40 flex items-center justify-center pointer-events-none">
            <div className="bg-primary rounded-full p-2">
              <Eye className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{year}</p>
    </div>
  );
}

export const ContentCard = memo(ContentCardComponent);
export default ContentCard;
