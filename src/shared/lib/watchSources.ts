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
  const url = mediaUrl(link.url);
  if (!url || link.kind !== "watch" || url.search || !["movie", "episode"].includes(link.scope)) return false;
  if (url.origin === "https://hubstream.art") return url.pathname === "/" && /^#[a-zA-Z0-9]{6,32}$/.test(url.hash);
  return !url.hash && (
    (link.scope === "movie" && url.origin === "https://play4u.org" && /^\/tt\d+\/?$/.test(url.pathname)) ||
    (url.origin === "https://hdstream4u.com" && /^\/file\/[a-z0-9]{12}\/?$/.test(url.pathname))
  );
}

/** Only this provider's literal ID entry is a supported redirect source. */
export function isGreenMotorsUrl(value: string): boolean {
  const url = mediaUrl(value);
  if (!url || !["https://greenmotors.club", "https://greenmotors.cc"].includes(url.origin) || url.pathname !== "/" || url.hash ||
      !/^\?id=[^&]+$/.test(url.search)) return false;
  try {
    const id = decodeURIComponent(url.search.slice(4));
    return id.length >= 8 && id.length <= 8192 && /^[A-Za-z0-9+/_=-]+$/.test(id);
  } catch { return false; }
}

export function isResolvableDownload(link: WatchSourceLink): boolean {
  const url = mediaUrl(link.url);
  return !!url && link.kind === "download" && ["movie", "episode", "season"].includes(link.scope) &&
    (isGreenMotorsUrl(link.url) || (!url.search && !url.hash && (
      (url.origin === "https://hubcloud.ist" && /^\/drive\/[a-z0-9]+\/?$/.test(url.pathname)) ||
      (url.origin === "https://hubdrive.pics" && /^\/file\/\d+\/?$/.test(url.pathname)) ||
      (["https://hubcdn.club", "https://hubcdn.wiki"].includes(url.origin) && /^\/file\/[a-zA-Z0-9]+\/?$/.test(url.pathname))
    )));
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
