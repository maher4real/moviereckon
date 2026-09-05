import { beforeEach, describe, expect, it, vi } from "vitest";

const lifecycleErrors = vi.hoisted(() => {
  class AccountDeletedError extends Error {
    readonly code = "ACCOUNT_DELETED" as const;
  }
  class AccountDeletionInProgressError extends Error {
    readonly code = "ACCOUNT_DELETION_IN_PROGRESS" as const;
  }
  return { AccountDeletedError, AccountDeletionInProgressError };
});

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  connectToDatabase: vi.fn(),
  enforceRequestRateLimit: vi.fn(),
  clearAuthCookies: vi.fn(),
  exportUserData: vi.fn(),
  deleteUserAccount: vi.fn(),
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

vi.mock("../../lib/cookies.js", () => ({
  clearAuthCookies: mocks.clearAuthCookies,
}));

vi.mock("@/backend/services/accountLifecycle", () => lifecycleErrors);

vi.mock("@/backend/services/userPrivacy", () => ({
  exportUserData: mocks.exportUserData,
  deleteUserAccount: mocks.deleteUserAccount,
}));

import handler from "./privacy";

function createResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
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

function request(method: string) {
  return {
    method,
    url: `/api/user/${method === "GET" ? "export" : "account"}`,
    headers: { host: "localhost:3000" },
  } as any;
}

describe("user privacy endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserFromRequest.mockResolvedValue({ id: "user-1" });
    mocks.connectToDatabase.mockResolvedValue({ db: { name: "isolated-fixture" } });
    mocks.enforceRequestRateLimit.mockResolvedValue(false);
  });

  it("requires an authenticated user before touching MongoDB", async () => {
    mocks.getUserFromRequest.mockResolvedValue(null);

    const res = createResponse();
    await handler(request("GET"), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired token" });
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it("exports only the authenticated user's data and marks the response as a download", async () => {
    const db = { name: "isolated-fixture" };
    const data = {
      schema_version: 1,
      exported_at: "2026-09-05T00:00:00.000Z",
      profile: { id: "user-1" },
      data: { watchlist: [] },
    };
    mocks.connectToDatabase.mockResolvedValue({ db });
    mocks.exportUserData.mockResolvedValue(data);

    const res = createResponse();
    await handler(request("GET"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ data });
    expect(mocks.exportUserData).toHaveBeenCalledWith(db, "user-1");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="moviereckon-data-/);
    expect(mocks.clearAuthCookies).not.toHaveBeenCalled();
  });

  it("deletes the authenticated account before clearing its cookies", async () => {
    const db = { name: "isolated-fixture" };
    const result = { deleted: true, lifecycle: { state: "deleted" }, deleted_counts: {} };
    mocks.connectToDatabase.mockResolvedValue({ db });
    mocks.deleteUserAccount.mockResolvedValue(result);

    const res = createResponse();
    await handler(request("DELETE"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ data: result });
    expect(mocks.deleteUserAccount).toHaveBeenCalledWith(db, "user-1");
    expect(mocks.clearAuthCookies).toHaveBeenCalledWith(res);
  });

  it("stops at method and rate-limit gates without opening a database connection", async () => {
    const methodRes = createResponse();
    await handler(request("PUT"), methodRes);
    expect(methodRes.statusCode).toBe(405);

    mocks.enforceRequestRateLimit.mockResolvedValue(true);
    const limitedRes = createResponse();
    await handler(request("GET"), limitedRes);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.exportUserData).not.toHaveBeenCalled();
  });

  it("returns retry and terminal lifecycle errors with stable status codes", async () => {
    mocks.deleteUserAccount.mockRejectedValueOnce(new lifecycleErrors.AccountDeletionInProgressError());
    const retryRes = createResponse();
    await handler(request("DELETE"), retryRes);
    expect(retryRes.statusCode).toBe(409);
    expect(retryRes.body).toMatchObject({ code: "ACCOUNT_DELETION_IN_PROGRESS" });

    mocks.deleteUserAccount.mockRejectedValueOnce(new lifecycleErrors.AccountDeletedError());
    const terminalRes = createResponse();
    await handler(request("DELETE"), terminalRes);
    expect(terminalRes.statusCode).toBe(410);
    expect(terminalRes.body).toMatchObject({ code: "ACCOUNT_DELETED" });
  });
});
