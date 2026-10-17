/**
 * MongoDB Backend API Client
 * Uses MongoDB backend exclusively - no fallback to other services.
 *
 * The client is split by area under `./api/*`; this module re-exports all of
 * it so existing imports keep working.
 */
import type { ContentWatchSources, DirectMediaSource, FetchContentSourcesResult, ResolvedDownload, SourceMediaType, SourceSearchEvent, WatchSourceIdentity } from "@/shared/types/watchSources";
import { fetchWithAuth } from "./api/http";

export * from "./api/http";
export * from "./api/models";
export * from "./api/auth";
export * from "./api/user";
export * from "./api/feedback";
export * from "./api/comments";
export * from "./api/recommendations";

export async function resolveDownloadLink(identity: WatchSourceIdentity, linkId: string, signal?: AbortSignal): Promise<ResolvedDownload[]> {
  const response = await fetchWithAuth("/api/watch-sources/resolve", {
    method: "POST", signal, body: JSON.stringify({ ...identity, linkId }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Unable to get this file link");
  if (!Array.isArray(data?.downloads) || !data.downloads.length) throw new Error("No confirmed file link is available");
  return data.downloads;
}

export async function resolveWatchLink(identity: WatchSourceIdentity, linkId: string, signal?: AbortSignal): Promise<DirectMediaSource[]> {
  const response = await fetchWithAuth("/api/watch-sources/resolve", {
    method: "POST", signal, body: JSON.stringify({ ...identity, linkId }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Unable to load this stream");
  if (!Array.isArray(data?.sources) || !data.sources.length) throw new Error("No direct stream available");
  return data.sources;
}

export async function getWatchSources(
  contentId: number, contentType: SourceMediaType, signal?: AbortSignal,
): Promise<ContentWatchSources> {
  const query = new URLSearchParams({ contentId: String(contentId), contentType });
  const response = await fetchWithAuth(`/api/watch-sources?${query}`, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Watch links are temporarily unavailable");
  if (data?.contentId !== contentId || data?.contentType !== contentType || !Array.isArray(data.sources)) {
    throw new Error("The watch link response was incomplete");
  }
  return data as ContentWatchSources;
}

export async function fetchWatchLinks(
  contentId: number, contentType: SourceMediaType, sourceUrl?: string, signal?: AbortSignal,
): Promise<FetchContentSourcesResult> {
  const response = await fetchWithAuth("/api/watch-sources/fetch", {
    method: "POST", signal,
    body: JSON.stringify({ contentId, contentType, ...(sourceUrl ? { sourceUrl } : {}) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Unable to fetch links right now");
  if (!data?.content || !Array.isArray(data.content.sources)) throw new Error("The link response was incomplete");
  return data as FetchContentSourcesResult;
}

/** Newline-delimited results let the popup show saved and newly imported rows immediately. */
export async function searchWatchLinks(
  identity: WatchSourceIdentity, onEvent: (event: SourceSearchEvent) => void, signal?: AbortSignal,
): Promise<FetchContentSourcesResult> {
  const response = await fetchWithAuth("/api/watch-sources/fetch", {
    method: "POST", headers: { Accept: "application/x-ndjson" }, signal, body: JSON.stringify(identity),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unable to search providers right now");
  }
  return readSourceSearchEvents(response, identity, onEvent, signal);
}

export async function readSourceSearchEvents(
  response: Response, identity: WatchSourceIdentity, onEvent: (event: SourceSearchEvent) => void, signal?: AbortSignal,
): Promise<FetchContentSourcesResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Search response was empty");
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: FetchContentSourcesResult | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as SourceSearchEvent;
    const content = event.type === "content" ? event.content : event.type === "complete" ? event.result?.content : null;
    if (content && (content.contentId !== identity.contentId || content.contentType !== identity.contentType || !Array.isArray(content.sources))) {
      throw new Error("Search returned links for a different title");
    }
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "complete") complete = event.result;
    if (event.type === "progress" || event.type === "content" || event.type === "complete") onEvent(event);
  };
  try {
    while (!complete) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 4_000_000) throw new Error("Search response was too large");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    if (!complete) throw new Error("Search interrupted. Try again to find remaining links.");
    return complete;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
