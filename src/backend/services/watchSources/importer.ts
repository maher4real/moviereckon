import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { ParsedSourcePage } from "@/shared/types/watchSources";
import { getImporterConfig, sourcePageUrl, type ImporterConfig } from "./config";
import { catalogProvider, catalogIndexUrl, discoverCatalogPages, parseCatalogPage } from "./catalogs";
import { discoverArchive } from "./discovery";
import { fetchSourceDocument, type SourceResponse } from "./http";
import { createContentMatcher, type MatchResult } from "./matcher";
import { normalizeSourceTitle } from "./parser";
import { createSourceRepository, sourcePageId, type ImportSummary, type SourceRepository, type SourcePageRecord } from "./store";

interface ImportDependencies {
  repository: SourceRepository;
  fetchDocument: typeof fetchSourceDocument;
  match: (page: ParsedSourcePage) => Promise<MatchResult>;
  now: () => Date;
  archive?: typeof discoverArchive;
  onSaved?: (record: SourcePageRecord) => void;
}

export function emptyImportSummary(): ImportSummary {
  return { discovered: 0, enqueued: 0, processed: 0, updated: 0, unchanged: 0,
    matched: 0, pending: 0, review: 0, errors: 0, remaining: 0, skipped: false };
}

function sameIdentity(before: ParsedSourcePage | null, after: ParsedSourcePage): boolean {
  if (!before || before.mediaType !== after.mediaType) return false;
  if (before.imdbId || after.imdbId) return before.imdbId === after.imdbId;
  return before.year === after.year && normalizeSourceTitle(before.title) === normalizeSourceTitle(after.title);
}

export async function previewSourcePages(urls: string[], config = getImporterConfig()) {
  const match = createContentMatcher();
  const validated = urls.map((value) => sourcePageUrl(value, config));
  const results: Array<{ url: string; parsed: ParsedSourcePage; matching: MatchResult }> = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, validated.length) }, async () => {
    while (cursor < validated.length) {
      const index = cursor++;
      const url = validated[index];
      const response = await fetchSourceDocument(url, config.baseUrl);
      const parsed = parseCatalogPage(response.html || "", url, config);
      const matching: MatchResult = process.env.TMDB_API_KEY ? await match(parsed) :
        { status: "pending", match: null, reason: "TMDB_API_KEY is not configured" };
      results[index] = { url, parsed, matching };
    }
  }));
  return results;
}

