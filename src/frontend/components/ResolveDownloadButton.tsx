import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { ResolvedDownload, WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { resolveDownloadLink } from "@/frontend/lib/mongodbClient";
import { Button } from "./ui/button";
import LoadingIndicator from "./LoadingIndicator";

export default function ResolveDownloadButton({ link, identity }: { link: WatchSourceLink; identity: WatchSourceIdentity }) {
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<ResolvedDownload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function resolve() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(null); setFiles([]);
    try {
      const next = await resolveDownloadLink(identity, link.id, controller.signal);
      if (!controller.signal.aborted) setFiles(next);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to get this file link");
    } finally {
      if (!controller.signal.aborted) { setPending(false); request.current = null; }
    }
  }
  const scope = link.scope === "episode" ? `S${link.season} E${link.episode}` : link.scope === "season" ? `Season ${link.season} pack` : "";
  const label = [scope, link.quality && !link.label.includes(link.quality) ? link.quality : "", link.label, link.codec].filter(Boolean).join(" · ");
  return <div className="min-w-0 space-y-3 py-4 first:pt-2 last:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{link.quality || link.label}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{[scope, link.label !== link.quality ? link.label : "", link.codec, link.size, link.host].filter(Boolean).join(" · ")}</p>
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void resolve()}
        className="min-h-11 shrink-0" aria-label={`Get file link: ${label}`}>
        {files.length ? <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
        {pending ? "Finding file…" : files.length ? "Refresh link" : "Get file link"}
      </Button>
    </div>
    {pending && <LoadingIndicator label="Checking the final file…" className="py-2" />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {files.length > 0 && <div className="space-y-3 border-t border-border pt-3">
      <p role="status" className="sr-only">File link ready.</p>
      <p className="break-words text-xs text-muted-foreground">{files[0].filename}</p>
      <div className="flex flex-wrap gap-2">{files.map((file, index) => <a key={file.url} href={file.url} download target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        aria-label={`Download file${files.length > 1 ? ` · Server ${index + 1}` : ""}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Download className="h-4 w-4" aria-hidden="true" />Download file{files.length > 1 ? ` · Server ${index + 1}` : ""}
        {file.sizeBytes ? <span className="text-xs">({(file.sizeBytes / 1024 ** 2).toFixed(1)} MB)</span> : null}
      </a>)}</div>
      <p className="text-xs text-muted-foreground">{files[0].expiresAt ? `Link expires ${new Date(files[0].expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Refresh it if needed.` : "Refresh the file link if it stops working."}</p>
    </div>}
  </div>;
}
