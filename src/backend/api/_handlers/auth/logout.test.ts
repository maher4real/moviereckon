import { beforeEach, describe, expect, it, vi } from "vitest";

const connectToDatabaseMock = vi.fn();
const getUserFromRequestMock = vi.fn();
const getCookieValueMock = vi.fn();
const clearAuthCookiesMock = vi.fn();
const enforceRequestRateLimitMock = vi.fn();

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: connectToDatabaseMock,
}));

vi.mock("../../lib/auth.js", () => ({
  getUserFromRequest: getUserFromRequestMock,
  hashRefreshToken: vi.fn(() => "hashed-refresh-token"),
}));

vi.mock("../../lib/cookies.js", () => ({
  REFRESH_TOKEN_COOKIE_NAME: "refresh_token",
  clearAuthCookies: clearAuthCookiesMock,
  getCookieValue: getCookieValueMock,
}));

vi.mock("../../lib/request-rate-limit.js", () => ({
  enforceRequestRateLimit: enforceRequestRateLimitMock,
}));

vi.mock("../../lib/rate-limit.js", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

function createResponse() {
  return {
    statusCode: 200,
    body: null as Record<string, unknown> | null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      this.body = payload;
      return this;
    },
  };
}

describe("logout handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    enforceRequestRateLimitMock.mockResolvedValue(false);
    getUserFromRequestMock.mockResolvedValue({ id: "user-1" });
    getCookieValueMock.mockReturnValue("refresh-token");
    connectToDatabaseMock.mockResolvedValue({
      db: {
        collection: vi.fn(() => ({
          deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
          deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
        })),
      },
    });
  });

  it("applies both IP and user logout limits before revoking tokens", async () => {
    const { default: handler } = await import("./logout.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: { all_devices: false },
        headers: { cookie: "refresh_token=abc" },
      } as never,
      response as never,
    );

    expect(enforceRequestRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "auth_logout",
        reason: "logout_limit",
        rules: [
          expect.objectContaining({ key: "auth:logout:ip:127.0.0.1", metadataKey: "ip" }),
          expect.objectContaining({ key: "auth:logout:user:user-1", metadataKey: "user" }),
        ],
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(clearAuthCookiesMock).toHaveBeenCalled();
  });

  it("uses only the IP limit when no authenticated user is present", async () => {
    getUserFromRequestMock.mockResolvedValue(null);
    const { default: handler } = await import("./logout.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: { all_devices: false },
        headers: {},
      } as never,
      response as never,
    );

    expect(enforceRequestRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: [expect.objectContaining({ key: "auth:logout:ip:127.0.0.1" })],
      }),
    );
    const rules = enforceRequestRateLimitMock.mock.calls[0]?.[0]?.rules || [];
    expect(rules).toHaveLength(1);
  });

  it("clears session cookies even when logout is rate limited", async () => {
    enforceRequestRateLimitMock.mockResolvedValue(true);
    const { default: handler } = await import("./logout.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: { all_devices: false },
        headers: { cookie: "refresh_token=abc" },
      } as never,
      response as never,
    );

    expect(clearAuthCookiesMock).toHaveBeenCalledOnce();
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });
});
