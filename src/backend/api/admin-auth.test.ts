import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  userHasRoleAtLeast: vi.fn(),
}));

vi.mock("@/backend/api/lib/auth", () => mocks);

import handler from "@/pages/api/admin/auth";

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: new Map<string, unknown>(),
    setHeader(name: string, value: unknown) { this.headers.set(name, value); },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

describe("admin session endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts current DB-backed admin session", async () => {
    const user = { id: "507f1f77bcf86cd799439011", role: "admin" };
    mocks.getUserFromRequest.mockResolvedValue(user);
    mocks.userHasRoleAtLeast.mockResolvedValue(true);
    const res = response();
    await handler({ method: "GET", headers: { cookie: "session=value" } } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ authorized: true, user });
    expect(mocks.userHasRoleAtLeast).toHaveBeenCalledWith(user, "admin");
  });

  it("rejects missing or non-admin sessions", async () => {
    mocks.getUserFromRequest.mockResolvedValue(null);
    const res = response();
    await handler({ method: "GET", headers: {} } as never, res as never);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Admin access required" });
  });

  it("does not accept password login anymore", async () => {
    const res = response();
    await handler({ method: "POST", body: { password: "legacy" }, headers: {} } as never, res as never);
    expect(res.statusCode).toBe(405);
  });
});
