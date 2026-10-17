import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runSourceImport } from "./importer";
import { parseSourcePage } from "./parser";
import { sourcePageId, type SourcePageRecord, type SourceRepository, type DiscoveryRecord } from "./store";

const config = { baseUrl: "https://new7.hdhub4u.cl", batchSize: 20, concurrency: 3, discoveryPages: 1, refreshHours: 24, budgetMs: 210_000 };
const url = `${config.baseUrl}/weapons-2025-hindi-studio-dub-bluray-full-movie/`;
const html = readFileSync(`${process.cwd()}/src/backend/services/watchSources/fixtures/movie.html`, "utf8");
const now = new Date("2026-10-14T00:00:00Z");
const matched = { status: "matched" as const, match: { tmdbId: 1078605, mediaType: "movie" as const, method: "imdb" as const }, reason: null };

function repository() {
  const records = new Map<string, SourcePageRecord>();
  const discoveries = new Map<string, DiscoveryRecord>();
  const repo: SourceRepository = {
    acquire: vi.fn().mockResolvedValue(true), release: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn(async (urls: string[], time: Date, force = false) => {
      let added = 0;
      for (const value of urls) {
        const id = sourcePageId(value);
        const existing = records.get(id);
        if (existing) { records.set(id, { ...existing, url: value, ...(force ? { nextCheckAt: time } : {}) }); continue; }
        records.set(id, { _id: id, provider: "hdhub", url: value, status: "queued", parsed: null, match: null,
          contentHash: null, etag: null, lastModified: null, nextCheckAt: time, checkedAt: null, createdAt: time, failures: 0, lastError: null });
        added++;
      }
      return added;
    }),
    due: vi.fn(async (time: Date, limit: number, ids?: string[]) => [...records.values()]
      .filter((record) => record.nextCheckAt <= time && (!ids || ids.includes(record._id))).slice(0, limit)),
    save: vi.fn(async (record: SourcePageRecord) => { records.set(record._id, record); }),
    remaining: vi.fn(async (time: Date) => [...records.values()].filter((record) => record.nextCheckAt <= time).length),
    discovery: vi.fn(async (id: string) => discoveries.get(id) || null),
    saveDiscovery: vi.fn(async (record: DiscoveryRecord) => { discoveries.set(record._id, record); }),
  };
  return { repo, records, discoveries };
}

