import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockResponse } from "@/test/mockResponse";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  connectToDatabase: vi.fn(),
  enforceRequestRateLimit: vi.fn(),
  markTasteProfileStale: vi.fn(),
  feedback: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    aggregate: vi.fn(),
  },
  summary: { findOne: vi.fn(), updateOne: vi.fn() },
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

import handler from "./feedback";

type Req = Parameters<typeof handler>[0];
const run = async (method: string, init: { body?: unknown; query?: Record<string, string> } = {}) => {
  const res = createMockResponse();
  await handler(
    { method, body: init.body, query: init.query ?? {}, headers: {} } as unknown as Req,
    res as unknown as Parameters<typeof handler>[1],
  );
  return res;
};

const stored = (type: string) => ({
  _id: { toString: () => "fb1" },
  user_id: "user-1",
  content_id: 7,
  content_type: "movie",
  feedback_type: type,
  title: "Dune",
  poster_path: null,
  genres: [],
  language: "en",
  created_at: "t",
  updated_at: "t",
});

const post = (feedbackType: string, extra: Record<string, unknown> = {}) =>
  run("POST", {
    body: { content_id: 7, content_type: "movie", feedback_type: feedbackType, title: "Dune", ...extra },
  });

const summaryInc = () => mocks.summary.updateOne.mock.calls[0]?.[1]?.$inc as Record<string, number> | undefined;

