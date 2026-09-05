import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest } from "./http";
import { verifyCaptchaToken } from "./captcha.js";

const fetchMock = vi.fn();

function createRequest(host = "moviereckon.vercel.app"): VercelRequest {
  return {
    headers: {
      host,
      "x-forwarded-for": "203.0.113.5",
    },
  } as unknown as VercelRequest;
}

describe("verifyCaptchaToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = "moviereckon.vercel.app,localhost";
    delete process.env.TURNSTILE_SKIP_HOSTNAME_CHECK;
    delete process.env.TURNSTILE_VERIFY_TIMEOUT_MS;
    delete process.env.TURNSTILE_MAX_TOKEN_AGE_SECONDS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    delete process.env.TURNSTILE_SKIP_HOSTNAME_CHECK;
    delete process.env.TURNSTILE_VERIFY_TIMEOUT_MS;
    delete process.env.TURNSTILE_MAX_TOKEN_AGE_SECONDS;
  });

  it("accepts a fresh Turnstile token and sends remoteip plus idempotency key", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        action: "signup",
        hostname: "moviereckon.vercel.app",
        challenge_ts: new Date().toISOString(),
      }),
    });

    const result = await verifyCaptchaToken(createRequest(), "token-value", "signup");

    expect(result).toMatchObject({
      ok: true,
      error: null,
      reason: null,
      responseAction: "signup",
      responseHostname: "moviereckon.vercel.app",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
      }),
    );

    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body || "");
    expect(requestBody).toContain("secret=test-secret");
    expect(requestBody).toContain("response=token-value");
    expect(requestBody).toContain("remoteip=203.0.113.5");
    expect(requestBody).toMatch(/idempotency_key=[0-9a-f-]{36}/i);
  });

  it("treats timeout-or-duplicate as a stale token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    });

    const result = await verifyCaptchaToken(createRequest(), "token-value", "login");

    expect(result).toMatchObject({
      ok: false,
      reason: "stale_token",
      error: "CAPTCHA expired. Please verify again.",
      errorCodes: ["timeout-or-duplicate"],
    });
  });

  it("rejects hostname mismatches even when the provider says success", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        action: "signup",
        hostname: "attacker.example",
        challenge_ts: new Date().toISOString(),
      }),
    });

    const result = await verifyCaptchaToken(createRequest(), "token-value", "signup");

    expect(result).toMatchObject({
      ok: false,
      reason: "hostname_mismatch",
      responseHostname: "attacker.example",
    });
  });

  it("rejects challenges older than the accepted token age window", async () => {
    process.env.TURNSTILE_MAX_TOKEN_AGE_SECONDS = "60";

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        action: "login",
        hostname: "moviereckon.vercel.app",
        challenge_ts: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      }),
    });

    const result = await verifyCaptchaToken(createRequest(), "token-value", "login");

    expect(result).toMatchObject({
      ok: false,
      reason: "stale_token",
      error: "CAPTCHA expired. Please verify again.",
    });
  });
});
