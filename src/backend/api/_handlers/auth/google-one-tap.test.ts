import { beforeEach, describe, expect, it, vi } from "vitest";

const clearNonceCookieMock = vi.fn();
const createNonceMock = vi.fn(() => "one-tap-nonce");
const getClientIdMock = vi.fn(() => "google-client-id");
const setNonceCookieMock = vi.fn();

vi.mock("../../lib/google-oauth.js", () => ({
  clearGoogleOneTapNonceCookie: clearNonceCookieMock,
  createGoogleOneTapNonce: createNonceMock,
  getGoogleOAuthClientId: getClientIdMock,
  getGoogleOneTapNonceFromRequest: vi.fn(),
  setGoogleOneTapNonceCookie: setNonceCookieMock,
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock("../../lib/google-auth-session.js", () => ({
  buildAuthenticatedUserPayload: vi.fn(),
  establishAuthenticatedUserSession: vi.fn(),
  resolveUserFromGoogleProfile: vi.fn(),
}));

vi.mock("../../lib/request-rate-limit.js", () => ({
  enforceRequestRateLimit: vi.fn(),
  hashRateLimitValue: vi.fn(),
}));

vi.mock("../../lib/rate-limit.js", () => ({
  getClientIp: vi.fn(),
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

describe("Google One Tap configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("defaults to the server-side OAuth flow", async () => {
    const { default: handler } = await import("./google-one-tap.js");
    const response = createResponse();

    await handler({ method: "GET" } as never, response as never);

    expect(response.body).toEqual({ enabled: false, client_id: null, nonce: null });
    expect(clearNonceCookieMock).toHaveBeenCalledOnce();
    expect(createNonceMock).not.toHaveBeenCalled();
  });

  it("exposes One Tap only when explicitly enabled", async () => {
    vi.stubEnv("GOOGLE_ONE_TAP_ENABLED", "true");
    const { default: handler } = await import("./google-one-tap.js");
    const response = createResponse();

    await handler({ method: "GET" } as never, response as never);

    expect(response.body).toEqual({
      enabled: true,
      client_id: "google-client-id",
      nonce: "one-tap-nonce",
    });
    expect(setNonceCookieMock).toHaveBeenCalledWith(response, "one-tap-nonce");
  });
});
