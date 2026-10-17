import { Bookmark, Check, Play } from "lucide-react";
import ContentReactionButtons from "@/frontend/components/ContentReactionButtons";
import MediaImage from "@/frontend/components/MediaImage";
import ShareContentButton from "@/frontend/components/ShareContentButton";
import { Button } from "@/frontend/components/ui/button";
import type { DetailLibrary } from "@/frontend/features/browse/useDetailLibrary";
import { getPosterUrl } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

type ShareDetails = Parameters<typeof ShareContentButton>[0];

/** Large poster shown beside the details on tablet and desktop. */
export function DetailPoster({ title, posterPath }: { title: string; posterPath: string | null }) {
  return (
    <div className="hidden md:block flex-shrink-0">
      <MediaImage
        src={getPosterUrl(posterPath, "large")}
        alt={title}
        className="w-[280px] rounded-lg border border-white/10 shadow-2xl shadow-black/45 lg:w-[320px]"
        fallbackSrc="/fallbacks/poster.svg"
        width={500}
        height={750}
        sizes="(min-width: 1024px) 320px, (min-width: 768px) 280px, 128px"
      />
    </div>
  );
}

/** Title block: poster + title on phones, title + tagline on larger screens. */
export function DetailTitle({ title, tagline, posterPath, share }: {
  title: string;
  tagline?: string | null;
  posterPath: string | null;
  share: ShareDetails;
}) {
  return (
    <>
      <div className="md:hidden flex gap-4 mb-6">
        <MediaImage
          src={getPosterUrl(posterPath, "medium")}
          alt={title}
          className="w-32 rounded-lg shadow-lg"
          fallbackSrc="/fallbacks/poster.svg"
          width={342}
          height={513}
          sizes="128px"
        />
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          {tagline && <p className="text-muted-foreground italic text-sm">{tagline}</p>}
          <ShareContentButton {...share} size="sm" className="detail-share-button mt-3" />
        </div>
      </div>

      <div className="hidden md:block mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-4xl lg:text-5xl font-bold mb-3">{title}</h1>
            {tagline && <p className="text-xl text-muted-foreground italic">{tagline}</p>}
          </div>
          <ShareContentButton {...share} size="sm" className="detail-share-button mt-1 shrink-0" />
        </div>
      </div>
    </>
  );
}

const QUIET = "bg-muted text-foreground hover:bg-primary/20 hover:text-primary";
const ACTIVE = "bg-primary/15 text-foreground ring-1 ring-inset ring-primary/40 hover:bg-primary/20";

/** Trailer, watchlist, watched and reaction controls. */
export function DetailActions({ library, hasTrailer, onTrailer, reaction }: {
  library: DetailLibrary;
  hasTrailer: boolean;
  onTrailer: () => void;
  reaction: Parameters<typeof ContentReactionButtons>[0];
}) {
  const { watched, bookmarked, watchAnimating, bookmarkAnimating, markWatched, toggleWatchlist } = library;
  return (
    <div className="detail-actions mb-8 flex flex-wrap gap-2.5">
      {hasTrailer && (
        <Button size="lg" className="brand-primary-button text-primary-foreground action-btn" onClick={onTrailer}>
          <Play className="w-5 h-5 mr-2 fill-current" />
          Watch Trailer
        </Button>
      )}
      <Button
        size="lg"
        className={cn("action-btn", bookmarked ? ACTIVE : QUIET, bookmarkAnimating && "animate-heart-pop")}
        onClick={toggleWatchlist}
        aria-pressed={bookmarked}
      >
        <Bookmark className={cn("w-5 h-5 mr-2", bookmarked && "fill-current")} />
        {bookmarked ? "Watchlisted" : "Watchlist"}
      </Button>
      <Button
        size="lg"
        className={cn("action-btn", watched ? ACTIVE : QUIET, watchAnimating && "animate-watched-pop")}
        onClick={markWatched}
        aria-pressed={watched}
      >
        <Check className="w-5 h-5 mr-2" />
        {watched ? "Watched" : "Mark as Watched"}
      </Button>
      <ContentReactionButtons {...reaction} />
    </div>
  );
}
