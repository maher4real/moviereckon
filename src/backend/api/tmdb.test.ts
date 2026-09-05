import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeRateLimitMock = vi.fn();
const emitSecurityEventMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("./lib/cors.js", () => ({
  applyApiCors: vi.fn(() => ({ originAllowed: true })),
  applyDefaultSecurityHeaders: vi.fn(),
  hasAjaxHeader: vi.fn(() => true),
  isTrustedRequestOrigin: vi.fn(() => true),
}));

vi.mock("./lib/rate-limit.js", () => ({
  consumeRateLimit: consumeRateLimitMock,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("./lib/abuse-telemetry.js", () => ({
  emitSecurityEvent: emitSecurityEventMock,
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
    end() {
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
  };
}

describe("tmdb catalog proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("TMDB_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, source: "local" });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
  });

  it("allows the region-aware TV provider catalog endpoint", async () => {
    const { default: handler } = await import("./tmdb.js");
    const response = createResponse();

    await handler(
      {
        method: "GET",
        query: {
          endpoint: "/watch/providers/tv",
          watch_region: "AU",
          language: "en-US",
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(200);
    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(requestUrl.pathname).toBe("/3/watch/providers/tv");
    expect(requestUrl.searchParams.get("watch_region")).toBe("AU");
    expect(requestUrl.searchParams.get("language")).toBe("en-US");
    expect(requestUrl.searchParams.get("api_key")).toBe("test-key");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=21600");
  });

  it("rejects similarly shaped endpoints outside the allowlist", async () => {
    const { default: handler } = await import("./tmdb.js");
    const response = createResponse();

    await handler(
      {
        method: "GET",
        query: { endpoint: "/watch/providers/person" },
        headers: {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: "Endpoint not allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
