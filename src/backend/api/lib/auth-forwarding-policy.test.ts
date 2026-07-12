import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCaptchaToken: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("./captcha.js", () => ({ verifyCaptchaToken: mocks.verifyCaptchaToken }));
vi.mock("./rate-limit.js", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("./abuse-telemetry.js", () => ({ emitSecurityEvent: vi.fn() }));

import {
  enforceLoginForwardingPolicy,
  enforceRegistrationForwardingPolicy,
  wasForwardingPolicyVerified,
} from "./auth-forwarding-policy";

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) { this.headers.set(name, value); },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

describe("Better Auth forwarding policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, source: "local" });
    mocks.verifyCaptchaToken.mockResolvedValue({ ok: true, error: null, reason: null });
  });

  it("blocks login before forwarding when CAPTCHA fails", async () => {
    mocks.verifyCaptchaToken.mockResolvedValue({ ok: false, error: "CAPTCHA failed", reason: "provider_rejected" });
    const req = { body: { email: "a@example.test", password: "Password123", captcha_token: "bad" }, headers: {} };
    const res = response();
    await expect(enforceLoginForwardingPolicy(req as never, res as never)).resolves.toBeNull();
    expect(res.statusCode).toBe(400);
    expect(wasForwardingPolicyVerified(req as never, "login")).toBe(false);
  });

  it("rejects weak passwords and malformed usernames before CAPTCHA", async () => {
    const req = { body: { email: "a@example.test", password: "weak", username: "bad name", captcha_token: "token" }, headers: {} };
    const res = response();
    await expect(enforceRegistrationForwardingPolicy(req as never, res as never)).resolves.toBeNull();
    expect(res.statusCode).toBe(400);
    expect(mocks.verifyCaptchaToken).not.toHaveBeenCalled();
  });

  it("marks a valid request so legacy fallback does not consume CAPTCHA twice", async () => {
    const req = { body: { email: "a@example.test", password: "Password123", username: "alice", captcha_token: "token" }, headers: {} };
    const res = response();
    await expect(enforceRegistrationForwardingPolicy(req as never, res as never)).resolves.toMatchObject({ username: "alice" });
    expect(wasForwardingPolicyVerified(req as never, "register")).toBe(true);
  });
});
