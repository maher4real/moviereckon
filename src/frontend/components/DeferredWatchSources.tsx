import { lazy, Suspense, useState } from "react";
import { Play } from "lucide-react";
import type { SourceMediaType } from "@/shared/types/watchSources";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import LoadingIndicator from "./LoadingIndicator";

const DetailWatchSection = lazy(() => import("./DetailWatchSection"));

export interface DetailWatchProps {
  contentId: number;
  contentType: SourceMediaType;
  title: string;
  variant?: "content" | "season" | "episode";
  season?: number;
  episode?: number;
}

function DeferredContent(props: DetailWatchProps) {
  const [open, setOpen] = useState(false);
  const primary = !props.variant || props.variant === "content";
  const label = props.variant === "episode" ? `Watch episode ${props.episode}` :
    props.variant === "season" ? `Watch season ${props.season}` : props.contentType === "movie" ? "Watch movie" : "Watch series";
  return <div className={primary ? undefined : "px-4 py-3"}>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant={primary ? "default" : "outline"} className="min-h-11 gap-2 px-5">
        <Play className="h-4 w-4" aria-hidden="true" />{label}
      </Button></DialogTrigger>
      {open && <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl [&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center">
        <div className="border-b border-border px-5 py-5 pr-12 sm:px-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Watch & download</p>
          <DialogTitle className="break-words text-xl sm:text-2xl">{props.title}</DialogTitle>
          <DialogDescription className="mt-2">Choose a source. Links are checked when you play or download.</DialogDescription>
        </div>
        <Suspense fallback={<LoadingIndicator label="Opening link search…" className="min-h-48 justify-center" />}>
          <DetailWatchSection {...props} />
        </Suspense>
      </DialogContent>}
    </Dialog>
  </div>;
}

export default function DeferredWatchSources(props: DetailWatchProps) {
  return <DeferredContent key={`${props.contentType}:${props.contentId}:${props.variant}:${props.season}:${props.episode}`} {...props} />;
}
