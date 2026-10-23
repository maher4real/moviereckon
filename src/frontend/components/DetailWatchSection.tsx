import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Play, RefreshCw } from "lucide-react";
import { contentSourceLinks, directMediaFormat, episodeSourceLinks, isDirectFileLink, isResolvableDownload, isResolvablePlayer } from "@/shared/lib/watchSources";
import { useWatchSources, watchSourcesQueryKey } from "@/frontend/hooks/useWatchSources";
import { searchWatchLinks } from "@/frontend/lib/mongodbClient";
import type { DetailWatchProps } from "./DeferredWatchSources";
import { cn } from "@/shared/lib/utils";
import type { WatchSourceLink } from "@/shared/types/watchSources";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import WatchLinkButton from "./WatchLinkButton";
import ExternalWatchProviders from "./ExternalWatchProviders";
import { externalWatchProviders } from "@/shared/lib/externalWatchProviders";
import ResolveDownloadButton from "./ResolveDownloadButton";
import LoadingIndicator from "./LoadingIndicator";
import WatchMetaChips, { watchLinkScope } from "./WatchMetaChips";

interface EpisodeGroup { key: string; label: string; order: number[]; links: WatchSourceLink[] }

/** Bucket series links by episode (then ranges, season packs, full series) in viewing order. */
function groupByEpisode(links: WatchSourceLink[], seasonSelected: boolean): EpisodeGroup[] {
  const groups = new Map<string, EpisodeGroup>();
  for (const link of links) {
    const season = link.season ?? 0;
    const prefix = seasonSelected ? "" : `S${season} · `;
    const [key, label, order] =
      link.scope === "episode" && link.episode !== null ? [`e:${season}:${link.episode}`, seasonSelected ? `Episode ${link.episode}` : `${prefix}E${link.episode}`, [season, 0, link.episode, 0]] :
      link.scope === "episode-range" && link.episode !== null ? [`r:${season}:${link.episode}:${link.episodeEnd}`, `${seasonSelected ? "Episodes " : `${prefix}E`}${link.episode}–${link.episodeEnd}`, [season, 0, link.episode, 1]] :
      link.scope === "season" ? [`p:${season}`, seasonSelected ? "Season pack" : `Season ${season} pack`, [season, 1, 0, 0]] :
      ["series", "Complete series", [Number.MAX_SAFE_INTEGER, 2, 0, 0]];
    const group = groups.get(key) ?? { key, label, order, links: [] };
    group.links.push(link);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    for (let index = 0; index < a.order.length; index += 1) {
      if (a.order[index] !== b.order[index]) return a.order[index] - b.order[index];
    }
    return 0;
  });
}

function LinkList({ links, groupBy, className, renderLink }: {
  links: WatchSourceLink[]; groupBy: ((links: WatchSourceLink[]) => EpisodeGroup[]) | null; className: string;
  renderLink: (link: WatchSourceLink, grouped: boolean) => ReactNode;
}) {
  const groups = groupBy ? groupBy(links) : [];
  if (groups.length < 2) return <ul className={className}>{links.map((link) => renderLink(link, false))}</ul>;
  return <div className="space-y-5">{groups.map((group) => <section key={group.key}>
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
      {group.label}<span className="text-xs font-normal tabular-nums text-muted-foreground">{group.links.length}</span>
    </h4>
    <ul className={className}>{group.links.map((link) => renderLink(link, true))}</ul>
  </section>)}</div>;
}

