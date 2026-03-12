import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeRateLimitMock = vi.fn();
const emitSecurityEventMock = vi.fn();

vi.mock("./rate-limit.js", () => ({
  consumeRateLimit: consumeRateLimitMock,
}));

vi.mock("./abuse-telemetry.js", () => ({
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
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
  };
}

describe("enforceRequestRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns false when every rule is allowed", async () => {
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, source: "local" });
    const { enforceRequestRateLimit } = await import("./request-rate-limit.js");
    const response = createResponse();

    const blocked = await enforceRequestRateLimit({
      req: { headers: {} } as never,
      res: response as never,
      route: "test_route",
      reason: "test_reason",
      errorMessage: "Too many requests",
      rules: [{ key: "rule:1", maxRequests: 1, windowMs: 60_000, metadataKey: "ip" }],
    });

    expect(blocked).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(emitSecurityEventMock).not.toHaveBeenCalled();
  });

  it("returns 429 with retry headers and telemetry when a rule is blocked", async () => {
    consumeRateLimitMock
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0, source: "local" })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 47, source: "global" });
    const { enforceRequestRateLimit } = await import("./request-rate-limit.js");
    const response = createResponse();

    const blocked = await enforceRequestRateLimit({
      req: { headers: {} } as never,
      res: response as never,
      route: "test_route",
      reason: "test_reason",
      errorMessage: "Too many requests",
      metadata: { method: "POST" },
      rules: [
        { key: "rule:1", maxRequests: 1, windowMs: 60_000, metadataKey: "ip" },
        { key: "rule:2", maxRequests: 1, windowMs: 60_000, metadataKey: "token" },
      ],
    });

    expect(blocked).toBe(true);
    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual({ error: "Too many requests" });
    expect(response.headers.get("Retry-After")).toBe("47");
    expect(emitSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rate_limit_blocked",
        route: "test_route",
        reason: "test_reason",
        metadata: expect.objectContaining({
          method: "POST",
          blocked_limits: ["token"],
          ip_source: "local",
          token_source: "global",
        }),
      }),
    );
  });

  it("supports custom blocked handlers for redirect flows", async () => {
    consumeRateLimitMock.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 12,
      source: "local",
    });
    const { enforceRequestRateLimit } = await import("./request-rate-limit.js");
    const response = createResponse();
    const onBlocked = vi.fn();

    const blocked = await enforceRequestRateLimit({
      req: { headers: {} } as never,
      res: response as never,
      route: "test_route",
      reason: "test_reason",
      errorMessage: "Too many requests",
      rules: [{ key: "rule:1", maxRequests: 1, windowMs: 60_000, metadataKey: "ip" }],
      onBlocked,
    });

    expect(blocked).toBe(true);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(onBlocked).toHaveBeenCalledWith(30);
    expect(response.body).toBeNull();
  });
});
