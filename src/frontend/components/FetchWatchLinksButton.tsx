import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import { useAuth } from "@/frontend/hooks/useAuth";
import { watchSourcesQueryKey } from "@/frontend/hooks/useWatchSources";
import { fetchWatchLinks } from "@/frontend/lib/mongodbClient";
import type { FetchContentSourcesResult, SourceMediaType, WatchSourceLink } from "@/shared/types/watchSources";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/frontend/components/ui/dialog";

interface Props {
  contentId: number;
  contentType: SourceMediaType;
  title: string;
}

function scopeLabel(link: WatchSourceLink): string {
  if (link.scope === "episode") return `S${link.season ?? "?"} · E${link.episode}`;
  if (link.scope === "episode-range") return `S${link.season ?? "?"} · E${link.episode}–${link.episodeEnd}`;
  if (link.scope === "season") return `Season ${link.season ?? "?"} pack`;
  return "";
}

export default function FetchWatchLinksButton({ contentId, contentType, title }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FetchContentSourcesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function fetchLinks(explicitSource?: string) {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setOpen(true);
    setPending(true);
    setError(null);
    try {
      const next = await fetchWatchLinks(contentId, contentType, explicitSource, controller.signal);
      if (!controller.signal.aborted) {
        setResult(next);
        queryClient.setQueryData(watchSourcesQueryKey(contentId, contentType), next.content);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to fetch links");
    } finally {
      if (!controller.signal.aborted) setPending(false);
      requestRef.current = null;
    }
  }

  // Per-title imports use the viewer's session; bulk imports stay cron-protected.
  if (!user) return null;
  const links = result?.content.sources.flatMap((source) => source.links) || [];
  const groups: Array<{ kind: WatchSourceLink["kind"]; label: string }> = [
    { kind: "watch", label: "Watch links" },
    { kind: "download", label: "Download options" },
    { kind: "collection", label: "More quality options" },
  ];
  const statusMessage = pending ? "Finding and importing links…" : result?.status === "busy" ?
    "Another import is running. Please try again shortly." : result?.status === "partial" ?
      "Some sources could not be refreshed. You can try a source page below." : result?.status === "not_found" ?
        "No matching source was found in recent releases. Try its HDHub page URL below." : result ?
          `${links.length} ${links.length === 1 ? "link" : "links"} available for this title.` : "";

  return (
    <>
      <Button type="button" size="lg" disabled={pending}
        className="action-btn bg-muted text-foreground hover:bg-primary/20 hover:text-primary"
        onClick={() => void fetchLinks()}>
        {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Link2 className="mr-2 h-5 w-5" aria-hidden="true" />}
        {pending ? "Fetching links" : "Fetch links"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="pr-6">Links for {title}</DialogTitle>
          <DialogDescription>Quality options and external players for this title.</DialogDescription>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{statusMessage}</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!pending && groups.map((group) => {
            const options = links.filter((link) => link.kind === group.kind);
            if (!options.length) return null;
            return (
              <section key={group.kind} aria-label={group.label}>
                <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((link, index) => (
                    <a key={`${link.id}:${index}`} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0">
                        {scopeLabel(link) && <span className="block text-xs text-muted-foreground">{scopeLabel(link)}</span>}
                        <span className="block break-words text-sm font-medium">{link.label}</span>
                        <span className="block break-words text-xs text-muted-foreground">{[link.quality, link.codec, link.host].filter(Boolean).join(" · ")}</span>
                      </span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
          <form className="space-y-2 border-t border-border pt-4" onSubmit={(event) => {
            event.preventDefault();
            if (sourceUrl.trim()) void fetchLinks(sourceUrl.trim());
          }}>
            <Label htmlFor={`source-page-${contentType}-${contentId}`}>HDHub source-page URL</Label>
            <Input id={`source-page-${contentType}-${contentId}`} value={sourceUrl} disabled={pending}
              onChange={(event) => setSourceUrl(event.target.value)} placeholder="Paste this title’s HDHub page URL" />
            <p className="text-xs text-muted-foreground">Use this when automatic discovery does not find the title.</p>
            <Button type="submit" disabled={pending || !sourceUrl.trim()}>Fetch from page</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
