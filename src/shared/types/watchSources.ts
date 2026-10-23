export type WatchCatalogProvider = "hdhub" | "4khdhub" | "moviesmod" | "bollyflix" | "uhdmovies";

export type SourceMediaType = "movie" | "tv";

export interface WatchSourceIdentity {
  contentId: number;
  contentType: SourceMediaType;
}

export interface DirectMediaSource {
  url: string;
  format: "mp4" | "webm" | "hls";
  referrerPolicy?: "no-referrer";
  // Validated provider playlist metadata; media still loads from its public CDN.
  hlsPlaylist?: string;
  label: string;
}

export interface ResolvedDownload {
  url: string;
  filename: string;
  sizeBytes: number | null;
  contentType: string;
  checkedAt: string;
  expiresAt: string | null;
}

export interface WatchSourceLink {
  id: string;
  label: string;
  url: string;
  host: string;
  kind: "download" | "watch" | "collection";
  // A player page is never presented as a verified direct media stream.
  verification: "unverified";
  releaseYear?: number | null;
  quality: string | null;
  resolution: number | null;
  codec: "H.264" | "HEVC" | "AV1" | null;
  bitDepth: number | null;
  size: string | null;
  formats: string[];
  languages: string[];
  scope: "movie" | "season" | "episode" | "episode-range" | "series";
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
}

export interface ParsedSourcePage {
  title: string;
  year: number | null;
  mediaType: SourceMediaType;
  imdbId: string | null;
  season: number | null;
  links: WatchSourceLink[];
}

export interface SourceContentMatch {
  tmdbId: number;
  mediaType: SourceMediaType;
  method: "imdb" | "title-year";
}

export interface ContentWatchSources {
  contentId: number;
  contentType: SourceMediaType;
  sources: Array<{
    provider: WatchCatalogProvider;
    sourcePage: string;
    title: string;
    checkedAt: string | null;
    links: WatchSourceLink[];
  }>;
}

export interface FetchContentSourcesResult {
  status: "imported" | "partial" | "not_found" | "busy";
  content: ContentWatchSources;
  importedPages: number;
  errors: number;
}

export type SourceSearchEvent =
  | { type: "content"; content: ContentWatchSources }
  | { type: "progress"; message: string }
  | { type: "complete"; result: FetchContentSourcesResult }
  | { type: "error"; message: string };

/** Evidence from a bounded file or stream check, never from an HTML status alone. */
export interface WatchLinkCheck {
  linkId: string;
  url: string;
  available: boolean;
  checkedAt: string;
  validUntil: string;
  downloads: ResolvedDownload[];
}
