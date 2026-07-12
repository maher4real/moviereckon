import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  connectToDatabase: vi.fn(),
  enforceRequestRateLimit: vi.fn(),
}));

vi.mock("../../lib/auth.js", () => ({
  getUserFromRequest: mocks.getUserFromRequest,
}));

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));

vi.mock("../../lib/request-rate-limit.js", () => ({
  enforceRequestRateLimit: mocks.enforceRequestRateLimit,
}));

import handler from "./preferences";

function createResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as any;
}

describe("user preferences endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserFromRequest.mockResolvedValue({ id: "user-1" });
    mocks.enforceRequestRateLimit.mockResolvedValue(false);
  });

  it("returns preferences from MongoDB driver 7 findOneAndUpdate results", async () => {
    const now = new Date().toISOString();
    const findOneAndUpdate = vi.fn(async () => ({
      _id: { toString: () => "pref-1" },
      user_id: "user-1",
      preferred_languages: ["en"],
      preferred_genres: [28],
      inferred_languages: [],
      inferred_genres: [],
      created_at: now,
      updated_at: now,
    }));

    mocks.connectToDatabase.mockResolvedValue({
      db: {
        collection: vi.fn(() => ({ findOneAndUpdate })),
      },
    });

    const res = createResponse();
    await handler({ method: "GET", headers: {} } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: "pref-1",
        preferred_languages: ["en"],
        preferred_genres: [28],
      },
    });
  });

  it("does not duplicate preference fields across $set and $setOnInsert", async () => {
    const now = new Date().toISOString();
    const updateOne = vi.fn(
      async (_filter: unknown, _update: Record<string, Record<string, unknown>>) => ({
        acknowledged: true,
      }),
    );
    const findOne = vi.fn(async () => ({
      _id: { toString: () => "pref-1" },
      user_id: "user-1",
      preferred_languages: ["en", "hi"],
      preferred_genres: [28, 35],
      inferred_languages: [],
      inferred_genres: [],
      created_at: now,
      updated_at: now,
    }));

    mocks.connectToDatabase.mockResolvedValue({
      db: {
        collection: vi.fn(() => ({ updateOne, findOne })),
      },
    });

    const res = createResponse();
    await handler(
      {
        method: "PUT",
        headers: {},
        body: {
          preferred_languages: ["en", "hi"],
          preferred_genres: [28, 35],
        },
      } as any,
      res,
    );

    expect(updateOne).toHaveBeenCalledOnce();
    const update = updateOne.mock.calls[0]?.[1];
    expect(update).toBeDefined();

    expect(res.statusCode).toBe(200);
    expect(update?.$set).toMatchObject({
      preferred_languages: ["en", "hi"],
      preferred_genres: [28, 35],
    });
    expect(update?.$setOnInsert).not.toHaveProperty("preferred_languages");
    expect(update?.$setOnInsert).not.toHaveProperty("preferred_genres");
  });
});
