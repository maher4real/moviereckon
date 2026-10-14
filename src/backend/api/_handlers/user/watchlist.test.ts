import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockResponse } from "@/test/mockResponse";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  connectToDatabase: vi.fn(),
  enforceRequestRateLimit: vi.fn(),
  markTasteProfileStale: vi.fn(),
  col: {
    find: vi.fn(),
    deleteOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    bulkWrite: vi.fn(),
  },
}));

vi.mock("../../lib/auth.js", () => ({ getUserFromRequest: mocks.getUserFromRequest }));
vi.mock("../../lib/request-rate-limit.js", () => ({
  enforceRequestRateLimit: mocks.enforceRequestRateLimit,
}));
vi.mock("@/backend/services/recommendationTaste", () => ({
  markTasteProfileStale: mocks.markTasteProfileStale,
}));
vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: mocks.connectToDatabase,
  ObjectId: class {
    constructor(private readonly value: string) {}
    static isValid(value: string) {
      return /^[0-9a-f]{24}$/.test(value);
    }
    toString() {
      return this.value;
    }
  },
}));

import handler from "./watchlist";

type Req = Parameters<typeof handler>[0];
const request = (method: string, body?: unknown) => ({ method, body, headers: {} }) as unknown as Req;
const run = async (method: string, body?: unknown) => {
  const res = createMockResponse();
  await handler(request(method, body), res as unknown as Parameters<typeof handler>[1]);
  return res;
};

const chain = (rows: unknown[]) => {
  const query = {
    sort: vi.fn(() => query),
    limit: vi.fn(() => query),
    toArray: vi.fn(async () => rows),
  };
  return query;
};

describe("user watchlist endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getUserFromRequest.mockResolvedValue({ id: "user-1" });
    mocks.enforceRequestRateLimit.mockResolvedValue(false);
    mocks.markTasteProfileStale.mockResolvedValue(undefined);
    mocks.connectToDatabase.mockResolvedValue({ db: { collection: () => mocks.col } });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getUserFromRequest.mockResolvedValue(null);
    const res = await run("GET");
    expect(res.statusCode).toBe(401);
  });

  it("stops when the rate limiter already responded", async () => {
    mocks.enforceRequestRateLimit.mockResolvedValue(true);
    const res = await run("GET");
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(res.body).toBeNull();
  });

  it("maps legacy watched rows to a status on GET", async () => {
    mocks.col.find.mockReturnValue(
      chain([
        {
          _id: { toString: () => "a" },
          user_id: "user-1",
          content_id: 1,
          content_type: "movie",
          title: "Dune",
          poster_path: null,
          added_at: "2026-01-01",
          position: 0,
          watched: true,
        },
      ]),
    );
    const res = await run("GET");
    expect(res.statusCode).toBe(200);
    const [item] = (res.body as { data: Array<Record<string, unknown>> }).data;
    expect(item).toMatchObject({ id: "a", status: "completed", watched: true, language: "en" });
  });

  it("validates POST bodies", async () => {
    const res = await run("POST", { content_id: -3, content_type: "movie", title: "x" });
    expect(res.statusCode).toBe(400);
    expect(mocks.col.insertOne).not.toHaveBeenCalled();
  });

  it("adds a new item at the end of the list", async () => {
    mocks.col.deleteOne.mockResolvedValue({ deletedCount: 0 });
    mocks.col.find.mockReturnValue(chain([{ position: 4 }]));
    mocks.col.insertOne.mockResolvedValue({ insertedId: { toString: () => "new" } });

    const res = await run("POST", {
      content_id: "603",
      content_type: "movie",
      title: "The Matrix",
      genres: [28, 28, "878", -1],
      language: "EN",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      action: "added",
      data: { id: "new", position: 5, genres: [28, 878], language: "en", status: "saved" },
    });
    expect(mocks.markTasteProfileStale).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("toggles an existing item off", async () => {
    mocks.col.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = await run("POST", { content_id: 603, content_type: "movie", title: "The Matrix" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ action: "removed" });
    expect(mocks.col.insertOne).not.toHaveBeenCalled();
  });

  it("rejects invalid statuses and 404s unknown items on set_status", async () => {
    const bad = await run("PATCH", {
      action: "set_status",
      content_id: 1,
      content_type: "tv",
      status: "nope",
    });
    expect(bad.statusCode).toBe(400);

    mocks.col.findOneAndUpdate.mockResolvedValue(null);
    const missing = await run("PATCH", {
      action: "set_status",
      content_id: 1,
      content_type: "tv",
      status: "watching",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("keeps watched and status in sync", async () => {
    mocks.col.updateOne.mockResolvedValue({});
    await run("PATCH", { action: "mark_watched", content_id: 1, content_type: "movie", watched: false });
    expect(mocks.col.updateOne).toHaveBeenCalledWith(
      { user_id: "user-1", content_id: 1, content_type: "movie" },
      { $set: { watched: false, status: "saved" } },
    );
  });

  it("ignores malformed ids when reordering and scopes writes to the user", async () => {
    mocks.col.bulkWrite.mockResolvedValue({});
    const id = "a".repeat(24);
    const res = await run("PATCH", {
      action: "reorder",
      order: [
        { id, position: 2 },
        { id: "not-an-id", position: 1 },
        { id, position: "3" },
      ],
    });
    expect(res.statusCode).toBe(200);
    const ops = mocks.col.bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { filter: { user_id: string } };
    }>;
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter.user_id).toBe("user-1");
  });

  it("returns 405 for unsupported methods and 500 on database failures", async () => {
    expect((await run("PUT")).statusCode).toBe(405);
    mocks.col.find.mockImplementation(() => {
      throw new Error("boom");
    });
    expect((await run("GET")).statusCode).toBe(500);
  });
});
