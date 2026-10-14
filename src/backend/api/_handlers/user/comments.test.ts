import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockResponse } from "@/test/mockResponse";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  userHasRoleAtLeast: vi.fn(),
  connectToDatabase: vi.fn(),
  enforceRequestRateLimit: vi.fn(),
  containsBlockedTerms: vi.fn(),
  comments: {
    find: vi.fn(),
    insertOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
  users: { findOne: vi.fn() },
}));

vi.mock("../../lib/auth.js", () => ({
  getUserFromRequest: mocks.getUserFromRequest,
  userHasRoleAtLeast: mocks.userHasRoleAtLeast,
}));
vi.mock("../../lib/request-rate-limit.js", () => ({
  enforceRequestRateLimit: mocks.enforceRequestRateLimit,
}));
vi.mock("../../lib/profanity.js", () => ({ containsBlockedTerms: mocks.containsBlockedTerms }));
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

import handler from "./comments";

type Req = Parameters<typeof handler>[0];
const VALID_ID = "b".repeat(24);

const run = async (method: string, init: { body?: unknown; query?: Record<string, string> } = {}) => {
  const res = createMockResponse();
  await handler(
    { method, body: init.body, query: init.query ?? {}, headers: {} } as unknown as Req,
    res as unknown as Parameters<typeof handler>[1],
  );
  return res;
};

const findChain = (rows: unknown[]) => {
  const query = {
    sort: vi.fn(() => query),
    limit: vi.fn(() => query),
    toArray: vi.fn(async () => rows),
  };
  return query;
};

const row = (id: string, createdAt: string, rating: unknown = 8) => ({
  _id: { toString: () => id },
  user_id: "u",
  username: "name",
  avatar_url: null,
  content_id: 1,
  content_type: "movie",
  text: "great",
  rating,
  created_at: createdAt,
  updated_at: createdAt,
});

