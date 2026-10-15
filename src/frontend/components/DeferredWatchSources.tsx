import { lazy, Suspense, useEffect, useState } from "react";
import type { SourceMediaType } from "@/shared/types/watchSources";
import LoadingIndicator from "./LoadingIndicator";

const DetailWatchSection = lazy(() => import("./DetailWatchSection"));

export interface DetailWatchProps {
  contentId: number;
  contentType: SourceMediaType;
  title: string;
  variant?: "content" | "season" | "episode";
  season?: number;
  episode?: number;
}

function Pending({ variant = "content", contentType }: DetailWatchProps) {
  if (variant !== "content") return <LoadingIndicator label="Loading links…" className="min-h-14 px-4 py-3" />;
  return <section aria-label={contentType === "movie" ? "Watch movie" : "Watch series"} className="mb-8 min-h-44 rounded-xl border border-border bg-card p-5 sm:p-6">
    <h2 className="text-lg font-semibold">{contentType === "movie" ? "Watch movie" : "Watch series"}</h2>
    <LoadingIndicator label="Loading saved links…" large className="min-h-24 justify-center" />
  </section>;
}

function DeferredContent(props: DetailWatchProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let frame = 0;
    let idle = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => setReady(true), { timeout: 800 });
      else timer = setTimeout(() => setReady(true), 80);
    };
    // Two frames let the title/poster commit and paint before loading link code/data.
    if (typeof window.requestAnimationFrame === "function") frame = requestAnimationFrame(() => { frame = requestAnimationFrame(schedule); });
    else schedule();
    return () => { if (frame) window.cancelAnimationFrame(frame); if (idle) window.cancelIdleCallback(idle); clearTimeout(timer); };
  }, []);
  return ready ? <Suspense fallback={<Pending {...props} />}><DetailWatchSection {...props} /></Suspense> : <Pending {...props} />;
}

export default function DeferredWatchSources(props: DetailWatchProps) {
  return <DeferredContent key={`${props.contentType}:${props.contentId}:${props.variant}:${props.season}:${props.episode}`} {...props} />;
}
