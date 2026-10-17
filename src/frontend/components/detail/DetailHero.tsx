import { ArrowLeft, Play, X } from "lucide-react";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import type { DetailMedia } from "@/frontend/features/browse/useDetailMedia";
import { getBackdropUrl } from "@/shared/lib/tmdb";

const YOUTUBE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

/** Backdrop with an optional muted background trailer and a play overlay. */
export function DetailHero({ media, title, backdropPath }: {
  media: DetailMedia;
  title: string;
  backdropPath: string | null;
}) {
  const {
    heroMediaRef, bgPlayerRef, bgFrameSize, backgroundTrailerEmbedUrl, activeBgVideoKey,
    isBackgroundVideoVisible, shouldLoadBackgroundVideo, controlBackgroundPreview,
    trailerModalKey, openTrailerModal, handleBack,
  } = media;

  return (
    <div
      ref={heroMediaRef}
      className="detail-hero-media relative overflow-hidden group/hero"
    >
      <MediaImage
        src={getBackdropUrl(backdropPath, "large")}
        alt={`${title} visual`}
        className="absolute inset-0 w-full h-full object-cover"
        fallbackSrc="/fallbacks/backdrop.svg"
        width={1280}
        height={720}
        sizes="100vw"
        priority
        fadeIn
      />
      {backgroundTrailerEmbedUrl && isBackgroundVideoVisible && shouldLoadBackgroundVideo && (
        <div className="absolute inset-0">
          <iframe
            key={activeBgVideoKey}
            ref={bgPlayerRef}
            src={backgroundTrailerEmbedUrl}
            title={`${title} background trailer`}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ width: `${bgFrameSize.width}px`, height: `${bgFrameSize.height}px`, willChange: "transform" }}
            allow={YOUTUBE_ALLOW}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              controlBackgroundPreview("addEventListener", ["onStateChange"]);
              controlBackgroundPreview("addEventListener", ["onError"]);
              controlBackgroundPreview("mute");
              controlBackgroundPreview("playVideo");
            }}
            tabIndex={-1}
          />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/55 to-background/10" />
      <div className="absolute inset-0 hero-gradient" />

      {trailerModalKey && (
        <div className="absolute inset-0 z-[7] hidden md:block pointer-events-none bg-black/0 opacity-0 transition-opacity duration-300 group-hover/hero:opacity-100 group-hover/hero:bg-black/45" />
      )}

      {trailerModalKey && (
        <div className="absolute inset-0 z-10 hidden md:flex items-center justify-center pointer-events-none">
          <Button
            type="button"
            size="icon"
            onClick={openTrailerModal}
            className="pointer-events-auto h-16 w-16 rounded-full bg-background/70 border border-white/20 text-foreground backdrop-blur-md opacity-0 group-hover/hero:opacity-100 transition-all duration-300 hover:bg-primary hover:text-primary-foreground"
            aria-label={`Play ${title} trailer`}
          >
            <Play className="w-7 h-7 fill-current" />
          </Button>
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-20 left-4 z-10 bg-background/50 backdrop-blur-sm"
        aria-label="Go back"
      >
        <ArrowLeft className="w-5 h-5" />
      </Button>
    </div>
  );
}

/** Full-width trailer player dialog. */
export function TrailerDialog({ media, title }: { media: DetailMedia; title: string }) {
  const { isTrailerModalOpen, setIsTrailerModalOpen, trailerSessionId, modalTrailerEmbedUrl } = media;
  return (
    <Dialog open={isTrailerModalOpen} onOpenChange={setIsTrailerModalOpen}>
      <DialogContent className="w-[96vw] max-w-5xl gap-0 border-0 bg-transparent p-0 text-white shadow-none sm:rounded-none [&>button]:hidden">
        <DialogTitle className="sr-only">{title} trailer</DialogTitle>
        <DialogDescription className="sr-only">
          Trailer player with sound and playback controls.
        </DialogDescription>
        <div className="relative">
          <DialogClose asChild>
            <button
              type="button"
              className="brand-primary-button absolute -top-3 -right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-primary/45 text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              aria-label="Close trailer"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogClose>

          <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-primary/30 bg-black shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
            {modalTrailerEmbedUrl && (
              <iframe
                key={`trailer-${trailerSessionId}`}
                src={modalTrailerEmbedUrl}
                title={`${title} trailer`}
                className="absolute inset-0 h-full w-full"
                allow={YOUTUBE_ALLOW}
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