describe("user comments endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getUserFromRequest.mockResolvedValue({ id: VALID_ID, username: "fallback" });
    mocks.userHasRoleAtLeast.mockResolvedValue(false);
    mocks.enforceRequestRateLimit.mockResolvedValue(false);
    mocks.containsBlockedTerms.mockReturnValue(false);
    mocks.connectToDatabase.mockResolvedValue({
      db: {
        collection: (name: string) => (name === "users" ? mocks.users : mocks.comments),
      },
    });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getUserFromRequest.mockResolvedValue(null);
    expect((await run("GET")).statusCode).toBe(401);
  });

  it("requires content_id and a valid content_type on GET", async () => {
    expect((await run("GET", { query: { content_id: "1", content_type: "person" } })).statusCode).toBe(400);
    expect((await run("GET", { query: { content_type: "movie" } })).statusCode).toBe(400);
  });

  it("returns an unpaginated list and nulls out invalid legacy ratings", async () => {
    mocks.comments.find.mockReturnValue(findChain([row("1", "t1", 8), row("2", "t0", 99)]));
    const res = await run("GET", { query: { content_id: "1", content_type: "movie" } });
    const body = res.body as { data: Array<{ rating: number | null }>; page?: unknown };
    expect(body.data.map((c) => c.rating)).toEqual([8, null]);
    expect(body.page).toBeUndefined();
  });

  it("paginates with limit + 1 lookahead and a stable cursor", async () => {
    const chain = findChain([row("3", "t3"), row("2", "t2"), row("1", "t1")]);
    mocks.comments.find.mockReturnValue(chain);
    const res = await run("GET", { query: { content_id: "1", content_type: "tv", limit: "2" } });
    const body = res.body as {
      data: unknown[];
      page: { limit: number; has_more: boolean; next_cursor: string | null };
    };
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(body.data).toHaveLength(2);
    expect(body.page).toEqual({ limit: 2, has_more: true, next_cursor: "t2|2" });
  });

  it("clamps the page size", async () => {
    const chain = findChain([]);
    mocks.comments.find.mockReturnValue(chain);
    await run("GET", { query: { content_id: "1", content_type: "movie", limit: "9999" } });
    expect(chain.limit).toHaveBeenCalledWith(121);
  });

  it("ignores a malformed cursor instead of failing", async () => {
    mocks.comments.find.mockReturnValue(findChain([]));
    await run("GET", { query: { content_id: "1", content_type: "movie", cursor: "garbage" } });
    expect(mocks.comments.find.mock.calls[0][0]).not.toHaveProperty("$or");
  });

  describe("POST", () => {
    const valid = { content_id: 5, content_type: "movie", text: "  Loved it  ", rating: 9 };

    it.each([
      ["missing text", { ...valid, text: "" }],
      ["bad content type", { ...valid, content_type: "person" }],
      ["rating out of range", { ...valid, rating: 11 }],
      ["fractional rating", { ...valid, rating: 7.5 }],
      ["too long", { ...valid, text: "a".repeat(1001) }],
    ])("rejects %s", async (_label, body) => {
      const res = await run("POST", { body });
      expect(res.statusCode).toBe(400);
      expect(mocks.comments.insertOne).not.toHaveBeenCalled();
    });

    it("rejects blocked language", async () => {
      mocks.containsBlockedTerms.mockReturnValue(true);
      expect((await run("POST", { body: valid })).statusCode).toBe(400);
      expect(mocks.comments.insertOne).not.toHaveBeenCalled();
    });

    it("stores the comment with the profile username and avatar", async () => {
      mocks.users.findOne.mockResolvedValue({ username: "real", avatar_url: "a.png" });
      mocks.comments.insertOne.mockResolvedValue({ insertedId: { toString: () => "new" } });
      const res = await run("POST", { body: valid });
      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({
        data: { id: "new", username: "real", avatar_url: "a.png", rating: 9, user_id: VALID_ID },
      });
      expect(mocks.comments.insertOne.mock.calls[0][0].text).toBe("Loved it");
    });
  });

  describe("PUT", () => {
    it("requires a valid comment id", async () => {
      expect((await run("PUT", { body: { comment_id: "nope", text: "x", rating: 5 } })).statusCode).toBe(400);
    });

    it("only updates comments owned by the caller", async () => {
      mocks.comments.findOneAndUpdate.mockResolvedValue(null);
      const res = await run("PUT", { body: { comment_id: VALID_ID, text: "edit", rating: 5 } });
      expect(res.statusCode).toBe(404);
      expect(mocks.comments.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ user_id: VALID_ID });
    });

    it("supports both driver return shapes", async () => {
      const updated = row("9", "t");
      mocks.comments.findOneAndUpdate.mockResolvedValueOnce(updated);
      expect((await run("PUT", { body: { comment_id: VALID_ID, text: "edit", rating: 5 } })).statusCode).toBe(200);
      mocks.comments.findOneAndUpdate.mockResolvedValueOnce({ value: updated });
      expect((await run("PUT", { body: { comment_id: VALID_ID, text: "edit", rating: 5 } })).statusCode).toBe(200);
    });
  });

  describe("DELETE", () => {
    it("scopes deletes to the owner for regular users", async () => {
      mocks.comments.deleteOne.mockResolvedValue({ deletedCount: 1 });
      const res = await run("DELETE", { body: { comment_id: VALID_ID } });
      expect(res.statusCode).toBe(200);
      expect(mocks.comments.deleteOne.mock.calls[0][0]).toMatchObject({ user_id: VALID_ID });
    });

    it("lets moderators delete any comment", async () => {
      mocks.userHasRoleAtLeast.mockResolvedValue(true);
      mocks.comments.deleteOne.mockResolvedValue({ deletedCount: 1 });
      await run("DELETE", { body: { comment_id: VALID_ID } });
      expect(mocks.comments.deleteOne.mock.calls[0][0]).not.toHaveProperty("user_id");
    });

    it("404s when nothing was deleted", async () => {
      mocks.comments.deleteOne.mockResolvedValue({ deletedCount: 0 });
      expect((await run("DELETE", { body: { comment_id: VALID_ID } })).statusCode).toBe(404);
    });
  });

  it("returns 405 and 500 appropriately", async () => {
    expect((await run("PATCH")).statusCode).toBe(405);
    mocks.comments.find.mockImplementation(() => {
      throw new Error("boom");
    });
    expect((await run("GET", { query: { content_id: "1", content_type: "movie" } })).statusCode).toBe(500);
  });
});
