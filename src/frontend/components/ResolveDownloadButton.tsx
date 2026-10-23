import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { ResolvedDownload, WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { resolveDownloadLink } from "@/frontend/lib/mongodbClient";
import { cn } from "@/shared/lib/utils";
import { Button } from "./ui/button";
import LoadingIndicator from "./LoadingIndicator";
import WatchMetaChips, { watchLinkScope } from "./WatchMetaChips";

export default function ResolveDownloadButton({ link, identity, hideScope = false, className, initialFiles = [], onUnavailable }: { link: WatchSourceLink; identity: WatchSourceIdentity; hideScope?: boolean; className?: string; initialFiles?: ResolvedDownload[]; onUnavailable?: () => void }) {
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<ResolvedDownload[]>(initialFiles);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!files.some((file) => file.expiresAt)) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [files]);
  const available = files.filter((file) => !file.expiresAt || Date.parse(file.expiresAt) > clock + 5000);
  async function resolve() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(null); setFiles([]);
    try {
      const next = await resolveDownloadLink(identity, link.id, controller.signal);
      if (!controller.signal.aborted) {
        setClock(Date.now()); setFiles(next);
        if (!next.length) { setError("No working file could be confirmed. Try another source."); onUnavailable?.(); }
      }
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Unable to get this file link"); onUnavailable?.(); }
    } finally {
      if (!controller.signal.aborted) { setPending(false); request.current = null; }
    }
  }
  const scope = link.scope === "episode" ? `S${link.season} E${link.episode}` : link.scope === "season" ? `Season ${link.season} pack` : "";
  const label = [scope, link.quality && !link.label.includes(link.quality) ? link.quality : "", link.label, link.codec].filter(Boolean).join(" · ");
  return <div className={cn("min-w-0 space-y-3 py-4 first:pt-2 last:pb-0", className)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold">{link.quality || link.label}</p>
        <WatchMetaChips link={link} skip={[link.quality, hideScope ? watchLinkScope(link) : null]} />
      </div>
      <Button type="button" variant={files.length ? "outline" : "default"} disabled={pending} onClick={() => void resolve()}
        className="min-h-11 shrink-0 rounded-lg" aria-label={`Get file link: ${label}`}>
        {files.length ? <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
        {pending ? "Finding file…" : files.length ? "Refresh link" : "Get file link"}
      </Button>
    </div>
    {pending && <LoadingIndicator label="Checking the final file…" className="py-2" />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {files.length > 0 && available.length === 0 && <p role="status" className="text-sm text-muted-foreground">File links expired. Refresh to get a new link.</p>}
    {available.length > 0 && <div className="space-y-3 border-t border-border pt-3">
      <p role="status" className="sr-only">File link ready.</p>
      <p className="break-words text-xs text-muted-foreground">{available[0].filename}</p>
      <div className="flex flex-wrap gap-2">{available.map((file, index) => <a key={file.url} href={file.url} download target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        aria-label={`Download file${available.length > 1 ? ` · Server ${index + 1}` : ""}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Download className="h-4 w-4" aria-hidden="true" />Download file{available.length > 1 ? ` · Server ${index + 1}` : ""}
        {file.sizeBytes ? <span className="text-xs">({(file.sizeBytes / 1024 ** 2).toFixed(1)} MB)</span> : null}
      </a>)}</div>
      {available[0].expiresAt && <p className="text-xs text-muted-foreground">Expires {new Date(available[0].expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
    </div>}
  </div>;
}
