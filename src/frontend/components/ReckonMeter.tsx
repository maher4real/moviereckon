import { Gauge, Info, Split } from "lucide-react";
import type { MeterConfidence, ReckonMeterResult } from "@/shared/lib/reckonMeter";
import { cn } from "@/shared/lib/utils";

const CONFIDENCE_COPY: Record<MeterConfidence, string> = {
  low: "Early read",
  medium: "Solid read",
  high: "High confidence",
};

const DISTRIBUTION = [
  { key: "loved", label: "Loved", className: "bg-emerald-400" },
  { key: "liked", label: "Liked", className: "bg-sky-400" },
  { key: "mixed", label: "Mixed", className: "bg-amber-400" },
  { key: "disliked", label: "Disliked", className: "bg-rose-400" },
] as const;

export function meterTone(score: number): { text: string; stroke: string; bar: string } {
  if (score >= 70) return { text: "text-emerald-400", stroke: "stroke-emerald-400", bar: "bg-emerald-400" };
  if (score >= 55) return { text: "text-amber-300", stroke: "stroke-amber-300", bar: "bg-amber-300" };
  return { text: "text-rose-400", stroke: "stroke-rose-400", bar: "bg-rose-400" };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function MeterGauge({ score }: { score: number }) {
  const tone = meterTone(score);
  return (
    <div className="relative w-40 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 120 68" className="w-full overflow-visible">
        <path d="M10 60 A50 50 0 0 1 110 60" pathLength={100} className="fill-none stroke-foreground/10" strokeWidth={10} strokeLinecap="round" />
        <path
          d="M10 60 A50 50 0 0 1 110 60"
          pathLength={100}
          strokeDasharray={`${Math.max(score, 1)} 100`}
          className={cn("fill-none transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none", tone.stroke)}
          strokeWidth={10}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className={cn("text-4xl font-black tabular-nums tracking-tight", tone.text)}>{score}</span>
        <span className={cn("text-lg font-bold", tone.text)}>%</span>
      </div>
    </div>
  );
}

export default function ReckonMeter({ meter, isLoading }: { meter: ReckonMeterResult | null; isLoading?: boolean }) {
  if (!meter) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 p-5 text-center">
        <Gauge className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">{isLoading ? "Reading the room…" : "Reckon Meter needs a few more opinions"}</p>
        {!isLoading && <p className="mt-1 text-xs text-muted-foreground">Rate it or leave a reaction to get it started.</p>}
      </div>
    );
  }

  const tone = meterTone(meter.score);
  const hasExternal = meter.sources.some((source) => source.asOf !== undefined);
  const distributionTotal = DISTRIBUTION.reduce((total, { key }) => total + meter.distribution[key], 0);

  return (
    <section
      aria-label="Reckon Meter"
      className="overflow-hidden rounded-2xl border border-border/70 bg-[radial-gradient(ellipse_at_0%_0%,hsl(var(--primary)/0.12),transparent_60%)] bg-card/60 p-5 sm:p-6"
    >
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <MeterGauge score={meter.score} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Reckon Meter</p>
          <p className={cn("mt-1 text-2xl font-bold tracking-tight", tone.text)}>{meter.verdict}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="sr-only">{meter.score}% </span>
            would recommend · from {formatCount(meter.opinions)} opinions
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            <span className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
              meter.confidence === "high" ? "border-emerald-400/40 text-emerald-400" :
                meter.confidence === "medium" ? "border-sky-400/40 text-sky-400" : "border-border text-muted-foreground",
            )}>
              {CONFIDENCE_COPY[meter.confidence]}
            </span>
            {meter.divisive && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                <Split className="size-3" aria-hidden="true" />Divisive
              </span>
            )}
          </div>
        </div>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Meter sources">
        {meter.sources.map((source) => {
          const sourceTone = meterTone(source.score);
          return (
            <li key={source.id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-foreground/90">{source.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className={cn("font-semibold", sourceTone.text)}>{source.score}%</span>
                  {source.countKnown !== false && <> · {formatCount(source.count)}</>}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div className={cn("h-full rounded-full", sourceTone.bar)} style={{ width: `${source.score}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                via {source.via} · {Math.round(source.influence * 100)}% of the score
                {source.asOf && <> · as of {new Date(source.asOf).getFullYear()}</>}
              </p>
            </li>
          );
        })}
      </ul>

      {distributionTotal > 0 && (
        <div className="mt-5">
          <div className="flex h-2 overflow-hidden rounded-full bg-foreground/10" role="img"
            aria-label={DISTRIBUTION.map(({ key, label }) => `${label} ${meter.distribution[key]}`).join(", ")}>
            {DISTRIBUTION.map(({ key, className }) => meter.distribution[key] > 0 && (
              <div key={key} className={className} style={{ width: `${(meter.distribution[key] / distributionTotal) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
            {DISTRIBUTION.map(({ key, label, className }) => (
              <li key={key} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", className)} />{label} <span className="tabular-nums">{meter.distribution[key]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group mt-5 text-xs text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 hover:text-foreground">
          <Info className="size-3.5" aria-hidden="true" />How the meter works
        </summary>
        <p className="mt-1 max-w-prose leading-relaxed">
          Every rating becomes a chance of recommending (8/10 and up counts fully, 4/10 and below not at all).
          Each source is pulled toward a neutral 60% until it has enough opinions, so a few perfect scores cannot
          inflate it. Sources are then weighted by how many people stand behind them, with MovieReckon ratings
          counting a little more. TMDB&apos;s huge vote totals are capped so this community can still move the needle.
          {hasExternal && <> Rotten Tomatoes, Metacritic and IMDb scores come from Wikidata and may lag the live sites;
            the Tomatometer already is a share of positive reviews, so it is used as is.</>}
        </p>
      </details>
    </section>
  );
}
