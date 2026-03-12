import { beforeEach, describe, expect, it, vi } from "vitest";

const insertUserMock = vi.fn();
const insertPreferencesMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const verifyCaptchaTokenMock = vi.fn();
const hashPasswordMock = vi.fn();
const createEmailVerificationTokenMock = vi.fn();
const sendVerificationEmailMock = vi.fn();
const setAuthCookiesMock = vi.fn();
const setDeviceCookieMock = vi.fn();

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: vi.fn(async () => ({
    db: {
      collection: vi.fn((name: string) => {
        if (name === "users") {
          return {
            insertOne: insertUserMock,
          };
        }

        if (name === "user_preferences") {
          return {
            insertOne: insertPreferencesMock,
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      }),
    },
  })),
}));

vi.mock("../../lib/email-verification.js", () => ({
  buildEmailVerificationUrl: vi.fn(() => "https://moviereckon.test/api/auth/verify-email?token=test-token"),
  createEmailVerificationToken: createEmailVerificationTokenMock,
}));

vi.mock("../../lib/email.js", () => ({
  sendVerificationEmail: sendVerificationEmailMock,
}));

vi.mock("../../lib/auth.js", () => ({
  generateDeviceId: vi.fn(() => "device-id"),
  getDefaultUserRoleForEmail: vi.fn(() => "user"),
  generateRefreshSessionId: vi.fn(() => "session-id"),
  generateTokens: vi.fn(() => ({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  })),
  getDeviceIdFromRequest: vi.fn(() => "device-id"),
  getSessionFingerprintFromRequest: vi.fn(() => "fingerprint"),
  hashDeviceId: vi.fn(() => "hashed-device-id"),
  hashPassword: hashPasswordMock,
  hashRefreshToken: vi.fn(() => "hashed-refresh-token"),
  pruneRefreshTokensForUser: vi.fn(async () => undefined),
}));

vi.mock("../../lib/cookies.js", () => ({
  setAuthCookies: setAuthCookiesMock,
  setDeviceCookie: setDeviceCookieMock,
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
    getHeader(name: string) {
      return this.headers.get(name);
    },
  };
}

describe("register handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.EMAIL_VERIFICATION_DISABLED;
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, source: "local" });
    verifyCaptchaTokenMock.mockResolvedValue({ ok: true, error: null });
    hashPasswordMock.mockResolvedValue("hashed-password");
    insertUserMock.mockResolvedValue({
      insertedId: { toString: () => "user-1" },
    });
    insertPreferencesMock.mockResolvedValue({ acknowledged: true });
    createEmailVerificationTokenMock.mockResolvedValue({
      rawToken: "test-token",
      expiresAt: "2026-03-13T00:00:00.000Z",
    });
    sendVerificationEmailMock.mockResolvedValue({
      sent: true,
      previewUrl: null,
    });
  });

  it("creates an unverified account and does not issue auth cookies when verification is required", async () => {
    const { default: handler } = await import("./register.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: {
          email: "user@example.com",
          password: "Password123",
          username: "cinefan",
          captcha_token: "captcha-token",
        },
        headers: {
          host: "moviereckon.test",
          "x-forwarded-proto": "https",
        },
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      requires_email_verification: true,
      user: null,
    });
    expect(createEmailVerificationTokenMock).toHaveBeenCalled();
    expect(sendVerificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "user@example.com",
        username: "cinefan",
      }),
    );
    expect(setDeviceCookieMock).not.toHaveBeenCalled();
    expect(setAuthCookiesMock).not.toHaveBeenCalled();
  });

  it("skips internal email delivery when firebase is selected as the verification provider", async () => {
    const { default: handler } = await import("./register.js");
    const response = createResponse();

    await handler(
      {
        method: "POST",
        body: {
          email: "firebase@example.com",
          password: "Password123",
          username: "firebasefan",
          captcha_token: "captcha-token",
          email_verification_provider: "firebase",
        },
        headers: {
          host: "moviereckon.test",
          "x-forwarded-proto": "https",
        },
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      requires_email_verification: true,
      verification_provider: "firebase",
      verification_preview_url: null,
    });
    expect(createEmailVerificationTokenMock).not.toHaveBeenCalled();
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });
});
