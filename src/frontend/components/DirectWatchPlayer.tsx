import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { Play } from "lucide-react";
import { directMediaFormat, isResolvablePlayer } from "@/shared/lib/watchSources";
import type { DirectMediaSource, WatchSourceIdentity, WatchSourceLink } from "@/shared/types/watchSources";
import { resolveWatchLink } from "@/frontend/lib/mongodbClient";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

function MediaPlayer({ source, context, onFailure }: { source: DirectMediaSource; context: string; onFailure: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const failureRef = useRef(onFailure);
  useEffect(() => { failureRef.current = onFailure; }, [onFailure]);
  const failedRef = useRef(false);
  const fail = useCallback(() => {
    if (failedRef.current) return;
    failedRef.current = true;
    failureRef.current();
  }, []);
  const [qualities, setQualities] = useState<Array<{ index: number; label: string }>>([]);
  const [audio, setAudio] = useState<Array<{ index: number; label: string }>>([]);
  useEffect(() => {
    const video = videoRef.current!;
    failedRef.current = false;
    let cancelled = false;
    const playlistUrl = source.format === "hls" && source.hlsPlaylist ?
      URL.createObjectURL(new Blob([source.hlsPlaylist], { type: "application/vnd.apple.mpegurl" })) : null;
    const playbackUrl = playlistUrl || source.url;
    if (source.format !== "hls") {
      video.src = playbackUrl;
    } else {
      void import("hls.js").then(({ default: Hls, FetchLoader }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = playbackUrl;
          else fail();
          return;
        }
        const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60,
          ...(source.referrerPolicy === "no-referrer" ? {
            loader: FetchLoader,
            fetchSetup: (context, init) => new Request(context.url, { ...init, referrerPolicy: "no-referrer" }),
          } : {}),
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_, data) => { if (!cancelled && data.fatal) fail(); });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setQualities(hls.levels.map((level, index) => ({ index, label: level.height ? `${level.height}p` : `Quality ${index + 1}` })));
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
          setAudio(data.audioTracks.map((track, index) => ({ index, label: track.name || track.lang || `Audio ${index + 1}` })));
        });
        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
      }).catch(() => { if (!cancelled) fail(); });
    }
    return () => {
      cancelled = true;
      failedRef.current = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
      if (playlistUrl) URL.revokeObjectURL(playlistUrl);
    };
  }, [source.url, source.format, source.referrerPolicy, source.hlsPlaylist, fail]);
  return <div className="space-y-3">
    <video ref={videoRef} controls autoPlay playsInline preload="none" aria-label={`Video for ${context}`}
      className="aspect-video w-full rounded-lg bg-black" onError={fail} />
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

export default function DirectWatchPlayer({ link, identity, context, media, inline = false, fallbackLinks = [] }: { link: WatchSourceLink; identity?: WatchSourceIdentity; context: string; media?: DirectMediaSource; inline?: boolean; fallbackLinks?: WatchSourceLink[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<DirectMediaSource[]>([]);
  const [selected, setSelected] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [provider, setProvider] = useState(link.host);
  const [progress, setProgress] = useState("Loading stream…");
  const requestRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<{ controller: AbortController; links: WatchSourceLink[]; cursor: number } | null>(null);
  useEffect(() => () => sessionRef.current?.controller.abort(), []);
  async function nextProvider(session: NonNullable<typeof sessionRef.current>) {
    const { controller } = session;
    requestRef.current = controller;
    setPending(true); setError(null); setSources([]); setSelected(0);
    let message = "No working direct stream is available from these providers. Search again for updated links.";
    try {
      while (session.cursor < session.links.length && !controller.signal.aborted) {
        const candidate = session.links[session.cursor++];
        setProgress(session.cursor === 1 ? "Loading stream…" : `Trying another provider (${session.cursor}/${session.links.length})…`);
        try {
          const format = directMediaFormat(candidate.url);
          const next = media && candidate.id === link.id ? [media] : format ? [{ url: candidate.url, format, label: candidate.quality || candidate.label }] :
            identity ? await resolveWatchLink(identity, candidate.id, controller.signal) : [];
          if (controller.signal.aborted) return;
          if (!next.length) continue;
          setProvider(candidate.host); setSources(next); setAttempt((value) => value + 1);
          return;
        } catch (failure) {
          if (controller.signal.aborted) return;
          if (failure instanceof Error) message = failure.message;
        }
      }
      if (!controller.signal.aborted) setError(message);
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setPending(false); }
    }
  }
  function play() {
    if (requestRef.current) return;
    sessionRef.current?.controller.abort();
    // Fallbacks come from this title's saved results. Never substitute another
    // episode, an episode range or a season pack for the requested episode.
    const alternatives = media ? [] : fallbackLinks.filter((candidate) => candidate.scope === link.scope &&
      (link.scope === "movie" || (link.scope === "episode" && candidate.season === link.season && candidate.episode === link.episode)) &&
      (isResolvablePlayer(candidate) || directMediaFormat(candidate.url)));
    const links = [link, ...alternatives].filter((candidate, index, all) => all.findIndex((other) => other.id === candidate.id || other.url === candidate.url) === index).slice(0, 8);
    const session = { controller: new AbortController(), links, cursor: 0 };
    sessionRef.current = session;
    setOpen(true);
    void nextProvider(session);
  }
  function playbackFailed() {
    const session = sessionRef.current;
    if (!session || session.controller.signal.aborted || requestRef.current) return;
    if (selected + 1 < sources.length) { setSelected(selected + 1); return; }
    if (session.cursor < session.links.length) { void nextProvider(session); return; }
    setSources([]);
    setError("This stream could not play here. The available providers failed or their links expired. Load stream again for fresh links, or search again for another release.");
  }
  function close() {
    setOpen(false); sessionRef.current?.controller.abort(); requestRef.current = null; setSources([]); setPending(false);
  }
  const playerBody = <div className="space-y-3">
        {pending && <p role="status">{progress}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sources.length > 1 && <label className="text-sm">Stream <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
          {sources.map((source, index) => <option key={index} value={index}>{source.label}</option>)}
        </select></label>}
        {open && sources[selected] && <><p className="text-xs text-muted-foreground">Playing from {provider}</p><MediaPlayer key={`${attempt}:${selected}`} source={sources[selected]} context={context} onFailure={playbackFailed} /></>}
        {!pending && <Button type="button" variant="outline" onClick={() => void play()}>Load stream again</Button>}
  </div>;
  return <>
    <Button type="button" variant="outline" onClick={() => void play()} disabled={pending}
      aria-label={`Play here ${context}: ${link.label}`} className="h-auto justify-start whitespace-normal p-3 text-left">
      <Play className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0"><span className="block">{pending ? "Loading stream…" : "Play here"}</span>
        <span className="block break-words text-xs text-muted-foreground">{media ? media.label : [link.label, link.quality && !link.label.includes(link.quality) ? link.quality : null, link.host].filter(Boolean).join(" · ")}</span></span>
    </Button>
    {inline ? open && <section aria-label={`Player for ${context}`} className="mt-4 space-y-3 rounded-lg border border-border p-3">
      <Button type="button" variant="ghost" className="min-h-11" onClick={close}>Close player</Button>
      {playerBody}
    </section> : <Dialog open={open} onOpenChange={(value) => {
      setOpen(value);
      if (!value) close();
    }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="pr-6">Watch {context}</DialogTitle>
        <DialogDescription>Play the media directly inside MovieReckon.</DialogDescription>
        {playerBody}
      </DialogContent>
    </Dialog>}
  </>;
}
