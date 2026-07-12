import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyLogin: vi.fn(),
  legacyRegister: vi.fn(),
  legacyRefresh: vi.fn(),
  legacyMe: vi.fn(),
  legacyLogout: vi.fn(),
  googleStart: vi.fn(),
  googleCallback: vi.fn(),
  googleOneTap: vi.fn(),
}));

vi.mock("./_handlers/auth/login.js", () => ({ default: mocks.legacyLogin }));
vi.mock("./_handlers/auth/register.js", () => ({ default: mocks.legacyRegister }));
vi.mock("./_handlers/auth/refresh.js", () => ({ default: mocks.legacyRefresh }));
vi.mock("./_handlers/auth/me.js", () => ({ default: mocks.legacyMe }));
vi.mock("./_handlers/auth/logout.js", () => ({ default: mocks.legacyLogout }));
vi.mock("./_handlers/auth/google-start.js", () => ({ default: mocks.googleStart }));
vi.mock("./_handlers/auth/google-callback.js", () => ({ default: mocks.googleCallback }));
vi.mock("./_handlers/auth/google-one-tap.js", () => ({ default: mocks.googleOneTap }));

vi.mock("./_handlers/auth/availability.js", () => ({ default: vi.fn() }));
vi.mock("./_handlers/auth/verify-email.js", () => ({ default: vi.fn() }));
vi.mock("./_handlers/auth/resend-verification.js", () => ({ default: vi.fn() }));
vi.mock("./_handlers/auth/forgot-password.js", () => ({ default: vi.fn() }));
vi.mock("./_handlers/auth/reset-password.js", () => ({ default: vi.fn() }));
vi.mock("./lib/cors.js", () => ({
  applyApiCors: vi.fn(() => ({ originAllowed: true })),
  applyDefaultSecurityHeaders: vi.fn(),
  applyNoStoreHeaders: vi.fn(),
  hasAjaxHeader: vi.fn(() => true),
  isStateChangingMethod: vi.fn((method: string) => method !== "GET"),
  isTrustedRequestOrigin: vi.fn(() => true),
}));
vi.mock("./lib/rate-limit.js", () => ({
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
  consumeRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0, source: "local" })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("./lib/abuse-telemetry.js", () => ({ emitSecurityEvent: vi.fn() }));
vi.mock("./lib/auth.js", () => ({ normalizeUserRole: vi.fn((role: string) => role || "user") }));
vi.mock("./lib/auth-forwarding-policy.js", () => ({
  enforceLoginForwardingPolicy: vi.fn(async (_req, _res) => ({ email: "a@example.test", password: "Password123" })),
  enforceRegistrationForwardingPolicy: vi.fn(async (_req, _res) => ({ email: "a@example.test", password: "Password123", username: "alice" })),
}));
vi.mock("./lib/auth-base-url.js", () => ({ getConfiguredAuthBaseURL: vi.fn(() => "https://auth.example.test") }));
vi.mock("@/shared/lib/safeLogging", () => ({ installGlobalSafeLogging: vi.fn() }));

import handler from "./auth";

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: new Map<string, unknown>(),
    setHeader(name: string, value: unknown) { this.headers.set(name, value); },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    end() { return this; },
  };
}

function request(route: string, method = "POST", body: Record<string, unknown> = {}) {
  return {
    method,
    url: `/api/auth/${route}`,
    headers: { host: "example.test", origin: "https://example.test", "x-requested-with": "XMLHttpRequest" },
    body,
  };
}

function fetchResponse(payload: unknown, status = 200, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}

describe("legacy to Better Auth compatibility router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("maps login response and forwards session cookie", async () => {
    vi.mocked(fetch).mockResolvedValue(fetchResponse({ user: {
      id: "507f1f77bcf86cd799439011", email: "a@example.test", name: "alice", role: "admin", emailVerified: true,
    } }, 200, "better-auth.session_token=value; HttpOnly; Path=/"));
    const res = response();
    await handler(request("login", "POST", { email: "a@example.test", password: "Password123" }) as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ user: { username: "alice", role: "admin" }, session: "cookie" });
    expect(res.headers.get("Set-Cookie")).toBeTruthy();
  });

  it.each([
    ["register", "/sign-up/email", 201, { email: "a@example.test", password: "Password123", username: "alice" }],
    ["forgot-password", "/request-password-reset", 200, { email: "a@example.test" }],
    ["reset-password", "/reset-password", 200, { email: "a@example.test", token: "token", password: "Password123" }],
  ])("maps %s to Better Auth endpoint", async (route, endpoint, expectedStatus, body) => {
    const payload = route === "register" ? { user: {
      id: "507f1f77bcf86cd799439011", email: "a@example.test", name: "alice", role: "user", emailVerified: false,
    } } : { status: true };
    vi.mocked(fetch).mockResolvedValue(fetchResponse(payload));
    const res = response();
    await handler(request(route, "POST", body) as never, res as never);
    expect(res.statusCode).toBe(expectedStatus);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain(endpoint);
  });

  it("maps session lookup for me and refresh", async () => {
    const payload = { user: {
      id: "507f1f77bcf86cd799439011", email: "a@example.test", name: "alice", role: "user", emailVerified: true,
    } };
    for (const route of ["me", "refresh"]) {
      vi.mocked(fetch).mockResolvedValueOnce(fetchResponse(payload));
      const res = response();
      await handler(request(route, "GET") as never, res as never);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ user: { email: "a@example.test" } });
    }
  });

  it("maps logout and keeps Google OAuth on legacy proven handlers", async () => {
    vi.mocked(fetch).mockResolvedValue(fetchResponse({ success: true }));
    const logoutRes = response();
    await handler(request("logout") as never, logoutRes as never);
    expect(logoutRes.statusCode).toBe(200);

    const googleRes = response();
    await handler(request("google-start", "GET") as never, googleRes as never);
    expect(mocks.googleStart).toHaveBeenCalled();
  });

  it("falls back to legacy login when Better Auth is unavailable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("unavailable"));
    const res = response();
    await handler(request("login", "POST", { email: "a@example.test", password: "Password123" }) as never, res as never);
    expect(mocks.legacyLogin).toHaveBeenCalled();
  });

  it("ignores hostile destination headers while forwarding credentials to configured auth origin", async () => {
    vi.mocked(fetch).mockResolvedValue(fetchResponse({ user: {
      id: "507f1f77bcf86cd799439011", email: "a@example.test", name: "alice", role: "user", emailVerified: true,
    } }));
    const req = request("login", "POST", { email: "a@example.test", password: "Password123" });
    req.headers.host = "attacker.example";
    req.headers.origin = "https://attacker.example";
    Object.assign(req.headers, { cookie: "session=secret", authorization: "Bearer secret" });

    await handler(req as never, response() as never);

    const [destination, options] = vi.mocked(fetch).mock.calls[0];
    expect(destination).toBe("https://auth.example.test/api/better-auth/sign-in/email");
    const headers = options?.headers as Headers;
    expect(headers.get("origin")).toBe("https://auth.example.test");
    expect(headers.get("cookie")).toBe("session=secret");
    expect(headers.get("authorization")).toBe("Bearer secret");
  });
});
