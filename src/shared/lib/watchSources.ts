import type { ContentWatchSources, WatchSourceLink } from "@/shared/types/watchSources";

/** A destination published on multiple source pages only needs one option. */
export function contentSourceLinks(content?: ContentWatchSources): WatchSourceLink[] {
  const links = new Map<string, WatchSourceLink>();
  for (const source of content?.sources || []) {
    for (const link of source.links) {
      if (!links.has(link.id)) links.set(link.id, link);
    }
  }
  return [...links.values()];
}

export function episodeSourceLinks(links: WatchSourceLink[], season: number, episode: number): WatchSourceLink[] {
  return links.filter((link) => link.season === season && (
    (link.scope === "episode" && link.episode === episode) ||
    (link.scope === "episode-range" && link.episode !== null && link.episodeEnd !== null &&
      link.episode <= episode && link.episodeEnd >= episode)
  ));
}
