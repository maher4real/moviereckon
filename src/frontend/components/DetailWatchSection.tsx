import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play, RefreshCw } from "lucide-react";
import { contentSourceLinks, directMediaFormat, episodeSourceLinks, isDirectFileLink, isResolvableDownload, isResolvablePlayer } from "@/shared/lib/watchSources";
import { useWatchSources, watchSourcesQueryKey } from "@/frontend/hooks/useWatchSources";
import { searchWatchLinks } from "@/frontend/lib/mongodbClient";
import type { DetailWatchProps } from "./DeferredWatchSources";
import type { WatchSourceLink } from "@/shared/types/watchSources";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import DirectWatchPlayer from "./DirectWatchPlayer";
import ResolveDownloadButton from "./ResolveDownloadButton";
import LoadingIndicator from "./LoadingIndicator";

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
  const message = search.isError ? (search.error instanceof Error ? search.error.message : "Search unavailable. Try again.") :
    search.data?.status === "partial" ? "Some providers could not finish. Available results are shown; search again to retry." :
    search.data?.status === "busy" ? "A catalog update is running. Saved results are shown; try again shortly." :
    "Search complete. New releases appear after providers publish them.";
  const metadata = (link: WatchSourceLink) => [link.scope === "episode" ? `S${link.season} · E${link.episode}` : link.scope === "season" ? `Season ${link.season} pack` :
    link.scope === "episode-range" ? `S${link.season} · E${link.episode}–${link.episodeEnd}` : null, link.quality, link.codec, link.size, ...(link.languages || []), link.host].filter(Boolean).join(" · ");
  return <div className="min-h-0 overflow-y-auto px-5 pb-5 sm:px-6">
    <div className="flex items-center justify-between gap-3 py-4">
      <div aria-live="polite" className="min-w-0 text-xs text-muted-foreground">
        {search.isFetching ? <LoadingIndicator label={progress} /> : <p>{message}</p>}
        <p className="mt-1">{links.length} saved links</p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0 gap-2" disabled={search.isFetching} onClick={() => void search.refetch()}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />Search again
      </Button>
    </div>
    {contentType === "tv" && <div className="mb-4 flex flex-wrap gap-3">
      <label className="text-xs text-muted-foreground">Season<select aria-label="Season" value={selectedSeason} onChange={(event) => { setSeason(event.target.value); setEpisode("all"); }} className="ml-2 min-h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground">
        <option value="all">All seasons</option>{seasons.map((value) => <option key={value} value={value}>{value === 0 ? "Specials" : `Season ${value}`}</option>)}
      </select></label>
      {selectedSeason !== "all" && <label className="text-xs text-muted-foreground">Episode<select aria-label="Episode" value={selectedEpisode} onChange={(event) => setEpisode(event.target.value)} className="ml-2 min-h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground">
        <option value="all">All episodes & packs</option>{episodes.map((value) => <option key={value} value={value}>Episode {value}</option>)}
      </select></label>}
    </div>}
    <Tabs defaultValue="watch">
      <TabsList aria-label="Link type" className="grid h-12 w-full grid-cols-2">
        <TabsTrigger value="watch" className="min-h-10 gap-2"><Play className="h-4 w-4" aria-hidden="true" />Watch <span className="text-xs text-muted-foreground">{watch.length}</span></TabsTrigger>
        <TabsTrigger value="download" className="min-h-10 gap-2"><Download className="h-4 w-4" aria-hidden="true" />Download <span className="text-xs text-muted-foreground">{downloads.length}</span></TabsTrigger>
      </TabsList>
      {(["watch", "download"] as const).map((tab) => {
        const rows = tab === "watch" ? watch : downloads;
        const other = external.filter((link) => tab === "watch" ? link.kind === "watch" : link.kind !== "watch");
        return <TabsContent key={tab} value={tab} className="mt-4">
          {rows.length ? <ol className="divide-y divide-border">{rows.map((link, index) => <li key={link.id} className="flex min-w-0 items-start gap-3 py-4 first:pt-0">
            <span className="mt-3 w-6 shrink-0 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">{tab === "watch" ? <>
              <DirectWatchPlayer inline link={link} identity={identity} context={title} fallbackLinks={watch} />
              <p className="mt-2 break-words text-xs text-muted-foreground">{metadata(link)}</p>
            </> : isResolvableDownload(link) ? <ResolveDownloadButton inlinePlayer link={link} identity={identity} /> : <>
              <a href={link.url} target="_blank" rel="noopener noreferrer" download className="inline-flex min-h-11 items-center text-sm underline">Open file · {link.label}</a>
              <p className="break-words text-xs text-muted-foreground">{metadata(link)} · availability unverified</p>
            </>}</div>
          </li>)}</ol> : <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 text-center">
            {tab === "watch" ? <Play className="h-6 w-6 text-muted-foreground" aria-hidden="true" /> : <Download className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
            <p className="text-sm font-medium">{search.isFetching ? `Finding ${tab === "watch" ? "watch" : "download"} links…` : `No direct ${tab === "watch" ? "watch" : "download"} sources found yet`}</p>
            <p className="text-xs text-muted-foreground">{tab === "watch" && downloads.length ? "Compatible video files can also play from the Download tab." : "Results appear here as matching sources are saved."}</p>
          </div>}
          {other.length > 0 && <section aria-label="Other provider pages" className="mt-3 border-t border-border pt-2">
            <h3 className="py-3 text-sm font-medium">Other provider pages ({other.length}) <span className="font-normal text-muted-foreground">· may show ads</span></h3>
            <p className="mb-2 text-xs text-muted-foreground">Direct media could not be confirmed for these pages.</p>
            <ol className="space-y-1">{other.map((link) => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer" className="block min-h-11 rounded py-3 text-sm underline">
              Open external page · {link.label}<span className="mt-1 block break-words text-xs text-muted-foreground">{metadata(link)}</span>
            </a></li>)}</ol>
          </section>}
        </TabsContent>;
      })}
    </Tabs>
  </div>;
}
