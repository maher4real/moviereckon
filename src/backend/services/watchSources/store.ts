import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { connectToDatabase } from "@/backend/api/lib/mongodb";
import type { ParsedSourcePage, SourceContentMatch, ContentWatchSources } from "@/shared/types/watchSources";

export interface SourcePageRecord {
  _id: string;
  provider: "hdhub";
  url: string;
  status: "queued" | "matched" | "pending" | "review" | "error";
  parsed: ParsedSourcePage | null;
  match: SourceContentMatch | null;
  contentHash: string | null;
  etag: string | null;
  lastModified: string | null;
  nextCheckAt: Date;
  checkedAt: Date | null;
  createdAt: Date;
  failures: number;
  lastError: string | null;
}

export interface DiscoveryRecord {
  _id: string;
  etag: string | null;
  lastModified: string | null;
  urls: string[];
}

export interface ImportSummary {
  discovered: number;
  enqueued: number;
  processed: number;
  updated: number;
  unchanged: number;
  matched: number;
  pending: number;
  review: number;
  errors: number;
  remaining: number;
  skipped: boolean;
}

export interface SourceRepository {
  acquire(token: string, now: Date, leaseMs: number): Promise<boolean>;
  release(token: string, summary: ImportSummary): Promise<void>;
  enqueue(urls: string[], now: Date, force?: boolean): Promise<number>;
  due(now: Date, limit: number, ids?: string[]): Promise<SourcePageRecord[]>;
  save(record: SourcePageRecord): Promise<void>;
  remaining(now: Date): Promise<number>;
  discovery(id: string): Promise<DiscoveryRecord | null>;
  saveDiscovery(record: DiscoveryRecord): Promise<void>;
}

// Identity is independent of the rotating source domain; URLs are refreshed on discovery.
export const sourcePageId = (url: string) => createHash("sha256").update(`hdhub:${new URL(url).pathname}`).digest("hex");

export async function createSourceRepository(): Promise<SourceRepository> {
  const { db } = await connectToDatabase();
  return mongoSourceRepository(db);
}

export async function mongoSourceRepository(db: Db): Promise<SourceRepository> {
  const pages = db.collection<SourcePageRecord>("watch_source_pages");
  const discovery = db.collection<DiscoveryRecord>("watch_source_discovery");
  const state = db.collection<{ _id: string; token?: string; leaseUntil: Date; lastRun?: ImportSummary }>("watch_import_state");
  // These indexes are mandatory: an importer must not quietly operate without them.
  await Promise.all([
    pages.createIndex({ nextCheckAt: 1 }, { name: "watch_source_due" }),
    pages.createIndex({ "match.mediaType": 1, "match.tmdbId": 1 }, { name: "watch_source_content" }),
  ]);
  return {
    async acquire(token, now, leaseMs) {
      await state.updateOne({ _id: "hdhub" }, { $setOnInsert: { leaseUntil: new Date(0) } }, { upsert: true });
      const result = await state.findOneAndUpdate({ _id: "hdhub", leaseUntil: { $lte: now } },
        { $set: { token, leaseUntil: new Date(now.getTime() + leaseMs) } }, { returnDocument: "after" });
      return !!result;
    },
    async release(token, summary) {
      await state.updateOne({ _id: "hdhub", token }, { $set: { leaseUntil: new Date(0), lastRun: summary }, $unset: { token: "" } });
    },
    async enqueue(urls, now, force = false) {
      if (!urls.length) return 0;
      const result = await pages.bulkWrite([...new Set(urls)].map((url) => ({ updateOne: {
        filter: { _id: sourcePageId(url) },
        update: {
          $set: { url, ...(force ? { nextCheckAt: now } : {}) },
          $setOnInsert: { provider: "hdhub" as const, createdAt: now, status: "queued" as const,
            parsed: null, match: null, contentHash: null, etag: null, lastModified: null,
            checkedAt: null, failures: 0, lastError: null, ...(!force ? { nextCheckAt: now } : {}) },
        }, upsert: true,
      } })), { ordered: false });
      return result.upsertedCount;
    },
    due: (now, limit, ids) => pages.find({ nextCheckAt: { $lte: now }, ...(ids ? { _id: { $in: ids } } : {}) })
      .sort({ nextCheckAt: 1, createdAt: -1 }).limit(limit).toArray(),
    async save(record) { await pages.replaceOne({ _id: record._id }, record); },
    remaining: (now) => pages.countDocuments({ nextCheckAt: { $lte: now } }),
    discovery: (id) => discovery.findOne({ _id: id }),
    async saveDiscovery(record) { await discovery.replaceOne({ _id: record._id }, record, { upsert: true }); },
  };
}

export async function lookupContentSources(
  contentId: number, contentType: "movie" | "tv", season?: number, episode?: number,
): Promise<ContentWatchSources> {
  const { db } = await connectToDatabase();
  const records = await db.collection<SourcePageRecord>("watch_source_pages").find({
    "match.tmdbId": contentId, "match.mediaType": contentType,
  }, { projection: { url: 1, provider: 1, parsed: 1, checkedAt: 1 } }).sort({ checkedAt: -1 }).limit(50).toArray();
  const sources = records.flatMap((record) => {
    const links = record.parsed?.links.filter((link) => {
      if (season !== undefined && link.season !== season) return false;
      if (episode === undefined) return true;
      // Season packs and generic series players cannot masquerade as an episode.
      return (link.scope === "episode" && link.episode === episode) ||
        (link.scope === "episode-range" && link.episode !== null && link.episodeEnd !== null && link.episode <= episode && link.episodeEnd >= episode);
    }) || [];
    return links.length ? [{ provider: record.provider, sourcePage: record.url, title: record.parsed!.title,
      checkedAt: record.checkedAt?.toISOString() || null, links }] : [];
  });
  return { contentId, contentType, sources };
}
