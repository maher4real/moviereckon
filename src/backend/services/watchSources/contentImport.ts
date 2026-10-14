import "server-only";
import { getServerMovieDetails, getServerTVShowDetails, getServerTVExternalIds } from "@/backend/services/tmdbServer";
import type { ContentWatchSources, FetchContentSourcesResult, ParsedSourcePage, SourceMediaType } from "@/shared/types/watchSources";
import { getImporterConfig, sourcePageUrl, type ImporterConfig } from "./config";
import { fetchSourceDocument, type SourceResponse } from "./http";
import { createContentMatcher, type MatchResult } from "./matcher";
import { discoverSourcePages, normalizeSourceTitle, parseSourcePage } from "./parser";
import { runSourceImport } from "./importer";
import { createSourceRepository, lookupContentSources, type SourceRepository } from "./store";

interface ContentIdentity {
  title: string;
  originalTitle: string;
  imdbId: string | null;
}

interface ContentImportDependencies {
  identity: (id: number, type: SourceMediaType) => Promise<ContentIdentity>;
  lookup: typeof lookupContentSources;
  repository: () => Promise<SourceRepository>;
  fetchDocument: typeof fetchSourceDocument;
  match: (page: ParsedSourcePage) => Promise<MatchResult>;
  run: typeof runSourceImport;
}

export class SourceSelectionError extends Error {}

async function getContentIdentity(id: number, type: SourceMediaType): Promise<ContentIdentity> {
  if (type === "movie") {
    const movie = await getServerMovieDetails(id, 8_000);
    return { title: movie.title, originalTitle: movie.original_title, imdbId: movie.imdb_id || null };
  }
  const [show, external] = await Promise.all([getServerTVShowDetails(id, 8_000), getServerTVExternalIds(id, 8_000)]);
  return { title: show.name, originalTitle: show.original_name, imdbId: external.imdb_id || null };
}

/** Import only verified candidates for the requested TMDB title; never run a global batch. */
export async function fetchContentSources(
  contentId: number, contentType: SourceMediaType, sourceUrl?: string,
  config: ImporterConfig = getImporterConfig(), dependencies?: ContentImportDependencies,
): Promise<FetchContentSourcesResult> {
  const deps = dependencies || { identity: getContentIdentity, lookup: lookupContentSources,
    repository: createSourceRepository, fetchDocument: fetchSourceDocument, match: createContentMatcher(), run: runSourceImport };
  const started = Date.now();
  const [identity, saved] = await Promise.all([deps.identity(contentId, contentType), deps.lookup(contentId, contentType)]);
  const candidates = new Set<string>();
  let errors = 0;
  if (sourceUrl) {
    candidates.add(sourcePageUrl(sourceUrl, config));
  } else {
    saved.sources.forEach((source) => candidates.add(sourcePageUrl(new URL(source.sourcePage).pathname, config)));
    const titles = [...new Set([identity.title, identity.originalTitle].map(normalizeSourceTitle).filter(Boolean))];
    // The source's JS search proxy currently rejects server requests. Use the
    // published release indexes and offer an explicit post URL for older titles.
    for (let page = 1; page <= config.discoveryPages; page++) {
      if (Date.now() - started > config.budgetMs - 60_000) break;
      try {
        const document = await deps.fetchDocument(`${config.baseUrl}${page === 1 ? "/" : `/page/${page}/`}`, config.baseUrl);
        for (const url of discoverSourcePages(document.html || "", config.baseUrl)) {
          const slug = normalizeSourceTitle(new URL(url).pathname);
          if (titles.some((title) => slug === title || slug.startsWith(`${title} `))) candidates.add(url);
        }
      } catch { errors++; }
    }
  }
  const snapshots = new Map<string, { response: SourceResponse; parsed: ParsedSourcePage; matching: MatchResult }>();
  const urls = [...candidates].slice(0, 12);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, urls.length) }, async () => {
    while (cursor < urls.length && Date.now() - started < config.budgetMs - 30_000) {
      const url = urls[cursor++];
      try {
        const response = await deps.fetchDocument(url, config.baseUrl);
        if (response.html === null) continue;
        const parsed = parseSourcePage(response.html, url);
        if (!parsed.links.length || parsed.mediaType !== contentType) continue;
        if (parsed.imdbId && identity.imdbId && parsed.imdbId !== identity.imdbId) continue;
        const matching: MatchResult = parsed.imdbId && parsed.imdbId === identity.imdbId ?
          { status: "matched", match: { tmdbId: contentId, mediaType: contentType, method: "imdb" }, reason: null } : await deps.match(parsed);
        if (matching.match?.tmdbId === contentId && matching.match.mediaType === contentType) {
          snapshots.set(url, { response, parsed, matching });
        }
      } catch { errors++; }
    }
  }));
  if (!snapshots.size) {
    if (sourceUrl && errors === 0) throw new SourceSelectionError("This source page does not match the selected movie or series");
    return { status: errors ? "partial" : "not_found", content: saved, importedPages: 0, errors };
  }
  // Reuse the fetched documents and matching results in the durable importer.
  const repository = await deps.repository();
  const summary = await deps.run({ urls: [...snapshots.keys()], expectedContent: { tmdbId: contentId, mediaType: contentType } },
    { ...config, batchSize: Math.max(config.batchSize, snapshots.size), budgetMs: Math.max(30_001, config.budgetMs - (Date.now() - started)) }, {
      repository, now: () => new Date(),
      fetchDocument: async (url) => {
        const snapshot = snapshots.get(url);
        if (!snapshot) throw new Error("Source page was not validated for this title");
        return snapshot.response;
      },
      match: async (parsed) => {
        const snapshot = [...snapshots.values()].find((entry) => entry.parsed.imdbId === parsed.imdbId &&
          entry.parsed.title === parsed.title && entry.parsed.mediaType === parsed.mediaType);
        if (!snapshot) throw new Error("Source identity changed during import");
        return snapshot.matching;
      },
    });
  const content: ContentWatchSources = summary.skipped ? saved : await deps.lookup(contentId, contentType);
  return { status: summary.skipped ? "busy" : errors + summary.errors > 0 ? "partial" : "imported",
    content, importedPages: summary.matched, errors: errors + summary.errors };
}
