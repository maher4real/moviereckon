import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockResponse } from "@/test/mockResponse";

const mocks = vi.hoisted(() => ({ connectToDatabase: vi.fn(), command: vi.fn() }));
vi.mock("./lib/mongodb.js", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/shared/lib/safeLogging", () => ({ installGlobalSafeLogging: vi.fn() }));

import handler from "./health";

describe("backend readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RBAC_ENFORCE_DB", "true");
    vi.stubEnv("SESSION_BINDING_STRICT", "true");
    vi.stubEnv("REFRESH_TOKEN_PEPPER", "a".repeat(32));
    vi.stubEnv("SECURITY_TELEMETRY_ENABLED", "true");
    mocks.connectToDatabase.mockResolvedValue({ db: { command: mocks.command } });
    mocks.command.mockResolvedValue({ ok: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function health() {
    const response = createMockResponse();
    await handler({ method: "GET", headers: {} } as never, response as never);
    return response;
  }

  it("checks MongoDB and reports the shared production limiter", async () => {
    const response = await health();
    expect(mocks.command).toHaveBeenCalledWith({ ping: 1 });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ status: "healthy", rate_limit: "mongodb" });
  });

  it("reports local counters in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await health()).body).toMatchObject({ rate_limit: "local-memory" });
  });

  it("retains the production security readiness check", async () => {
    vi.stubEnv("REFRESH_TOKEN_PEPPER", "");
    expect((await health()).statusCode).toBe(503);
  });

  it("returns a generic error when the database cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.connectToDatabase.mockRejectedValue(new Error("private database hostname"));
    const response = await health();
    expect(response.statusCode).toBe(500);
    expect(response.body).toMatchObject({ status: "unhealthy", error: "Service unavailable" });
    expect(JSON.stringify(response.body)).not.toContain("private database hostname");
  });
});
