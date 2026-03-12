import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeTmdbImageRef } from "@/shared/lib/tmdbImageProxy";

const consumeRateLimitMock = vi.fn();
const emitSecurityEventMock = vi.fn();
const fetchMock = vi.fn();

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
    body: null as Buffer | Record<string, unknown> | null,
    headers: new Map<string, string>(),
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      this.body = payload;
      return this;
    },
    send(payload: Buffer) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
  };
}

describe("tmdb image handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, source: "local" });
  });

  it("returns 429 when the proxy IP limit is exceeded", async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 90,
      source: "global",
    });

    const { default: handler } = await import("./tmdb-image.js");
    const response = createResponse();

    await handler(
      {
        method: "GET",
        query: {
          kind: "backdrop",
          size: "w780",
          ref: encodeTmdbImageRef("/blocked.jpg"),
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual({
      error: "Too many image requests. Please try again later.",
    });
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(emitSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rate_limit_blocked",
        route: "tmdb_image_proxy",
        reason: "ip_limit",
      }),
    );
  });

  it("returns 429 when a single asset is requested too aggressively", async () => {
    consumeRateLimitMock
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0, source: "local" })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12, source: "local" });

    const { default: handler } = await import("./tmdb-image.js");
    const response = createResponse();

    await handler(
      {
        method: "GET",
        query: {
          kind: "poster",
          ref: encodeTmdbImageRef("/repeat.jpg"),
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(2);
    expect(consumeRateLimitMock.mock.calls[0]?.[0]).toBe("tmdb-image:ip:127.0.0.1");
    expect(consumeRateLimitMock.mock.calls[1]?.[0]).toMatch(
      /^tmdb-image:asset:127\.0\.0\.1:poster:[a-f0-9]{16}$/,
    );
    expect(emitSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rate_limit_blocked",
        route: "tmdb_image_proxy",
        reason: "asset_limit",
      }),
    );
  });

  it("proxies the image when rate limits allow it", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: {
        get(name: string) {
          return name === "content-type" ? "image/jpeg" : null;
        },
      },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });

    const { default: handler } = await import("./tmdb-image.js");
    const response = createResponse();

    await handler(
      {
        method: "GET",
        query: {
          kind: "poster",
          size: "w500",
          ref: encodeTmdbImageRef("/live.jpg"),
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://image.tmdb.org/t/p/w500/live.jpg",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining("image/"),
        }),
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    );
    expect(response.body).toBeInstanceOf(Buffer);
  });
});
