import { memo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, Sparkles, Bookmark } from "lucide-react";
import { Movie, TVShow, getPosterUrl, getLanguageLabel } from "@/shared/lib/tmdb";
import { useUserData } from "@/frontend/hooks/useUserData";
import { useWatchlist } from "@/frontend/hooks/useWatchlist";
import { useIsMobile } from "@/frontend/hooks/use-mobile";
import { cn } from "@/shared/lib/utils";
import MediaImage from "@/frontend/components/MediaImage";
import ContentReactionButtons from "@/frontend/components/ContentReactionButtons";
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover";
import { RecommendationReason } from "@/shared/lib/recommendation";

export interface WatchlistFlyEventDetail {
  x: number;
  y: number;
  width: number;
  height: number;
  posterUrl: string;
}

interface ContentCardProps {
  item: Movie | TVShow;
  type: "movie" | "tv" | "mixed";
  showActions?: boolean;
  recommendationReasons?: RecommendationReason[];
  recommendationSeedTitle?: string | null;
}

function ContentCardComponent({
  item,
  type,
  showActions = true,
  recommendationReasons = [],
  recommendationSeedTitle = null,
}: ContentCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isWatched, addToWatchHistory } = useUserData();
  const { isInWatchlist, toggleItem: toggleWatchlist } = useWatchlist();
  const isMobile = useIsMobile();
  const posterRef = useRef<HTMLDivElement>(null);
  const [watchAnimating, setWatchAnimating] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);

  const isTV = "first_air_date" in item;
  const itemType = type === "mixed" ? (isTV ? "tv" : "movie") : type;
  const contentType = itemType as "movie" | "tv";

  const title = "title" in item ? item.title : item.name;
  const year = ("release_date" in item ? item.release_date : item.first_air_date)?.split("-")[0] || "";

  const watched = isWatched(item.id, contentType);
  const bookmarked = isInWatchlist(item.id, contentType);

  const handleClick = () => {
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/${itemType}/${item.id}`, { state: { from: fromPath } });
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

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!bookmarked && posterRef.current) {
      // Trigger fly animation before actual state update
      const rect = posterRef.current.getBoundingClientRect();
      const eventDetail: WatchlistFlyEventDetail = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        posterUrl: getPosterUrl(item.poster_path, "medium"),
      };
      window.dispatchEvent(new CustomEvent("watchlist-fly-anim", { detail: eventDetail }));
    }

    setBookmarkAnimating(true);
    setTimeout(() => setBookmarkAnimating(false), 300);
    await toggleWatchlist({
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

  const handleDragStart = (e: React.DragEvent) => {
    if (isMobile) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      "application/x-watchlist-item",
      JSON.stringify({
        content_id: item.id,
        content_type: contentType,
        title,
        poster_path: item.poster_path,
      }),
    );
  };

  return (
    <div
      onClick={handleClick}
      draggable={!isMobile}
      onDragStart={handleDragStart}
      className="min-w-0 w-full cursor-pointer group/card"
    >
      {/* Poster */}
      <div ref={posterRef} className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
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
            <ContentReactionButtons
              contentId={item.id}
              contentType={contentType}
              title={title}
              posterPath={item.poster_path}
              genres={item.genre_ids || []}
              language={item.original_language || "en"}
              size="compact"
            />
            <button
              onClick={handleBookmark}
              className={cn(
                "p-1.5 rounded action-btn transition-all",
                bookmarked
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/80 text-foreground hover:bg-primary/20 hover:text-primary",
                bookmarkAnimating && "animate-heart-pop"
              )}
              title={bookmarked ? "Remove from Watchlist" : "Add to Watchlist"}
            >
              <Bookmark className={cn("w-3 h-3", bookmarked && "fill-current", bookmarkAnimating && "animate-pulse")} />
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{year}</p>
        {recommendationReasons.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                <Sparkles className="h-3 w-3" />
                Why This
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-72 overflow-hidden border border-primary/30 p-0"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-border/60 bg-muted/40 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Why This Pick
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {recommendationSeedTitle
                    ? `Because you liked ${recommendationSeedTitle}`
                    : "Because this matches your taste profile"}
                </p>
              </div>
              <div className="space-y-2 px-3 py-3">
                {recommendationReasons.slice(0, 3).map((reason, index) => (
                  <div
                    key={`${reason.label}-${index}`}
                    className="rounded-lg border border-border/60 bg-background/80 px-2.5 py-2"
                  >
                    <p className="text-xs font-medium text-foreground">{reason.label}</p>
                    {reason.evidence ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {reason.evidence}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

export const ContentCard = memo(ContentCardComponent);
export default ContentCard;
