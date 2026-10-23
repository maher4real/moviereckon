import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  connectToDatabase: vi.fn(),
  enforceRequestRateLimit: vi.fn(),
  markTasteProfileStale: vi.fn(),
}));

vi.mock("@/backend/services/recommendationTaste", () => ({
  markTasteProfileStale: mocks.markTasteProfileStale,
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
import { createMockResponse } from "@/test/mockResponse";

function createResponse() {
  return createMockResponse() as any;
}

describe("user preferences endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserFromRequest.mockResolvedValue({ id: "user-1" });
    mocks.enforceRequestRateLimit.mockResolvedValue(false);
    mocks.markTasteProfileStale.mockResolvedValue(undefined);
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

  const baseDoc = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => "pref-1" },
    user_id: "user-1",
    preferred_languages: ["en"],
    preferred_genres: [28],
    inferred_languages: [],
    inferred_genres: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  function mockPut(existing: Record<string, unknown> | null) {
    const updateOne = vi.fn(async () => ({ acknowledged: true }));
    const findOne = vi.fn(async () => existing);
    mocks.connectToDatabase.mockResolvedValue({
      db: { collection: vi.fn(() => ({ updateOne, findOne })) },
    });
    return { updateOne, findOne };
  }

  async function put(body: unknown) {
    const res = createResponse();
    await handler({ method: "PUT", headers: {}, body } as any, res);
    return res;
  }

  it("returns defaults for the new fields on a legacy document", async () => {
    mocks.connectToDatabase.mockResolvedValue({
      db: { collection: vi.fn(() => ({ findOneAndUpdate: vi.fn(async () => baseDoc()) })) },
    });
    const res = createResponse();
    await handler({ method: "GET", headers: {} } as any, res);
    expect(res.body).toMatchObject({
      data: { disliked_genres: [], seed_titles: [], moods: [], pace: null, eras: [] },
    });
  });

  it("stores the new fields, returns them and marks the profile stale", async () => {
    const stored = baseDoc({ disliked_genres: [27], moods: ["dark"], pace: "slow_burn", eras: ["modern"] });
    const { updateOne, findOne } = mockPut(baseDoc());
    findOne.mockResolvedValueOnce(baseDoc()).mockResolvedValueOnce(stored);

    const res = await put({ disliked_genres: [27], moods: ["dark"], pace: "slow_burn", eras: ["modern"] });

    expect(res.statusCode).toBe(200);
    const update = (updateOne.mock.calls[0] as unknown as [unknown, Record<string, Record<string, unknown>>])[1];
    expect(update.$set).toMatchObject({ disliked_genres: [27], moods: ["dark"], pace: "slow_burn", eras: ["modern"] });
    expect(update.$setOnInsert).not.toHaveProperty("moods");
    expect(update.$setOnInsert).toHaveProperty("seed_titles", []);
    expect(res.body).toMatchObject({ data: { disliked_genres: [27], moods: ["dark"], pace: "slow_burn" } });
    expect(mocks.markTasteProfileStale).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  describe("taste onboarding", () => {
    async function get(doc: Record<string, unknown>) {
      mocks.connectToDatabase.mockResolvedValue({
        db: { collection: vi.fn(() => ({ findOneAndUpdate: vi.fn(async () => doc) })) },
      });
      const res = createResponse();
      await handler({ method: "GET", headers: {} } as any, res);
      return (res.body as { data: { onboarding_completed_at: string | null } }).data.onboarding_completed_at;
    }

    it("is pending for a brand-new account", async () => {
      expect(await get(baseDoc({ preferred_languages: [], preferred_genres: [] }))).toBeNull();
    });

    it("counts legacy accounts with saved taste as done", async () => {
      expect(await get(baseDoc({ updated_at: "2026-02-02T00:00:00.000Z" }))).toBe("2026-02-02T00:00:00.000Z");
    });

    it("reports a stored completion even when nothing was picked (skipped)", async () => {
      expect(await get(baseDoc({ preferred_languages: [], preferred_genres: [], onboarding_completed_at: "2026-03-03T00:00:00.000Z" })))
        .toBe("2026-03-03T00:00:00.000Z");
    });

    it("stamps completion once and accepts a skip with no picks", async () => {
      const { updateOne } = mockPut(baseDoc({ preferred_languages: [], preferred_genres: [] }));
      expect((await put({ onboarding_completed: true })).statusCode).toBe(200);
      expect((updateOne.mock.calls[0] as any)[1].$set).toHaveProperty("onboarding_completed_at");

      const again = mockPut(baseDoc({ onboarding_completed_at: "2026-03-03T00:00:00.000Z" }));
      await put({ preferred_languages: ["hi"], onboarding_completed: true });
      expect((again.updateOne.mock.calls[0] as any)[1].$set).not.toHaveProperty("onboarding_completed_at");
    });

    it("rejects a non-boolean completion flag", async () => {
      mockPut(baseDoc());
      expect((await put({ onboarding_completed: "yes" })).statusCode).toBe(400);
    });
  });

  it("accepts a PUT with only new fields", async () => {
    mockPut(baseDoc());
    expect((await put({ moods: ["funny"] })).statusCode).toBe(200);
  });

  it("rejects an empty body and malformed new fields", async () => {
    mockPut(baseDoc());
    expect((await put({})).statusCode).toBe(400);
    expect((await put({ moods: "dark" })).statusCode).toBe(400);
    expect((await put({ pace: "warp" })).statusCode).toBe(400);
    expect((await put({ seed_titles: {} })).statusCode).toBe(400);
  });

  it("pace null clears the pace; omitting pace leaves it out of the update", async () => {
    const { updateOne } = mockPut(baseDoc({ pace: "fast" }));
    await put({ pace: null });
    expect((updateOne.mock.calls[0] as any)[1].$set).toHaveProperty("pace", null);

    updateOne.mockClear();
    await put({ moods: ["dark"] });
    expect((updateOne.mock.calls[0] as any)[1].$set).not.toHaveProperty("pace");
  });

  it("liked wins: a preferred genre that is already disliked is removed from dislikes", async () => {
    const { updateOne } = mockPut(baseDoc({ disliked_genres: [28, 35] }));
    await put({ preferred_genres: [28, 12] });
    expect((updateOne.mock.calls[0] as any)[1].$set).toMatchObject({
      preferred_genres: [28, 12],
      disliked_genres: [35],
    });
  });

  it("liked wins: disliking an already preferred genre drops it", async () => {
    const { updateOne } = mockPut(baseDoc({ preferred_genres: [28] }));
    await put({ disliked_genres: [28, 27] });
    expect((updateOne.mock.calls[0] as any)[1].$set).toMatchObject({ disliked_genres: [27] });
  });

  it("does not rewrite dislikes when nothing overlaps", async () => {
    const { updateOne } = mockPut(baseDoc({ disliked_genres: [27] }));
    await put({ preferred_genres: [28, 12] });
    expect((updateOne.mock.calls[0] as any)[1].$set).not.toHaveProperty("disliked_genres");
  });
});
