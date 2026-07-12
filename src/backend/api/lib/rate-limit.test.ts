import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  insertOne: vi.fn(),
  connectToDatabase: vi.fn(),
}));

vi.mock("./mongodb.js", () => ({ connectToDatabase: mocks.connectToDatabase }));

import {
  consumeRateLimit,
  handleRateLimitUnavailable,
  RateLimitUnavailableError,
} from "./rate-limit";

describe("MongoDB rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    mocks.connectToDatabase.mockResolvedValue({
      db: {
        collection: vi.fn(() => ({
          updateOne: mocks.updateOne,
          findOneAndUpdate: mocks.findOneAndUpdate,
          insertOne: mocks.insertOne,
        })),
      },
    });
    mocks.updateOne.mockResolvedValue({ matchedCount: 0 });
    mocks.insertOne.mockResolvedValue({ acknowledged: true });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("creates a shared bucket for first request", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);
    await expect(consumeRateLimit("login:user", 2, 60_000)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      source: "global",
    });
    expect(mocks.insertOne).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it("blocks when atomic count exceeds limit", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({
      count: 3,
      expires_at: new Date(Date.now() + 60_000),
    });
    const result = await consumeRateLimit("login:user", 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.source).toBe("global");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("uses the atomic returned count for concurrent requests", async () => {
    let count = 0;
    mocks.findOneAndUpdate.mockImplementation(async () => ({
      count: ++count,
      expires_at: new Date(Date.now() + 60_000),
    }));
    const results = await Promise.all([
      consumeRateLimit("concurrent:user", 2, 60_000),
      consumeRateLimit("concurrent:user", 2, 60_000),
      consumeRateLimit("concurrent:user", 2, 60_000),
    ]);
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    expect(results.filter((result) => !result.allowed)).toHaveLength(1);
  });

  it("resets an expired bucket", async () => {
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    await expect(consumeRateLimit("login:user", 2, 60_000)).resolves.toMatchObject({
      allowed: true,
      source: "global",
    });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("fails closed when MongoDB is unavailable", async () => {
    mocks.connectToDatabase.mockRejectedValue(new Error("offline"));
    await expect(consumeRateLimit("login:user", 2, 60_000)).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    );
  });

  it("maps typed unavailability to 503 with Retry-After", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const setHeader = vi.fn();
    expect(handleRateLimitUnavailable(new RateLimitUnavailableError(), { setHeader, status })).toBe(true);
    expect(setHeader).toHaveBeenCalledWith("Retry-After", "30");
    expect(status).toHaveBeenCalledWith(503);
  });

  it("uses bounded local counters outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await expect(consumeRateLimit("local-only", 1, 60_000)).resolves.toMatchObject({
      allowed: true,
      source: "local",
    });
  });
});
