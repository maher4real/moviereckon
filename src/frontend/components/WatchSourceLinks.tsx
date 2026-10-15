import { Download, ExternalLink, Play } from "lucide-react";
import { directMediaFormat, episodeSourceLinks, isDirectFileLink, isResolvableDownload, isResolvablePlayer } from "@/shared/lib/watchSources";
import type { WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { Button } from "@/frontend/components/ui/button";
import DirectWatchPlayer from "./DirectWatchPlayer";
import ResolveDownloadButton from "./ResolveDownloadButton";
import LoadingIndicator from "./LoadingIndicator";
import type { ReactNode } from "react";

function SourceLink({ link, context }: { link: WatchSourceLink; context: string }) {
  const isWatch = link.kind === "watch";
  const range = link.scope === "episode-range" ? `Episodes ${link.episode}–${link.episodeEnd}` : null;
  const label = isWatch ? `Open external player · ${link.label}` : `Open external page · ${link.label}`;
  const episode = link.scope === "episode" ? `S${link.season} · E${link.episode}` : link.scope === "season" ? `Season ${link.season} pack` : null;
  const metadata = [episode, range, link.quality, link.codec, link.size, link.host].filter(Boolean).join(" · ");
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      aria-label={`${isWatch ? "Watch" : link.kind === "download" ? "Download" : "View"} ${context}: ${link.label}${range ? `, ${range}` : ""} on ${link.host}`}
      className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {isWatch ? <Play className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <Download className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block break-words font-medium">{label}</span>
        <span className="block break-words text-xs text-muted-foreground">{metadata}</span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}

export function WatchSourceOptions({ links, context, identity }: { links: WatchSourceLink[]; context: string; identity?: WatchSourceIdentity }) {
  const direct = links.filter((link) => (link.scope === "movie" || link.scope === "episode") &&
    (directMediaFormat(link.url) || (identity && isResolvablePlayer(link))));
  const files = links.filter((link) => isDirectFileLink(link.url));
  const resolvable = identity ? links.filter(isResolvableDownload) : [];
  const external = links.filter((link) => !files.includes(link) && (!direct.includes(link) || isResolvablePlayer(link)));
  const watch = external.filter((link) => link.kind === "watch");
  const downloads = external.filter((link) => link.kind === "download");
  const collections = external.filter((link) => link.kind === "collection");
  return (
    <>
      {direct.length > 0 ? <div className="grid gap-2 sm:grid-cols-2">
        {direct.map((link) => <DirectWatchPlayer key={link.id} link={link} identity={identity}
          context={link.scope === "episode" && context !== `season ${link.season} episode ${link.episode}` ? `${context} · S${link.season} E${link.episode}` : context} />)}
      </div> : links.length > 0 && <p className="text-sm text-muted-foreground">Direct playback is not available from these sources.</p>}
      {files.length > 0 && <div className="mt-3 space-y-2">
        {files.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" download
          className="block break-words text-sm underline">Open / save file · {link.scope === "episode" ? `S${link.season} E${link.episode} · ` : link.scope === "season" ? `Season ${link.season} pack · ` : link.scope === "episode-range" ? `Episodes ${link.episode}–${link.episodeEnd} · ` : ""}{link.label}</a>)}
        <p className="text-xs text-muted-foreground">File availability is unverified. Your browser and the host determine whether the file saves or opens.</p>
      </div>}
      {identity && resolvable.length > 0 && <div className="mt-3">
        <h3 className="mb-2 text-sm font-medium">Get a direct download</h3>
        <div className="divide-y divide-border">{resolvable.map((link) => <ResolveDownloadButton key={link.id} link={link} identity={identity} />)}</div>
      </div>}
      {external.length > 0 && <details className="mt-3">
        <summary className="min-h-11 w-fit cursor-pointer rounded py-3 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">External sites ({external.length}) · may show ads</summary>
        <p className="my-2 text-xs text-muted-foreground">These are unverified provider pages, not direct video files. They may show ads or require extra steps.</p>
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
      </details>}
    </>
  );
}

interface SectionProps {
  actions?: ReactNode;
  identity?: WatchSourceIdentity;
  heading: string;
  context: string;
  links: WatchSourceLink[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
}

export function WatchLinksSection({ heading, context, links, identity, isLoading, isError, onRetry, actions,
  emptyMessage = "No watch links available yet." }: SectionProps) {
  return (
    <section aria-label={heading} className="mb-8 min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Play className="h-5 w-5 text-primary" aria-hidden="true" />{heading}</h2>
          {links.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{links.length} saved {links.length === 1 ? "link" : "links"} · choose a source below</p>}</div>
        {actions && <div className="w-full min-w-0 sm:w-auto sm:max-w-sm">{actions}</div>}
      </div>
      {isLoading ? <LoadingIndicator label="Loading watch links…" large className="min-h-24 justify-center" /> :
        isError ? <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted-foreground">Watch links are temporarily unavailable.</p>
          {onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry watch links</Button>}
        </div> : <>
          {links.length === 0 ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : <>
            {!links.some((link) => link.kind === "watch" || directMediaFormat(link.url)) && <p className="text-sm text-muted-foreground">Only download options are available here.</p>}
            <WatchSourceOptions links={links} context={context} identity={identity} />
          </>}
        </>}
    </section>
  );
}

export function EpisodeWatchLinks({ links, season, episode, identity }: { links: WatchSourceLink[]; season: number; episode: number; identity?: WatchSourceIdentity }) {
  const options = episodeSourceLinks(links, season, episode);
  const context = `season ${season} episode ${episode}`;
  return (
    <div aria-label={`Links for ${context}`} className="border-t border-border px-4 py-3">
      {!options.some((link) => link.kind === "watch" || directMediaFormat(link.url)) && <p className="text-xs text-muted-foreground">Watch link unavailable for this episode.</p>}
      <WatchSourceOptions links={options} context={context} identity={identity} />
    </div>
  );
}
