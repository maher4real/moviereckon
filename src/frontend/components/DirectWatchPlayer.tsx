import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { Play } from "lucide-react";
import { directMediaFormat } from "@/shared/lib/watchSources";
import type { DirectMediaSource, WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { resolveWatchLink } from "@/frontend/lib/mongodbClient";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

function MediaPlayer({ source, context }: { source: DirectMediaSource; context: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState(false);
  const [qualities, setQualities] = useState<Array<{ index: number; label: string }>>([]);
  const [audio, setAudio] = useState<Array<{ index: number; label: string }>>([]);
  useEffect(() => {
    const video = videoRef.current!;
    let cancelled = false;
    if (source.format !== "hls" || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source.url;
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { setError(true); return; }
        const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) { setError(true); hls.destroy(); } });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setQualities(hls.levels.map((level, index) => ({ index, label: level.height ? `${level.height}p` : `Quality ${index + 1}` })));
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
          setAudio(data.audioTracks.map((track, index) => ({ index, label: track.name || track.lang || `Audio ${index + 1}` })));
        });
        hls.loadSource(source.url);
        hls.attachMedia(video);
      }).catch(() => { if (!cancelled) setError(true); });
    }
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [source.url, source.format]);
  return <div className="space-y-3">
    <video ref={videoRef} controls autoPlay playsInline preload="none" aria-label={`Video for ${context}`}
      className="aspect-video w-full rounded-lg bg-black" onError={() => setError(true)} />
    {error && <p role="alert" className="text-sm text-destructive">This stream could not play here. It may have expired, be blocked by the host, or use an unsupported format. Try loading it again or choose another source.</p>}
    <div className="flex flex-wrap gap-3 text-sm">
      {qualities.length > 1 && <label>Quality <select className="rounded border border-border bg-background p-2" defaultValue="-1"
        onChange={(event) => { if (hlsRef.current) hlsRef.current.currentLevel = Number(event.target.value); }}>
        <option value="-1">Auto</option>{qualities.map((item) => <option key={item.index} value={item.index}>{item.label}</option>)}
      </select></label>}
      {audio.length > 1 && <label>Audio <select className="rounded border border-border bg-background p-2"
        onChange={(event) => { if (hlsRef.current) hlsRef.current.audioTrack = Number(event.target.value); }}>
        {audio.map((item) => <option key={item.index} value={item.index}>{item.label}</option>)}
      </select></label>}
    </div>
    {source.format !== "hls" && <a href={source.url} target="_blank" rel="noopener noreferrer" download className="text-sm underline">Open / save video file</a>}
    <p className="text-xs text-muted-foreground">Video loads from the media host. Availability and playback depend on that host and your browser.</p>
  </div>;
}

export default function DirectWatchPlayer({ link, identity, context }: { link: WatchSourceLink; identity?: WatchSourceIdentity; context: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<DirectMediaSource[]>([]);
  const [selected, setSelected] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  async function play() {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setOpen(true); setPending(true); setError(null); setSources([]); setSelected(0); setAttempt((value) => value + 1);
    try {
      const format = directMediaFormat(link.url);
      const next = format ? [{ url: link.url, format, label: link.quality || link.label }] :
        identity ? await resolveWatchLink(identity, link.id, controller.signal) : [];
      if (!controller.signal.aborted) {
        if (!next.length) setError("No supported direct stream is available from this source.");
        setSources(next);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load this stream");
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setPending(false); }
    }
  }
  return <>
    <Button type="button" variant="outline" onClick={() => void play()} disabled={pending}
      aria-label={`Play here ${context}: ${link.label}`} className="h-auto justify-start whitespace-normal p-3 text-left">
      <Play className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0"><span className="block">{pending ? "Loading stream…" : "Play here"}</span>
        <span className="block break-words text-xs text-muted-foreground">{[link.label, link.quality, link.host].filter(Boolean).join(" · ")}</span></span>
    </Button>
    <Dialog open={open} onOpenChange={(value) => {
      setOpen(value);
      if (!value) { requestRef.current?.abort(); requestRef.current = null; setSources([]); setPending(false); }
    }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="pr-6">Watch {context}</DialogTitle>
        <DialogDescription>Play the media directly inside MovieReckon.</DialogDescription>
        {pending && <p role="status">Loading stream…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sources.length > 1 && <label className="text-sm">Stream <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
          {sources.map((source, index) => <option key={index} value={index}>{source.label}</option>)}
        </select></label>}
        {open && sources[selected] && <MediaPlayer key={`${attempt}:${selected}`} source={sources[selected]} context={context} />}
        {!pending && <Button type="button" variant="outline" onClick={() => void play()}>Load stream again</Button>}
      </DialogContent>
    </Dialog>
  </>;
}
