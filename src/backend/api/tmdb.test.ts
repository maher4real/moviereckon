import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  describe("unreleased titles", () => {
    const released = { id: 1, title: "Out", release_date: "2026-10-01" };
    const future = { id: 2, title: "Soon", release_date: "2026-12-18" };
    const undated = { id: 3, title: "Announced", release_date: "" };
    const person = { id: 4, name: "Actor", media_type: "person" };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ page: 1, results: [released, future, undated, person] }),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function callProxy(query: Record<string, string>) {
      const { default: handler } = await import("./tmdb.js");
      const response = createResponse();
      await handler({ method: "GET", query, headers: {} } as never, response as never);
      return {
        response,
        requestUrl: new URL(fetchMock.mock.calls[0]?.[0] as string),
      };
    }

    it("removes future and undated titles from general lists", async () => {
      const { response } = await callProxy({ endpoint: "/trending/movie/week" });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({ page: 1, results: [released, person] });
    });

    it("removes unreleased titles from person filmographies", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ cast: [released, future], crew: [undated] }),
      });

      const { response } = await callProxy({ endpoint: "/person/31/combined_credits" });

      expect(response.body).toEqual({ cast: [released], crew: [] });
    });

    it("caps discover queries at today so TMDB skips unreleased titles", async () => {
      const { requestUrl } = await callProxy({
        endpoint: "/discover/movie",
        "primary_release_date.lte": "2026-12-31",
      });

      expect(requestUrl.searchParams.get("primary_release_date.lte")).toBe("2026-10-23");
    });

    it("caps TV discover on first air date", async () => {
      const { requestUrl } = await callProxy({ endpoint: "/discover/tv", page: "2" });

      expect(requestUrl.searchParams.get("first_air_date.lte")).toBe("2026-10-23");
      expect(requestUrl.searchParams.get("page")).toBe("2");
    });

    it("keeps unreleased titles for the upcoming list", async () => {
      const { response } = await callProxy({ endpoint: "/movie/upcoming" });

      expect(response.body).toEqual({ page: 1, results: [released, future, undated, person] });
    });

    it("keeps unreleased titles for discover queries asking for future dates", async () => {
      const { response, requestUrl } = await callProxy({
        endpoint: "/discover/movie",
        "primary_release_date.gte": "2026-10-24",
      });

      expect(requestUrl.searchParams.has("primary_release_date.lte")).toBe(false);
      expect(response.body).toEqual({ page: 1, results: [released, future, undated, person] });
    });
  });
});
