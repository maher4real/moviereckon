import { useMemo } from "react";
import { contentSourceLinks } from "@/shared/lib/watchSources";
import { useWatchSources } from "@/frontend/hooks/useWatchSources";
import type { DetailWatchProps } from "./DeferredWatchSources";
import FetchWatchLinksButton from "./FetchWatchLinksButton";
import LoadingIndicator from "./LoadingIndicator";
import { EpisodeWatchLinks, WatchLinksSection } from "./WatchSourceLinks";

export default function DetailWatchSection({ contentId, contentType, title, variant = "content", season, episode }: DetailWatchProps) {
  const sources = useWatchSources(contentId, contentType);
  const links = useMemo(() => contentSourceLinks(sources.data), [sources.data]);
  const identity = { contentId, contentType };
  if (variant === "episode" && season !== undefined && episode !== undefined) {
    if (sources.isLoading) return <LoadingIndicator label="Loading episode links…" className="min-h-14 border-t border-border px-4 py-3" />;
    if (sources.isError) return <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Episode links are temporarily unavailable. Retry from the watch section above.</p>;
    return <EpisodeWatchLinks links={links} season={season} episode={episode} identity={identity} />;
  }
  if (variant === "season") {
    if (sources.isLoading) return <LoadingIndicator label="Loading season links…" className="min-h-14 px-4 py-3" />;
    const packs = links.filter((link) => link.scope === "season" && link.season === season);
    if (!packs.length) return null;
    return <WatchLinksSection heading={`Season ${season} links`} context={`${title} season ${season}`} identity={identity} links={packs} />;
  }
  const options = contentType === "tv" ? links.filter((link) => link.scope === "series") : links;
  return <WatchLinksSection heading={contentType === "movie" ? "Watch movie" : "Watch series"} context={title} identity={identity}
    links={options} isLoading={sources.isLoading} isError={sources.isError} onRetry={() => void sources.refetch()}
    actions={<FetchWatchLinksButton contentId={contentId} contentType={contentType} title={title} showResults={false} />}
    emptyMessage={contentType === "tv" ? links.some((link) => link.scope === "episode" || link.scope === "episode-range") ?
      "Choose a season and episode below for its watch and download links." : "No watch links available for this series yet." : "No watch links available yet."} />;
}