export default function DetailWatchSection({ contentId, contentType, title, season, episode }: DetailWatchProps) {
  const client = useQueryClient();
  const saved = useWatchSources(contentId, contentType);
  const [progress, setProgress] = useState("Searching providers…");
  const [selectedSeason, setSeason] = useState(season === undefined ? "all" : String(season));
  const [selectedEpisode, setEpisode] = useState(episode === undefined ? "all" : String(episode));
  const identity = { contentId, contentType };
  const search = useQuery({
    queryKey: ["watch-source-search", contentType, contentId],
    queryFn: ({ signal }) => searchWatchLinks({ contentId, contentType }, (event) => {
      if (signal.aborted) return;
      if (event.type === "progress") setProgress(event.message);
      const content = event.type === "content" ? event.content : event.type === "complete" ? event.result.content : null;
      if (content) {
        // A slower saved read must never overwrite freshly imported rows.
        void client.cancelQueries({ queryKey: watchSourcesQueryKey(contentId, contentType) });
        client.setQueryData(watchSourcesQueryKey(contentId, contentType), content);
      }
    }, signal),
    staleTime: 120_000, retry: false, refetchOnWindowFocus: false,
  });
  const links = useMemo(() => contentSourceLinks(saved.data), [saved.data]);
  const seasons = [...new Set(links.flatMap((link) => link.season === null ? [] : [link.season]))].sort((a, b) => a - b);
  if (season !== undefined && !seasons.includes(season)) seasons.push(season);
  const episodes = [...new Set(links.filter((link) => String(link.season) === selectedSeason)
    .flatMap((link) => link.scope === "episode" && link.episode !== null ? [link.episode] : []))].sort((a, b) => a - b);
  if (episode !== undefined && String(season) === selectedSeason && !episodes.includes(episode)) episodes.push(episode);
  const filtered = selectedSeason === "all" ? links : selectedEpisode === "all" ? links.filter((link) => String(link.season) === selectedSeason) :
    episodeSourceLinks(links, Number(selectedSeason), Number(selectedEpisode));
  const watch = filtered.filter((link) => (link.scope === "movie" || link.scope === "episode") && !!(directMediaFormat(link.url) || isResolvablePlayer(link)));
  const downloads = filtered.filter((link) => isResolvableDownload(link) || isDirectFileLink(link.url));
  const external = filtered.filter((link) => !watch.includes(link) && !downloads.includes(link));
  // Only problems get a line of copy; a finished search speaks through the results.
  const notice = search.isError ? (search.error instanceof Error ? search.error.message : "Search unavailable. Try again.") :
    search.data?.status === "partial" ? "Some providers could not finish." :
    search.data?.status === "busy" ? "Catalog update running. Try again shortly." : null;
  const providerSeason = selectedSeason === "all" ? undefined : Number(selectedSeason);
  const providerEpisode = selectedSeason === "all" || selectedEpisode === "all" ? undefined : Number(selectedEpisode);
  const playerCount = externalWatchProviders(identity, providerSeason, providerEpisode).length;
  const tabs = [
    { value: "download", label: "Download", Icon: Download, rows: downloads, other: external.filter((link) => link.kind !== "watch") },
    { value: "watch", label: "Watch", Icon: Play, rows: watch, other: external.filter((link) => link.kind === "watch") },
  ] as const;
  const groupBy = contentType === "tv" ? (rows: WatchSourceLink[]) => groupByEpisode(rows, selectedSeason !== "all") : null;
  // Inside an episode group the S/E chip only repeats the heading.
  const chipSkip = (link: WatchSourceLink, grouped: boolean) => grouped ? [watchLinkScope(link)] : [];
  const selectClass = "min-h-11 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground";
  return <div className="min-h-0 overflow-y-auto px-5 pb-5 sm:px-6">
    <div className="flex items-center justify-between gap-3 py-4">
      <div aria-live="polite" className="min-w-0 text-xs text-muted-foreground">
        {search.isFetching ? <LoadingIndicator label={progress} /> :
          notice ? <p className="text-amber-500">{notice}</p> :
          <p><span className="font-semibold tabular-nums text-foreground">{links.length}</span> links</p>}
      </div>
      <Button type="button" variant="outline" size="icon" aria-label="Search again" title="Search again" className="h-11 w-11 shrink-0 rounded-full" disabled={search.isFetching} onClick={() => void search.refetch()}>
        <RefreshCw className={cn("h-4 w-4", search.isFetching && "animate-spin")} aria-hidden="true" />
      </Button>
    </div>
    {contentType === "tv" && <div className="mb-4 flex flex-wrap gap-2">
      <select aria-label="Season" value={selectedSeason} onChange={(event) => { setSeason(event.target.value); setEpisode("all"); }} className={selectClass}>
        <option value="all">All seasons</option>{seasons.map((value) => <option key={value} value={value}>{value === 0 ? "Specials" : `Season ${value}`}</option>)}
      </select>
      {selectedSeason !== "all" && <select aria-label="Episode" value={selectedEpisode} onChange={(event) => setEpisode(event.target.value)} className={selectClass}>
        <option value="all">All episodes & packs</option>{episodes.map((value) => <option key={value} value={value}>Episode {value}</option>)}
      </select>}
    </div>}
    <Tabs defaultValue="download">
      <TabsList aria-label="Link type" className="grid h-12 w-full grid-cols-2 rounded-xl">
        {tabs.map(({ value, label, Icon, rows, other }) => <TabsTrigger key={value} value={value} className="min-h-10 gap-2 rounded-lg">
          <Icon className="h-4 w-4" aria-hidden="true" />{label}
          <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">{rows.length + other.length + (value === "watch" ? playerCount : 0)}</span>
        </TabsTrigger>)}
      </TabsList>
      {tabs.map(({ value: tab, Icon, rows, other }) => {
        return <TabsContent key={tab} value={tab} className="mt-4">
          {tab === "watch" && <ExternalWatchProviders identity={identity} title={title}
            season={providerSeason} episode={providerEpisode} />}
          {rows.length ? <LinkList links={rows} groupBy={groupBy} className="space-y-3" renderLink={(link, grouped) => <li key={link.id} className="min-w-0 rounded-xl border border-border/70 bg-card/50 p-3 sm:p-4">
            {tab === "watch" ? <>
              <WatchLinkButton link={link} context={title} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {link.quality && <span className="text-sm font-semibold">{link.quality}</span>}
                <WatchMetaChips link={link} skip={chipSkip(link, grouped)} />
              </div>
            </> : isResolvableDownload(link) ? <ResolveDownloadButton hideScope={grouped} className="py-0 first:pt-0 last:pb-0" link={link} identity={identity} /> :
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold">{link.quality || link.label}</p>
                  <WatchMetaChips link={link} skip={[link.quality, ...chipSkip(link, grouped)]} />
                </div>
                <a href={link.url} target="_blank" rel="noopener noreferrer" download aria-label={`Open file · ${link.label}`}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5">
                  <Download className="h-4 w-4" aria-hidden="true" />Open file
                </a>
              </div>}
          </li>} /> : tab === "download" && other.length === 0 && <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-4 text-center">
            <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{search.isFetching ? "Searching…" : "No download links yet"}</p>
          </div>}
          {other.length > 0 && <section aria-label="Other provider pages" className="mt-5">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Other provider pages <span className="tabular-nums">{other.length}</span>
              <span className="rounded border border-amber-500/40 px-1.5 py-px text-[10px] normal-case tracking-normal text-amber-500">may show ads</span>
            </h3>
            <LinkList links={other} groupBy={groupBy} className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70" renderLink={(link, grouped) => <li key={link.id}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open external page · ${link.label}`}
                className="flex min-h-11 items-center gap-3 px-3 py-3 transition-colors hover:bg-foreground/5">
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block truncate text-sm font-medium">{link.label}</span>
                  <WatchMetaChips link={link} skip={chipSkip(link, grouped)} />
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            </li>} />
          </section>}
        </TabsContent>;
      })}
    </Tabs>
  </div>;
}
