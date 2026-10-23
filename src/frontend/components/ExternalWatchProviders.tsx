import { ExternalLink, Play } from "lucide-react";
import { externalWatchProviders } from "@/shared/lib/externalWatchProviders";
import type { WatchSourceIdentity } from "@/shared/types/watchSources";

export default function ExternalWatchProviders({ identity, title, season, episode }: {
  identity: WatchSourceIdentity; title: string; season?: number; episode?: number;
}) {
  const providers = externalWatchProviders(identity, season, episode);
  return <section aria-label="More watch providers" className="mb-5 rounded-xl border border-border/70 bg-card/50 p-3 sm:p-4">
    <h3 className="text-sm font-semibold">More watch providers</h3>
    <p className="mt-1 text-xs text-muted-foreground">External players · availability unverified · may show ads</p>
    {providers.length ? <div className="mt-3 grid gap-2">
      {providers.map((provider) => <a key={provider.name} href={provider.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        aria-label={`Open ${provider.name} for ${title}${provider.scope === "episode" ? ` season ${season} episode ${episode}` : ""} (new tab)`}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Play className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">{provider.name}<span className="block text-xs text-muted-foreground">{provider.scope === "episode" ? `Season ${season} · Episode ${episode}` : "Open movie player"}</span></span>
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </a>)}
    </div> : <p className="mt-3 text-sm text-muted-foreground">Choose an episode to open its player, or use the Watch button on the episode’s details.</p>}
  </section>;
}
