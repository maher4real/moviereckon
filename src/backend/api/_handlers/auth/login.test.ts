import { beforeEach, describe, expect, it, vi } from "vitest";

const findUserMock = vi.fn();
const comparePasswordMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const verifyCaptchaTokenMock = vi.fn();

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: vi.fn(async () => ({
    db: {
      collection: vi.fn(() => ({
        findOne: findUserMock,
      })),
    },
  })),
}));

vi.mock("../../lib/auth.js", () => ({
  comparePassword: comparePasswordMock,
  generateDeviceId: vi.fn(() => "device-id"),
  generateRefreshSessionId: vi.fn(() => "session-id"),
  generateTokens: vi.fn(() => ({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  })),
  getDeviceIdFromRequest: vi.fn(() => "device-id"),
  getSessionFingerprintFromRequest: vi.fn(() => "fingerprint"),
  hashDeviceId: vi.fn(() => "hashed-device-id"),
  hashRefreshToken: vi.fn(() => "hashed-refresh-token"),
  normalizeUserRole: vi.fn(() => "user"),
  pruneRefreshTokensForUser: vi.fn(async () => undefined),
}));

vi.mock("../../lib/cookies.js", () => ({
  setAuthCookies: vi.fn(),
  setDeviceCookie: vi.fn(),
}));

vi.mock("../../lib/rate-limit.js", () => ({
  consumeRateLimit: consumeRateLimitMock,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../lib/captcha.js", () => ({
  verifyCaptchaToken: verifyCaptchaTokenMock,
}));

vi.mock("../../lib/abuse-telemetry.js", () => ({
  emitSecurityEvent: vi.fn(),
}));

function createResponse() {
  return {
    statusCode: 200,
    body: null as Record<string, unknown> | null,
    headers: new Map<string, string>(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
  };
}

describe("login handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, source: "local" });
    verifyCaptchaTokenMock.mockResolvedValue({ ok: true, error: null });
  });

  it("returns a verification error only after the password is correct for an unverified account", async () => {
    findUserMock.mockResolvedValue({
      _id: { toString: () => "user-1" },
      email: "user@example.com",
      username: "cinefan",
      role: "user",
      password_hash: "hashed-password",
      email_verified: false,
      avatar_url: null,
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    });
    comparePasswordMock.mockResolvedValue(true);

    const { default: handler } = await import("./login.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: {
          email: "user@example.com",
          password: "Password123",
          captcha_token: "captcha-token",
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({
      error: "Please verify your email before signing in.",
      code: "email_not_verified",
    });
    expect(comparePasswordMock).toHaveBeenCalledWith("Password123", "hashed-password");
  });

  it("keeps the response generic when the password is wrong for an unverified account", async () => {
    findUserMock.mockResolvedValue({
      _id: { toString: () => "user-1" },
      email: "user@example.com",
      username: "cinefan",
      role: "user",
      password_hash: "hashed-password",
      email_verified: false,
      avatar_url: null,
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    });
    comparePasswordMock.mockResolvedValue(false);

    const { default: handler } = await import("./login.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: {
          email: "user@example.com",
          password: "WrongPassword123",
          captcha_token: "captcha-token",
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(401);
    expect(response.body).toMatchObject({
      error: "Invalid email or password",
    });
  });

  it("returns the email verification error without leaking extra account state", async () => {
    findUserMock.mockResolvedValue({
      _id: { toString: () => "user-1" },
      email: "user@example.com",
      username: "cinefan",
      role: "user",
      password_hash: "hashed-password",
      emailVerified: false,
      email_verified: false,
      avatar_url: null,
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    });
    comparePasswordMock.mockResolvedValue(true);

    const { default: handler } = await import("./login.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: {
          email: "user@example.com",
          password: "Password123",
          captcha_token: "captcha-token",
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({
      error: "Please verify your email before signing in.",
      code: "email_not_verified",
    });
  });
});
