import type { WatchSourceLink } from "@/shared/types/watchSources";
import { cn } from "@/shared/lib/utils";

export function watchLinkScope(link: WatchSourceLink): string | null {
  if (link.scope === "episode") return `S${link.season} · E${link.episode}`;
  if (link.scope === "season") return `Season ${link.season} pack`;
  if (link.scope === "episode-range") return `S${link.season} · E${link.episode}–${link.episodeEnd}`;
  return null;
}

/** Compact facts about a source (scope, codec, size, languages, host) as chips instead of a sentence. */
export default function WatchMetaChips({ link, skip = [], className }: { link: WatchSourceLink; skip?: Array<string | null | undefined>; className?: string }) {
  const values = [watchLinkScope(link), link.codec, link.size, ...(link.languages || []), link.host]
    .filter((value): value is string => !!value && !skip.includes(value));
  const chips = [...new Set(values)];
  if (!chips.length) return null;
  return <ul className={cn("flex flex-wrap gap-1.5", className)}>
    {chips.map((chip) => <li key={chip} className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{chip}</li>)}
  </ul>;
}
