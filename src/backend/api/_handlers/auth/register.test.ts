import { beforeEach, describe, expect, it, vi } from "vitest";

const insertUserMock = vi.fn();
const deleteUserMock = vi.fn();
const insertPreferencesMock = vi.fn();
const deletePreferencesMock = vi.fn();
const insertRefreshTokenMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const verifyCaptchaTokenMock = vi.fn();
const hashPasswordMock = vi.fn();
const setAuthCookiesMock = vi.fn();
const setDeviceCookieMock = vi.fn();
const createEmailTokenMock = vi.fn();
const sendVerificationEmailMock = vi.fn();

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: vi.fn(async () => ({
    db: {
      collection: vi.fn((name: string) => {
        if (name === "users") {
          return {
            insertOne: insertUserMock,
            deleteOne: deleteUserMock,
          };
        }

        if (name === "user_preferences") {
          return {
            insertOne: insertPreferencesMock,
            deleteOne: deletePreferencesMock,
          };
        }

        if (name === "refresh_tokens") {
          return {
            insertOne: insertRefreshTokenMock,
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      }),
    },
  })),
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

vi.mock("../../lib/email-auth.js", () => ({
  createEmailToken: createEmailTokenMock,
  buildEmailVerificationUrl: vi.fn(
    (
      req: { headers?: Record<string, string> },
      rawToken: string,
      email: string,
    ) => {
      const host = req.headers?.host || "moviereckon.test";
      return `https://${host}/verify-email?token=${rawToken}&email=${encodeURIComponent(email)}`;
    },
  ),
  buildPendingVerificationUpdate: vi.fn(
    (tokenHash: string, expiresAt: string) => ({
      emailVerified: false,
      email_verified: false,
      emailVerifiedAt: null,
      email_verified_at: null,
      verificationTokenHash: tokenHash,
      verificationTokenExpiresAt: expiresAt,
    }),
  ),
  buildVerifiedEmailUpdate: vi.fn((now: string) => ({
    emailVerified: true,
    email_verified: true,
    emailVerifiedAt: now,
    email_verified_at: now,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
  })),
}));

vi.mock("../../lib/email.js", () => ({
  sendVerificationEmail: sendVerificationEmailMock,
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
    consumeRateLimitMock.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      source: "local",
    });
    verifyCaptchaTokenMock.mockResolvedValue({ ok: true, error: null });
    hashPasswordMock.mockResolvedValue("hashed-password");
    createEmailTokenMock.mockReturnValue({
      rawToken: "raw-verification-token",
      tokenHash: "hashed-verification-token",
      expiresAt: "2026-03-13T00:00:00.000Z",
    });
    sendVerificationEmailMock.mockResolvedValue(undefined);
    insertUserMock.mockResolvedValue({
      insertedId: { toString: () => "user-1" },
    });
    insertPreferencesMock.mockResolvedValue({ acknowledged: true });
    deleteUserMock.mockResolvedValue({ acknowledged: true });
    deletePreferencesMock.mockResolvedValue({ acknowledged: true });
    insertRefreshTokenMock.mockResolvedValue({ acknowledged: true });
  });

  it("creates a verified account without sending verification email (email verification disabled)", async () => {
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
      requires_email_verification: false,
      message: "Account created successfully.",
      user: expect.objectContaining({
        email: "user@example.com",
        username: "cinefan",
      }),
    });
    expect(insertUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        username: "cinefan",
        emailVerified: true,
      }),
    );
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
    expect(setDeviceCookieMock).toHaveBeenCalledWith(response, "device-id");
    expect(setAuthCookiesMock).toHaveBeenCalledWith(
      response,
      "access-token",
      "refresh-token",
    );
    expect(insertRefreshTokenMock).toHaveBeenCalledTimes(1);
  });

  it("issues auth cookies when email verification is explicitly disabled", async () => {
    process.env.EMAIL_VERIFICATION_DISABLED = "true";

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
      requires_email_verification: false,
      message: "Account created successfully.",
      user: expect.objectContaining({
        email: "user@example.com",
        username: "cinefan",
      }),
    });
    expect(setDeviceCookieMock).toHaveBeenCalledWith(response, "device-id");
    expect(setAuthCookiesMock).toHaveBeenCalledWith(
      response,
      "access-token",
      "refresh-token",
    );
    expect(insertRefreshTokenMock).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it("does not send verification email when registration succeeds (email verification disabled)", async () => {
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
      requires_email_verification: false,
      message: "Account created successfully.",
    });
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(deletePreferencesMock).not.toHaveBeenCalled();
  });
});