describe("user feedback endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getUserFromRequest.mockResolvedValue({ id: "user-1" });
    mocks.enforceRequestRateLimit.mockResolvedValue(false);
    mocks.markTasteProfileStale.mockResolvedValue(undefined);
    mocks.connectToDatabase.mockResolvedValue({
      db: {
        collection: (name: string) => (name === "content_feedback_summary" ? mocks.summary : mocks.feedback),
      },
    });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getUserFromRequest.mockResolvedValue(null);
    expect((await run("GET")).statusCode).toBe(401);
  });

  describe("POST", () => {
    it("validates ids and feedback type", async () => {
      expect((await run("POST", { body: { content_id: 0, content_type: "movie", feedback_type: "skip" } })).statusCode).toBe(400);
      expect((await post("bogus")).statusCode).toBe(400);
      expect(mocks.feedback.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("adds a first vote and increments the summary", async () => {
      mocks.feedback.findOneAndUpdate.mockResolvedValue(null);
      mocks.feedback.findOne.mockResolvedValue(stored("must_watch"));
      const res = await post("must_watch");
      expect(res.body).toMatchObject({ action: "added", data: { feedback_type: "must_watch" } });
      expect(summaryInc()).toEqual({ "counts.must_watch": 1, total_votes: 1 });
      expect(mocks.markTasteProfileStale).toHaveBeenCalled();
    });

    it("moves a vote between types", async () => {
      mocks.feedback.findOneAndUpdate.mockResolvedValue({ feedback_type: "skip" });
      mocks.feedback.findOne.mockResolvedValue(stored("must_watch"));
      const res = await post("must_watch");
      expect(res.body).toMatchObject({ action: "updated" });
      expect(summaryInc()).toMatchObject({ "counts.skip": -1, "counts.must_watch": 1, total_votes: 0 });
    });

    it("toggles the same vote off", async () => {
      mocks.feedback.findOneAndUpdate.mockResolvedValue({ feedback_type: "skip" });
      mocks.feedback.deleteOne.mockResolvedValue({ deletedCount: 1 });
      const res = await post("skip");
      expect(res.body).toEqual({ action: "removed", data: null });
      expect(summaryInc()).toEqual({ "counts.skip": -1, total_votes: -1 });
    });

    it("maps the legacy not_for_me type to skip", async () => {
      mocks.feedback.findOneAndUpdate.mockResolvedValue(null);
      mocks.feedback.findOne.mockResolvedValue(stored("skip"));
      await post("not_for_me");
      expect(mocks.feedback.findOneAndUpdate.mock.calls[0][1].$set.feedback_type).toBe("skip");
    });

    it("only sets suppress_until for not_now and caps it at 30 days", async () => {
      mocks.feedback.findOneAndUpdate.mockResolvedValue(null);
      mocks.feedback.findOne.mockResolvedValue(stored("not_now"));

      const far = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      await post("not_now", { suppress_until: far });
      const until = Date.parse(mocks.feedback.findOneAndUpdate.mock.calls[0][1].$set.suppress_until);
      expect(until).toBeLessThanOrEqual(Date.now() + 30 * 24 * 60 * 60 * 1000 + 1000);

      mocks.feedback.findOneAndUpdate.mockClear();
      await post("skip", { suppress_until: far });
      expect(mocks.feedback.findOneAndUpdate.mock.calls[0][1].$set.suppress_until).toBeNull();
    });

    it("defaults not_now to ~14 days when the requested date is in the past", async () => {
      mocks.feedback.findOneAndUpdate.mockResolvedValue(null);
      mocks.feedback.findOne.mockResolvedValue(stored("not_now"));
      await post("not_now", { suppress_until: "2000-01-01T00:00:00Z" });
      const until = Date.parse(mocks.feedback.findOneAndUpdate.mock.calls[0][1].$set.suppress_until);
      const days = (until - Date.now()) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThan(14.1);
    });
  });

  describe("GET", () => {
    it("returns summary counts plus the caller's own vote", async () => {
      mocks.summary.findOne.mockResolvedValue({ counts: { must_watch: 3, skip: -2.4, bogus: 9 } });
      mocks.feedback.findOne.mockResolvedValue({ feedback_type: "must_watch" });
      const res = await run("GET", { query: { content_id: "7", content_type: "movie" } });
      expect(res.body).toMatchObject({
        data: {
          counts: { must_watch: 3, skip: 0, give_it_a_go: 0, one_time_watch: 0, not_now: 0 },
          user_feedback: "must_watch",
        },
      });
    });

    it("rebuilds a missing summary from legacy votes", async () => {
      mocks.summary.findOne.mockResolvedValue(null);
      mocks.feedback.findOne.mockResolvedValue(null);
      mocks.feedback.aggregate.mockReturnValue({
        toArray: async () => [{ _id: "skip", count: 2 }, { _id: "weird", count: 5 }],
      });
      const res = await run("GET", { query: { content_id: "7", content_type: "movie" } });
      expect((res.body as { data: { counts: Record<string, number> } }).data.counts.skip).toBe(2);
      expect(mocks.summary.updateOne.mock.calls[0][1].$set.total_votes).toBe(2);
    });

    it("paginates the caller's history with a cursor", async () => {
      const chain = {
        sort: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        toArray: vi.fn(async () => [stored("skip"), { ...stored("skip"), _id: { toString: () => "fb0" } }]),
      };
      mocks.feedback.find.mockReturnValue(chain);
      const res = await run("GET", { query: { limit: "1" } });
      expect(chain.limit).toHaveBeenCalledWith(2);
      expect(res.body).toMatchObject({ page: { limit: 1, has_more: true, next_cursor: "t|fb1" } });
    });
  });

  describe("DELETE", () => {
    it("validates the query", async () => {
      expect((await run("DELETE")).statusCode).toBe(400);
    });

    it("is idempotent when no vote exists", async () => {
      mocks.feedback.findOne.mockResolvedValue(null);
      const res = await run("DELETE", { query: { content_id: "7", content_type: "movie" } });
      expect(res.body).toEqual({ action: "removed", data: null });
      expect(mocks.feedback.deleteOne).not.toHaveBeenCalled();
    });

    it("removes the vote and decrements the summary", async () => {
      mocks.feedback.findOne.mockResolvedValue({ feedback_type: "must_watch" });
      mocks.feedback.deleteOne.mockResolvedValue({ deletedCount: 1 });
      await run("DELETE", { query: { content_id: "7", content_type: "movie" } });
      expect(summaryInc()).toEqual({ "counts.must_watch": -1, total_votes: -1 });
      expect(mocks.markTasteProfileStale).toHaveBeenCalled();
    });
  });

  it("returns 405 and 500 appropriately", async () => {
    expect((await run("PATCH")).statusCode).toBe(405);
    mocks.feedback.find.mockImplementation(() => {
      throw new Error("boom");
    });
    expect((await run("GET")).statusCode).toBe(500);
  });
});