describe("resumable source importer", () => {
  it("processes recent releases ahead of archive backlog while preserving archive progress", async () => {
    const { repo, records } = repository();
    const backlog = Array.from({ length: 8 }, (_, i) => `${config.baseUrl}/old-${i}-full-movie/`);
    await repo.enqueue(backlog, new Date(now.getTime() - 86400000));
    const recent = `${config.baseUrl}/new-full-movie/`;
    const seen: string[] = [];
    const onSaved = vi.fn((record) => { expect(records.get(record._id)).toEqual(record); });
    const fetchDocument = vi.fn(async (value: string) => {
      if (value === `${config.baseUrl}/`) return { html: `<a href="${recent}">New</a>`, etag: null, lastModified: null };
      seen.push(value); return { html, etag: null, lastModified: null };
    });
    await runSourceImport({}, { ...config, batchSize: 4, concurrency: 1 },
      { repository: repo, fetchDocument, match: vi.fn().mockResolvedValue(matched), now: () => now, onSaved });
    expect(seen).toHaveLength(4);
    expect(seen[0]).toBe(recent);
    expect(seen.slice(1).every((value) => backlog.includes(value))).toBe(true);
    expect(records.get(sourcePageId(recent))!.nextCheckAt.getTime() - now.getTime()).toBe(3600000);
    expect(onSaved).toHaveBeenCalledTimes(4);
  });

  it("persists all sources, avoids duplicates and reuses matching after a conditional 304", async () => {
    const { repo, records } = repository();
    const fetchDocument = vi.fn().mockResolvedValueOnce({ html, etag: '"v1"', lastModified: null })
      .mockResolvedValue({ html: null, etag: '"v1"', lastModified: null });
    const match = vi.fn().mockResolvedValue(matched);
    const dependencies = { repository: repo, fetchDocument, match, now: () => now };
    const first = await runSourceImport({ urls: [url] }, config, dependencies);
    expect(first).toMatchObject({ enqueued: 1, updated: 1, matched: 1, errors: 0 });
    const second = await runSourceImport({ urls: [url] }, config, dependencies);
    expect(second).toMatchObject({ enqueued: 0, unchanged: 1, matched: 1 });
    expect(match).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(1);
    expect(records.get(sourcePageId(url))?.parsed?.links).toHaveLength(10);
    expect(fetchDocument.mock.calls[1][2]).toMatchObject({ etag: '"v1"' });
  });

  it("preserves a last-good snapshot and backs off on challenges or missing download sections", async () => {
    const { repo, records } = repository();
    const fetchDocument = vi.fn().mockResolvedValueOnce({ html, etag: null, lastModified: null })
      .mockResolvedValue({ html: "<h1>Cloud challenge</h1>", etag: null, lastModified: null });
    const dependencies = { repository: repo, fetchDocument, match: vi.fn().mockResolvedValue(matched), now: () => now };
    await runSourceImport({ urls: [url] }, config, dependencies);
    const before = records.get(sourcePageId(url))!;
    const failed = await runSourceImport({ urls: [url] }, config, dependencies);
    const after = records.get(sourcePageId(url))!;
    expect(failed.errors).toBe(1);
    expect(after.parsed).toEqual(before.parsed);
    expect(after.match).toEqual(before.match);
    expect(after.checkedAt).toEqual(before.checkedAt);
    expect(after).toMatchObject({ status: "error", failures: 1 });
    expect(after.nextCheckAt.getTime() - now.getTime()).toBe(15 * 60_000);
  });

  it("stores extraction when TMDB is unavailable and retries matching on a 304", async () => {
    const { repo, records } = repository();
    const fetchDocument = vi.fn().mockResolvedValueOnce({ html, etag: '"v1"', lastModified: null })
      .mockResolvedValue({ html: null, etag: '"v1"', lastModified: null });
    const match = vi.fn().mockRejectedValueOnce(new Error("TMDB unavailable")).mockResolvedValue(matched);
    const dependencies = { repository: repo, fetchDocument, match, now: () => now };
    await runSourceImport({ urls: [url] }, config, dependencies);
    expect(records.get(sourcePageId(url))).toMatchObject({ status: "pending", match: null });
    expect(records.get(sourcePageId(url))?.parsed?.links).toHaveLength(10);
    await runSourceImport({ urls: [url] }, config, dependencies);
    expect(records.get(sourcePageId(url))).toMatchObject({ status: "matched", match: matched.match, failures: 0 });
    expect(match).toHaveBeenCalledTimes(2);
  });

  it("reuses discovery cache without resetting a future refresh time", async () => {
    const { repo, records, discoveries } = repository();
    await repo.enqueue([url], now);
    const future = new Date(now.getTime() + 86_400_000);
    records.get(sourcePageId(url))!.nextCheckAt = future;
    discoveries.set(`${config.baseUrl}/`, { _id: `${config.baseUrl}/`, etag: '"index"', lastModified: null, urls: [url] });
    const fetchDocument = vi.fn().mockResolvedValue({ html: null, etag: '"index"', lastModified: null });
    const result = await runSourceImport({}, config, { repository: repo, fetchDocument, match: vi.fn(), now: () => now });
    expect(result).toMatchObject({ discovered: 1, enqueued: 0, processed: 0 });
    expect(records.get(sourcePageId(url))?.nextCheckAt).toEqual(future);
  });

  it("makes progress on queued jobs even when discovery fails", async () => {
    const { repo } = repository();
    await repo.enqueue([url], now);
    const fetchDocument = vi.fn().mockRejectedValueOnce(new Error("source index unavailable"))
      .mockResolvedValue({ html, etag: null, lastModified: null });
    const result = await runSourceImport({}, config, { repository: repo, fetchDocument, match: vi.fn().mockResolvedValue(matched), now: () => now });
    expect(result).toMatchObject({ errors: 1, processed: 1, matched: 1 });
    expect(repo.release).toHaveBeenCalled();
  });

  it("refuses overlap and untrusted manual destinations before making requests", async () => {
    const { repo } = repository();
    vi.mocked(repo.acquire).mockResolvedValue(false);
    const fetchDocument = vi.fn();
    const dependencies = { repository: repo, fetchDocument, match: vi.fn(), now: () => now };
    expect(await runSourceImport({ urls: [url] }, config, dependencies)).toMatchObject({ skipped: true });
    expect(fetchDocument).not.toHaveBeenCalled();
    await expect(runSourceImport({ urls: ["https://other.example/post/"] }, config, dependencies)).rejects.toThrow("Source page");
  });

  it("resumes remaining work after a batch and honors the concurrency limit", async () => {
    const { repo } = repository();
    const urls = Array.from({ length: 8 }, (_, i) => `${config.baseUrl}/example-${i}-full-movie/`);
    let active = 0;
    let maxActive = 0;
    const fetchDocument = vi.fn(async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return { html, etag: null, lastModified: null };
    });
    const result = await runSourceImport({ urls }, { ...config, batchSize: 5, concurrency: 2 },
      { repository: repo, fetchDocument, match: vi.fn().mockResolvedValue(matched), now: () => now });
    expect(result).toMatchObject({ enqueued: 8, processed: 5, remaining: 3 });
    expect(maxActive).toBe(2);
  });

  it("does not reuse a content match if the page identity changes", async () => {
    const { repo, records } = repository();
    await repo.enqueue([url], now);
    const record = records.get(sourcePageId(url))!;
    records.set(record._id, { ...record, parsed: { ...parseSourcePage(html, url), imdbId: "tt0000001" }, match: matched.match });
    const match = vi.fn().mockResolvedValue({ status: "review", match: null, reason: "ambiguous" });
    await runSourceImport({ urls: [url] }, config,
      { repository: repo, fetchDocument: vi.fn().mockResolvedValue({ html, etag: null, lastModified: null }), match, now: () => now });
    expect(match).toHaveBeenCalledTimes(1);
    expect(records.get(record._id)?.match).toBeNull();
  });
});
