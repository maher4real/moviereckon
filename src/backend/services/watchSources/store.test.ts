import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseSourcePage } from "./parser";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: mocks.connect }));
import { lookupContentSources, mongoSourceRepository, sourcePageId } from "./store";

beforeEach(() => vi.clearAllMocks());

describe("durable source storage", () => {
  it("reads the matched title and excludes season packs from an episode lookup", async () => {
    const html = readFileSync(`${process.cwd()}/src/backend/services/watchSources/fixtures/series.html`, "utf8");
    const record = { url: "https://source.example/series/", provider: "hdhub", checkedAt: new Date("2026-10-14T00:00:00Z"),
      parsed: parseSourcePage(html, "https://source.example/series/") };
    const query = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([record]) };
    const find = vi.fn().mockReturnValue(query);
    mocks.connect.mockResolvedValue({ db: { collection: () => ({ find }) } });
    const result = await lookupContentSources(42, "tv", 1, 2);
    expect(find.mock.calls[0][0]).toEqual({ "match.tmdbId": 42, "match.mediaType": "tv" });
    expect(result.sources[0].links).toHaveLength(5);
    expect(result.sources[0].links.every((link) => link.scope === "episode" && link.episode === 2 && link.season === 1)).toBe(true);
    expect(result.sources[0].links.filter((link) => link.kind === "watch")).toHaveLength(1);
    expect((await lookupContentSources(42, "tv", 1, 99)).sources).toEqual([]);
  });

  it("requires indexes, uses an atomic lease, and never resets discovered pages' refresh times", async () => {
    const collection = { createIndex: vi.fn().mockResolvedValue("index"), updateOne: vi.fn().mockResolvedValue({}),
      findOneAndUpdate: vi.fn().mockResolvedValue(null), bulkWrite: vi.fn().mockResolvedValue({ upsertedCount: 1 }) };
    const db = { collection: vi.fn().mockReturnValue(collection) };
    const repo = await mongoSourceRepository(db as never);
    const now = new Date();
    expect(collection.createIndex).toHaveBeenCalledTimes(2);
    expect(await repo.acquire("token", now, 60_000)).toBe(false);
    expect(collection.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: "hdhub", leaseUntil: { $lte: now } });
    const url = "https://source.example/post/";
    await repo.enqueue([url, url], now);
    const operations = collection.bulkWrite.mock.calls[0][0];
    expect(operations).toHaveLength(1);
    expect(operations[0].updateOne.update.$set).toEqual({ url });
    expect(operations[0].updateOne.update.$setOnInsert.nextCheckAt).toEqual(now);
    expect(sourcePageId(url)).toBe(sourcePageId("https://rotated.example/post/"));
  });
});
