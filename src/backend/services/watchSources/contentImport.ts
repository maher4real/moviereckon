import "server-only";
import { getServerMovieDetails, getServerTVShowDetails, getServerTVExternalIds } from "@/backend/services/tmdbServer";
import type { ContentWatchSources, FetchContentSourcesResult, ParsedSourcePage, SourceMediaType, SourceSearchEvent } from "@/shared/types/watchSources";
import { getImporterConfig, sourcePageUrl, type ImporterConfig } from "./config";
import { fetchSourceDocument, type SourceResponse } from "./http";
import { createContentMatcher, type MatchResult } from "./matcher";
import { normalizeSourceTitle } from "./parser";
import { catalogProvider, catalogIndexUrl, discoverCatalogPages, parseCatalogPage } from "./catalogs";
import { discoverArchive } from "./discovery";
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
  archive: typeof discoverArchive;
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
  onEvent?: (event: SourceSearchEvent) => void,
): Promise<FetchContentSourcesResult> {
  const deps = dependencies || { identity: getContentIdentity, lookup: lookupContentSources,
    repository: () => createSourceRepository(catalogProvider(config)), fetchDocument: fetchSourceDocument, match: createContentMatcher(), run: runSourceImport, archive: discoverArchive };
  const started = Date.now();
  const emit = (event: SourceSearchEvent) => { try { onEvent?.(event); } catch { /* disconnected consumer */ } };
  // Saved links are useful even if TMDB or another provider is temporarily down.
  const savedLookup = deps.lookup(contentId, contentType).then((content) => {
    emit({ type: "content", content });
    return content;
  });
  const identityLookup = deps.identity(contentId, contentType).then((identity) => ({ identity }), (error: unknown) => ({ error }));
  const [identityResult, saved] = await Promise.all([identityLookup, savedLookup]);
  if ("error" in identityResult) throw identityResult.error;
  const identity = identityResult.identity;
  emit({ type: "progress", message: `Searching ${catalogProvider(config) === "hdhub" ? "HDHub" : "4KHDHub"} for matching releases…` });
  const candidates = new Set<string>();
  let errors = 0;
  let repository: SourceRepository | undefined;
  if (sourceUrl) {
    candidates.add(sourcePageUrl(sourceUrl, config));
  } else {
    saved.sources.filter((source) => !source.provider || source.provider === catalogProvider(config))
      .forEach((source) => candidates.add(sourcePageUrl(new URL(source.sourcePage).pathname, config)));
    const titles = [...new Set([identity.title, identity.originalTitle].map(normalizeSourceTitle).filter(Boolean))];
    const matchesTitle = (url: string) => {
      try {
        const slug = normalizeSourceTitle(decodeURIComponent(new URL(url).pathname));
        return titles.some((title) => slug === title || slug.startsWith(`${title} `));
      } catch { return false; }
    };
    repository = await deps.repository();
    if (catalogProvider(config) === "hdhub") {
      const archive = await deps.archive(config, repository, deps.fetchDocument, Math.min(started + 90_000, started + config.budgetMs - 60_000));
      errors += archive.errors;
      archive.urls.filter(matchesTitle).forEach((url) => candidates.add(url));
    } else {
      // This catalog publishes a bounded title search, independent of its homepage.
      for (const title of [...new Set([identity.title, identity.originalTitle])].filter(Boolean)) {
        try {
          const document = await deps.fetchDocument(`${config.baseUrl}/?s=${encodeURIComponent(title)}`, config.baseUrl);
          discoverCatalogPages(document.html || "", config).filter(matchesTitle).forEach((url) => candidates.add(url));
        } catch { errors++; }
      }
    }
    // Recent releases supplement the archive until its sitemap catches up.
    for (let page = 1; page <= config.discoveryPages; page++) {
      if (Date.now() - started > config.budgetMs - 60_000) { errors++; break; }
      try {
        const document = await deps.fetchDocument(catalogIndexUrl(config, page), config.baseUrl);
        for (const url of discoverCatalogPages(document.html || "", config)) {
          if (matchesTitle(url)) candidates.add(url);
        }
      } catch { errors++; }
    }
  }
  const snapshots = new Map<string, { response: SourceResponse; parsed: ParsedSourcePage; matching: MatchResult }>();
  const urls = [...candidates].slice(0, 100);
  if (urls.length < candidates.size) errors++;
  emit({ type: "progress", message: `Checking ${urls.length} candidate releases from ${catalogProvider(config) === "hdhub" ? "HDHub" : "4KHDHub"}…` });
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, urls.length) }, async () => {
    while (cursor < urls.length && Date.now() - started < config.budgetMs - 30_000) {
      const url = urls[cursor++];
      try {
        const response = await deps.fetchDocument(url, config.baseUrl);
        if (response.html === null) continue;
        const parsed = parseCatalogPage(response.html, url, config);
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
  if (cursor < urls.length) errors++;
  if (!snapshots.size) {
    if (sourceUrl && errors === 0) throw new SourceSelectionError("This source page does not match the selected movie or series");
    return { status: errors ? "partial" : "not_found", content: saved, importedPages: 0, errors };
  }
  // Reuse the fetched documents and matching results in the durable importer.
  repository ||= await deps.repository();
  const summary = await deps.run({ urls: [...snapshots.keys()], expectedContent: { tmdbId: contentId, mediaType: contentType } },
    { ...config, batchSize: Math.max(config.batchSize, snapshots.size), budgetMs: Math.max(30_001, config.budgetMs - (Date.now() - started)) }, {
      repository, now: () => new Date(),
      onSaved: (record) => {
        if (!record.parsed || !record.match) return;
        emit({ type: "content", content: { contentId, contentType, sources: [{
          provider: record.provider, sourcePage: record.url, title: record.parsed.title,
          checkedAt: record.checkedAt?.toISOString() || null, links: record.parsed.links,
        }] } });
      },
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
