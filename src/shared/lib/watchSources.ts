import type { ContentWatchSources, WatchSourceLink } from "@/shared/types/watchSources";

function mediaUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !url.hostname.includes(".") || url.hostname.includes(":") || /^[\d.]+$/.test(url.hostname) ||
        /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}

/** A URL shape is a playback candidate, never proof of availability or content. */
export function directMediaFormat(value: string): "mp4" | "webm" | "hls" | null {
  const extension = mediaUrl(value)?.pathname.match(/\.(mp4|webm|m3u8)$/i)?.[1].toLowerCase();
  return extension === "m3u8" ? "hls" : extension === "mp4" || extension === "webm" ? extension : null;
}

export function isDirectFileLink(value: string): boolean {
  const url = mediaUrl(value);
  return !!url && /\.(mp4|webm|mkv|mov|avi|zip|rar|7z)$/i.test(url.pathname);
}

export function isResolvablePlayer(link: WatchSourceLink): boolean {
  try {
    const url = new URL(link.url);
    return link.kind === "watch" && link.scope === "movie" && url.origin === "https://play4u.org" &&
      !url.username && !url.password && !url.search && !url.hash && /^\/tt\d+\/?$/.test(url.pathname);
  } catch { return false; }
}

export function isResolvableDownload(link: WatchSourceLink): boolean {
  try {
    const url = mediaUrl(link.url);
    return !!url && link.kind === "download" && ["movie", "episode", "season"].includes(link.scope) &&
      !url.search && !url.hash && (
        (url.origin === "https://hubdrive.pics" && /^\/file\/\d+\/?$/.test(url.pathname)) ||
        (["https://hubcdn.club", "https://hubcdn.wiki"].includes(url.origin) && /^\/file\/[a-zA-Z0-9]+\/?$/.test(url.pathname))
      );
  } catch { return false; }
}

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