/** Bounded, resumable import. Public content reads only query MongoDB, never scrape. */
export async function runSourceImport(
  options: { urls?: string[]; expectedContent?: { tmdbId: number; mediaType: "movie" | "tv" } } = {},
  config: ImporterConfig = getImporterConfig(),
  dependencies?: ImportDependencies,
): Promise<ImportSummary> {
  const deps = dependencies || {
    repository: await createSourceRepository(catalogProvider(config)), fetchDocument: fetchSourceDocument,
    match: createContentMatcher(), now: () => new Date(), archive: discoverArchive,
  };
  const repo = deps.repository;
  const urls = options.urls?.map((value) => sourcePageUrl(value, config));
  const token = randomUUID();
  const started = deps.now();
  const deadline = started.getTime() + config.budgetMs;
  const summary = emptyImportSummary();
  const recent = new Set<string>();
  if (!await repo.acquire(token, started, config.budgetMs + 60_000)) return { ...summary, skipped: true };
  try {
    if (urls?.length) {
      summary.discovered = urls.length;
      summary.enqueued = await repo.enqueue(urls, deps.now(), true);
    } else {
      const discovered = new Set<string>();
      if (deps.archive && catalogProvider(config) === "hdhub") {
        const archive = await deps.archive(config, repo, deps.fetchDocument, Date.now() + Math.min(90_000, config.budgetMs - 60_000));
        archive.urls.forEach((url) => discovered.add(url));
        summary.errors += archive.errors;
      }
      for (let page = 1; page <= config.discoveryPages; page++) {
        if (deps.now().getTime() >= deadline - 30_000) break;
        const url = catalogIndexUrl(config, page);
        const cached = await repo.discovery(url);
        try {
          const result = await deps.fetchDocument(url, config.baseUrl, cached || {});
          const found = result.html === null ? cached?.urls || [] : discoverCatalogPages(result.html, config);
          // Empty/challenge pages cannot silently replace a good discovery snapshot.
          if (!found.length) throw new Error("No content pages discovered");
          const validated = found.map((value) => sourcePageUrl(value, config));
          validated.forEach((value) => { discovered.add(value); recent.add(value); });
          await repo.saveDiscovery({ _id: url, urls: validated, etag: result.etag, lastModified: result.lastModified });
        } catch {
          summary.errors++;
          // Existing queue jobs can still progress while discovery is unavailable.
        }
      }
      summary.discovered = discovered.size;
      summary.enqueued = await repo.enqueue([...discovered], deps.now());
    }
    // Reserve room for archive jobs, but never leave new releases behind the archive.
    const priority = !urls && recent.size ? await repo.due(deps.now(), Math.max(1, Math.ceil(config.batchSize * 0.75)),
      [...recent].map((url) => sourcePageId(url, catalogProvider(config)))) : [];
    const queued = await repo.due(deps.now(), config.batchSize, urls?.map((url) => sourcePageId(url, catalogProvider(config))));
    const jobs = [...new Map([...priority, ...queued].map((job) => [job._id, job])).values()].slice(0, config.batchSize);
    let cursor = 0;
    async function process(record: SourcePageRecord) {
      summary.processed++;
      const now = deps.now();
      try {
        // Replace the rotating origin even for older queued pages; only trusted
        // configured-origin documents are fetched, never stored video destinations.
        const url = sourcePageUrl(new URL(record.url).pathname, config);
        const originChanged = new URL(record.url).origin !== config.baseUrl;
        const response: SourceResponse = await deps.fetchDocument(url, config.baseUrl, originChanged ? {} : record);
        const parsed = response.html === null ? record.parsed : parseCatalogPage(response.html, url, config);
        if (!parsed?.links.length) throw new Error("Source page has no downloadable or watch links");
        const hash = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
        let matching: MatchResult;
        let matchError = false;
        const expected = options.expectedContent;
        if (record.match && sameIdentity(record.parsed, parsed) && (!expected ||
            (record.match.tmdbId === expected.tmdbId && record.match.mediaType === expected.mediaType))) {
          matching = { status: "matched", match: record.match, reason: null };
        } else {
          try { matching = await deps.match(parsed); } catch {
            matching = { status: "pending", match: null, reason: "TMDB lookup unavailable; will retry" };
            matchError = true; summary.errors++;
          }
        }
        if (expected && (!matching.match || matching.match.tmdbId !== expected.tmdbId || matching.match.mediaType !== expected.mediaType)) {
          throw new Error("Source did not match the selected content");
        }
        const failures = matchError ? record.failures + 1 : 0;
        const interval = matchError ? Math.min(48 * 60, 15 * 2 ** Math.min(failures - 1, 8)) * 60_000 :
          matching.status === "matched" ? (recent.has(url) ? Math.min(1, config.refreshHours) : config.refreshHours) * 3_600_000 : 6 * 3_600_000;
        const updated: SourcePageRecord = { ...record, url, parsed, contentHash: hash, status: matching.status, match: matching.match,
          etag: response.etag, lastModified: response.lastModified, checkedAt: now,
          nextCheckAt: new Date(now.getTime() + interval), failures, lastError: matching.reason };
        await repo.save(updated);
        // Observers cannot turn a successful durable write into an import failure.
        try { deps.onSaved?.(updated); } catch { /* disconnected consumer */ }
        if (hash === record.contentHash) summary.unchanged++; else summary.updated++;
        summary[matching.status]++;
      } catch (error) {
        summary.errors++;
        const failures = record.failures + 1;
        // Retain the last good link snapshot on transport/HTML failures.
        await repo.save({ ...record, status: "error", failures,
          lastError: error instanceof Error ? error.message.slice(0, 200) : "Import failed",
          nextCheckAt: new Date(now.getTime() + Math.min(48 * 60, 15 * 2 ** Math.min(failures - 1, 8)) * 60_000) });
      }
    }
    await Promise.all(Array.from({ length: Math.min(config.concurrency, jobs.length) }, async () => {
      while (cursor < jobs.length && deps.now().getTime() < deadline - 30_000) {
        const job = jobs[cursor++];
        await process(job);
      }
    }));
    summary.remaining = await repo.remaining(deps.now());
    return summary;
  } finally {
    await repo.release(token, summary);
  }
}
