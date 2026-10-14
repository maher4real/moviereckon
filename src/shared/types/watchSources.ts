export type SourceMediaType = "movie" | "tv";

export interface WatchSourceLink {
  id: string;
  label: string;
  url: string;
  host: string;
  kind: "download" | "watch" | "collection";
  // A player page is never presented as a verified direct media stream.
  verification: "unverified";
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
    provider: "hdhub";
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
