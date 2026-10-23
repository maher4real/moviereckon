import { Play } from "lucide-react";
import { directMediaFormat, episodeSourceLinks, isResolvableDownload, isResolvablePlayer } from "@/shared/lib/watchSources";
import { useWorkingWatchLinks } from "@/frontend/hooks/useWorkingWatchLinks";
import type { WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { Button } from "./ui/button";
import WatchLinkButton from "./WatchLinkButton";
import ResolveDownloadButton from "./ResolveDownloadButton";
import LoadingIndicator from "./LoadingIndicator";
import type { ReactNode } from "react";

export function WatchSourceOptions({ links, context, identity }: { links: WatchSourceLink[]; context: string; identity?: WatchSourceIdentity }) {
  const working = useWorkingWatchLinks(links, identity);
  return <>
    {working.isChecking && <LoadingIndicator label="Checking links…" />}
    {working.isError && <p role="status" className="text-sm text-muted-foreground">Could not finish checking links. Try again.</p>}
    {!working.isChecking && working.confirmed.length === 0 && <p className="text-sm text-muted-foreground">No working links found.</p>}
    <div className="space-y-3">{working.confirmed.map(({ link, check }) => <div key={`${link.id}:${check.checkedAt}`}>
      {(link.scope === "movie" || link.scope === "episode") && (directMediaFormat(link.url) || isResolvablePlayer(link)) &&
        <WatchLinkButton link={link} context={context} />}
      {identity && check.downloads.length > 0 && (isResolvableDownload(link) ? <ResolveDownloadButton link={link} identity={identity}
        initialFiles={check.downloads} onUnavailable={() => working.reject(link)} /> : check.downloads.map((file) =>
          <a key={file.url} href={file.url} download target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground">Download file · {link.label}</a>))}
    </div>)}</div>
  </>;
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
  return <section aria-label={heading} className="mb-8 min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Play className="h-5 w-5 text-primary" aria-hidden="true" />{heading}</h2>
      {actions && <div className="w-full min-w-0 sm:w-auto sm:max-w-sm">{actions}</div>}
    </div>
    {isLoading ? <LoadingIndicator label="Loading watch links…" large className="min-h-24 justify-center" /> :
      isError ? <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm text-muted-foreground">Watch links are temporarily unavailable.</p>
        {onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry watch links</Button>}
      </div> : links.length === 0 ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> :
        <WatchSourceOptions links={links} context={context} identity={identity} />}
  </section>;
}

export function EpisodeWatchLinks({ links, season, episode, identity }: { links: WatchSourceLink[]; season: number; episode: number; identity?: WatchSourceIdentity }) {
  const options = episodeSourceLinks(links, season, episode);
  const context = `season ${season} episode ${episode}`;
  return <div aria-label={`Links for ${context}`} className="border-t border-border px-4 py-3">
    <WatchSourceOptions links={options} context={context} identity={identity} />
  </div>;
}
