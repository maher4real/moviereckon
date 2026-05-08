import { useState } from "react";
import type { MouseEvent } from "react";
import { Heart, ThumbsDown } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { getReactionMutations, type ReactionAction } from "@/frontend/lib/contentReactions";
import { useUserData } from "@/frontend/hooks/useUserData";
import { cn } from "@/shared/lib/utils";

interface ContentReactionButtonsProps {
  contentId: number;
  contentType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  genres?: number[];
  language?: string;
  size?: "compact" | "default";
  onInteract?: () => void;
}

export default function ContentReactionButtons({
  contentId,
  contentType,
  title,
  posterPath,
  genres = [],
  language = "en",
  size = "default",
  onInteract,
}: ContentReactionButtonsProps) {
  const { isLiked, toggleLike, getFeedback, setFeedback } = useUserData();
  const [activeAction, setActiveAction] = useState<ReactionAction | null>(null);

  const liked = isLiked(contentId, contentType);
  const disliked = getFeedback(contentId, contentType) === "skip";
  const isCompact = size === "compact";

  const applyReaction = async (action: ReactionAction, event?: MouseEvent) => {
    event?.stopPropagation();
    onInteract?.();
    setActiveAction(action);
    window.setTimeout(() => setActiveAction(null), isCompact ? 300 : 420);

    const mutations = getReactionMutations(
      { liked, feedback: disliked ? "skip" : getFeedback(contentId, contentType) },
      action,
    );

    for (const mutation of mutations) {
      if (mutation === "toggleLike") {
        await toggleLike({
          content_id: contentId,
          content_type: contentType,
          title,
          poster_path: posterPath,
        });
      } else {
        await setFeedback({
          content_id: contentId,
          content_type: contentType,
          feedback_type: "skip",
          title,
          poster_path: posterPath,
          genres,
          language,
        });
      }
    }
  };

  if (isCompact) {
    return (
      <>
        <button
          type="button"
          onClick={(event) => void applyReaction("like", event)}
          className={cn(
            "p-1.5 rounded action-btn transition-all",
            liked
              ? "brand-primary-button text-primary-foreground"
              : "bg-background/80 text-foreground hover:bg-primary/20 hover:text-primary",
            activeAction === "like" && "animate-heart-pop",
          )}
          title={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <Heart className={cn("w-3 h-3", liked && "fill-current", activeAction === "like" && "animate-pulse")} />
        </button>
        <button
          type="button"
          onClick={(event) => void applyReaction("dislike", event)}
          className={cn(
            "p-1.5 rounded action-btn transition-all",
            disliked
              ? "brand-primary-button text-primary-foreground"
              : "bg-background/80 text-foreground hover:bg-primary/20 hover:text-primary",
            activeAction === "dislike" && "animate-heart-pop",
          )}
          title={disliked ? "Remove dislike" : "Dislike"}
          aria-pressed={disliked}
          aria-label={disliked ? "Remove dislike" : "Dislike"}
        >
          <ThumbsDown className={cn("w-3 h-3", disliked && "fill-current", activeAction === "dislike" && "animate-pulse")} />
        </button>
      </>
    );
  }

  return (
    <>
      <Button
        size="lg"
        className={cn(
          "action-btn",
          liked
            ? "brand-primary-button text-primary-foreground"
            : "bg-muted text-foreground hover:bg-primary/20 hover:text-primary",
          activeAction === "like" && "animate-heart-pop",
        )}
        onClick={(event) => void applyReaction("like", event)}
        aria-pressed={liked}
      >
        <Heart className={cn("w-5 h-5 mr-2", liked && "fill-current")} />
        {liked ? "Liked" : "Like"}
      </Button>
      <Button
        size="lg"
        className={cn(
          "action-btn",
          disliked
            ? "brand-primary-button text-primary-foreground"
            : "bg-muted text-foreground hover:bg-primary/20 hover:text-primary",
          activeAction === "dislike" && "animate-heart-pop",
        )}
        onClick={(event) => void applyReaction("dislike", event)}
        aria-pressed={disliked}
      >
        <ThumbsDown className={cn("w-5 h-5 mr-2", disliked && "fill-current")} />
        {disliked ? "Disliked" : "Dislike"}
      </Button>
    </>
  );
}
