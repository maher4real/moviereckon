import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

function createJsonResponse(
  body: Record<string, unknown>,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
}

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      RESEND_API_KEY: "resend_test_key",
      RESEND_FROM_EMAIL: "hello@moviereckon.com",
      RESEND_FROM_NAME: "MovieReckon",
      RESEND_REPLY_TO_EMAIL: "support@moviereckon.com",
      RESEND_TIMEOUT_MS: "2500",
      RESEND_MAX_ATTEMPTS: "3",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends verification emails with text, reply-to, tags, and idempotency headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({ id: "email_123" }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendVerificationEmail } = await import("./email.js");
    const result = await sendVerificationEmail({
      userId: "507f1f77bcf86cd799439011",
      toEmail: "user@example.com",
      username: "cinefan",
      verificationUrl: "https://moviereckon.com/api/auth/verify-email?token=abc123",
    });

    expect(result).toEqual({
      sent: true,
      previewUrl: null,
      providerId: "email_123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");

    const headers = requestInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer resend_test_key");
    expect(headers["Idempotency-Key"]).toMatch(/^verify-email\//);

    const payload = JSON.parse(String(requestInit.body)) as Record<string, unknown>;
    expect(payload.reply_to).toBe("support@moviereckon.com");
    expect(payload.text).toContain("If you did not create a MovieReckon account");
    expect(payload.headers).toMatchObject({
      "X-Entity-Ref-ID": headers["Idempotency-Key"],
    });
    expect(payload.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "flow", value: "auth" }),
        expect.objectContaining({ name: "template", value: "verify_email" }),
        expect.objectContaining({ name: "user_id", value: "507f1f77bcf86cd799439011" }),
      ]),
    );
  });

  it("retries transient resend failures with the same idempotency key", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { name: "rate_limit_exceeded", message: "slow down" },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(createJsonResponse({ id: "email_retry_ok" }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendVerificationEmail } = await import("./email.js");

    const sendPromise = sendVerificationEmail({
      userId: "507f1f77bcf86cd799439011",
      toEmail: "user@example.com",
      username: "cinefan",
      verificationUrl: "https://moviereckon.com/api/auth/verify-email?token=retry123",
    });

    await vi.runOnlyPendingTimersAsync();
    const result = await sendPromise;

    expect(result.providerId).toBe("email_retry_ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders["Idempotency-Key"]).toBe(secondHeaders["Idempotency-Key"]);
  });
});
