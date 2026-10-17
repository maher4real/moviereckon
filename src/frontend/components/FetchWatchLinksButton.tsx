import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw } from "lucide-react";
import { useAuth } from "@/frontend/hooks/useAuth";
import { watchSourcesQueryKey } from "@/frontend/hooks/useWatchSources";
import { fetchWatchLinks } from "@/frontend/lib/mongodbClient";
import { contentSourceLinks } from "@/shared/lib/watchSources";
import type { FetchContentSourcesResult, SourceMediaType, WatchSourceLink } from "@/shared/types/watchSources";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import LoadingIndicator from "./LoadingIndicator";
import { WatchSourceOptions } from "./WatchSourceLinks";

interface Props {
  contentId: number;
  contentType: SourceMediaType;
  title: string;
  showResults?: boolean;
}

export default function FetchWatchLinksButton({ contentId, contentType, title, showResults = true }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
    setPending(true); setError(null); setResult(null);
    try {
      // Cancel an old saved-source read before updating its cache with the import.
      if (queryClient.cancelQueries) await queryClient.cancelQueries({ queryKey: watchSourcesQueryKey(contentId, contentType) });
      if (controller.signal.aborted) return;
      const next = await fetchWatchLinks(contentId, contentType, explicitSource, controller.signal);
      if (!controller.signal.aborted) {
        setResult(next);
        queryClient.setQueryData(watchSourcesQueryKey(contentId, contentType), next.content);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to fetch links");
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  if (!user) return null;
  const links = contentSourceLinks(result?.content);
  const groups: Array<{ kind: WatchSourceLink["kind"]; label: string }> = [
    { kind: "watch", label: "Watch links" }, { kind: "download", label: "Download options" }, { kind: "collection", label: "More quality options" },
  ];
  const statusMessage = result?.status === "busy" ? "Another import is running. Please try again shortly." :
    result?.status === "partial" ? "Some sources could not be refreshed. Try again or use a source page below." :
      result?.status === "not_found" ? "No matching source was found in the available catalog. Try its HDHub page URL below." :
        result ? `${links.length} ${links.length === 1 ? "link" : "links"} available for this title.` : "";

  return <div className="min-w-0 space-y-3">
    <Button type="button" disabled={pending} onClick={() => void fetchLinks()} className="min-h-11 w-full sm:w-auto">
      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{pending ? "Fetching links" : "Fetch links"}
    </Button>
    {pending ? <LoadingIndicator label="Finding and importing links…" className="py-2" /> : statusMessage &&
      <p role="status" aria-live="polite" className="flex items-start gap-2 text-sm text-muted-foreground">
        {result?.status === "imported" && <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />}{statusMessage}
      </p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {showResults && !pending && groups.map((group) => {
      const options = links.filter((link) => link.kind === group.kind);
      return options.length > 0 && <section key={group.kind} aria-label={group.label}>
        <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
        <WatchSourceOptions links={options} context={title} identity={{ contentId, contentType }} />
      </section>;
    })}
    <details className="text-sm" open={!!error || result?.status === "not_found" ? true : undefined}>
      <summary className="flex min-h-11 w-fit cursor-pointer items-center rounded text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Use a source-page URL</summary>
      <form className="mt-2 space-y-3" onSubmit={(event) => { event.preventDefault(); if (sourceUrl.trim()) void fetchLinks(sourceUrl.trim()); }}>
        <Label htmlFor={`source-page-${contentType}-${contentId}`}>HDHub source-page URL</Label>
        <Input id={`source-page-${contentType}-${contentId}`} value={sourceUrl} disabled={pending} className="min-h-11"
          onChange={(event) => setSourceUrl(event.target.value)} placeholder="Paste this title’s source page" />
        <p className="text-xs text-muted-foreground">Use the page for this movie or series when automatic discovery misses it.</p>
        <Button type="submit" variant="outline" className="min-h-11" disabled={pending || !sourceUrl.trim()}>Fetch from page</Button>
      </form>
    </details>
  </div>;
}
