import { ExternalLink, Play } from "lucide-react";
import type { WatchSourceLink } from "@/shared/types/watchSources";
import { cn } from "@/shared/lib/utils";

/** Watch on the provider's own page in a new tab; MovieReckon never plays the media itself. */
export default function WatchLinkButton({ link, context, className }: { link: WatchSourceLink; context: string; className?: string }) {
  const detail = [link.label, link.quality && !link.label.includes(link.quality) ? link.quality : null, link.host].filter(Boolean).join(" · ");
  return <a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
    aria-label={`Watch ${context}: ${link.label} (opens in a new tab)`}
    className={cn("flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card/60 p-3 text-left transition-colors hover:border-primary/50 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
    <Play className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium">Watch</span>
      <span className="block break-words text-xs text-muted-foreground">{detail}</span>
    </span>
    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </a>;
}
