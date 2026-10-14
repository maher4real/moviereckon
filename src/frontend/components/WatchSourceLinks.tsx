import { Download, ExternalLink, Play } from "lucide-react";
import { episodeSourceLinks } from "@/shared/lib/watchSources";
import type { WatchSourceLink } from "@/shared/types/watchSources";
import { Button } from "@/frontend/components/ui/button";

function SourceLink({ link, context }: { link: WatchSourceLink; context: string }) {
  const isWatch = link.kind === "watch";
  const range = link.scope === "episode-range" ? `Episodes ${link.episode}–${link.episodeEnd}` : null;
  const label = /^watch$/i.test(link.label) ? "Watch" : link.label;
  const metadata = [range, link.quality, link.codec, link.size, link.host].filter(Boolean).join(" · ");
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      aria-label={`${isWatch ? "Watch" : link.kind === "download" ? "Download" : "View"} ${context}: ${link.label}${range ? `, ${range}` : ""} on ${link.host}`}
      className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isWatch ? "border-primary/35 bg-primary/10 hover:bg-primary/20" : "border-border bg-muted/40 hover:border-primary/50 hover:bg-muted"}`}>
      {isWatch ? <Play className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <Download className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block break-words font-medium">{label}</span>
        <span className="block break-words text-xs text-muted-foreground">{metadata}</span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}

export function WatchSourceOptions({ links, context }: { links: WatchSourceLink[]; context: string }) {
  const watch = links.filter((link) => link.kind === "watch");
  const downloads = links.filter((link) => link.kind === "download");
  const collections = links.filter((link) => link.kind === "collection");
  return (
    <>
      {watch.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {watch.map((link) => <SourceLink key={link.id} link={link} context={context} />)}
        </div>
      )}
      {downloads.length > 0 && (
        <details className="mt-3">
          <summary className="w-fit cursor-pointer rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Download options ({downloads.length})
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {downloads.map((link) => <SourceLink key={link.id} link={link} context={context} />)}
          </div>
        </details>
      )}
      {collections.length > 0 && (
        <details className="mt-3">
          <summary className="w-fit cursor-pointer rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            More quality options ({collections.length})
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {collections.map((link) => <SourceLink key={link.id} link={link} context={context} />)}
          </div>
        </details>
      )}
    </>
  );
}

interface SectionProps {
  heading: string;
  context: string;
  links: WatchSourceLink[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
}

export function WatchLinksSection({ heading, context, links, isLoading, isError, onRetry,
  emptyMessage = "No watch links available yet." }: SectionProps) {
  return (
    <section aria-label={heading} className="surface-panel mb-8 p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Play className="h-5 w-5 text-primary" aria-hidden="true" />{heading}
      </h2>
      {isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading watch links…</p> :
        isError ? <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted-foreground">Watch links are temporarily unavailable.</p>
          {onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry watch links</Button>}
        </div> : <>
          {links.length === 0 ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : <>
            {!links.some((link) => link.kind === "watch") && <p className="text-sm text-muted-foreground">Only download options are available here.</p>}
            <WatchSourceOptions links={links} context={context} />
            {links.some((link) => link.kind === "watch") && <p className="mt-3 text-xs text-muted-foreground">Watch links open an external player.</p>}
          </>}
        </>}
    </section>
  );
}

export function EpisodeWatchLinks({ links, season, episode }: { links: WatchSourceLink[]; season: number; episode: number }) {
  const options = episodeSourceLinks(links, season, episode);
  const context = `season ${season} episode ${episode}`;
  return (
    <div aria-label={`Links for ${context}`} className="border-t border-border px-4 py-3">
      {!options.some((link) => link.kind === "watch") && <p className="text-xs text-muted-foreground">Watch link unavailable for this episode.</p>}
      <WatchSourceOptions links={options} context={context} />
    </div>
  );
}
