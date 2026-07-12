import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfiguredAuthBaseURL } from "./auth-base-url";

describe("configured auth base URL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses configured origin and ignores request-controlled hosts by design", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.test/");
    expect(getConfiguredAuthBaseURL()).toBe("https://auth.example.test");
  });

  it("rejects values that are not a bare origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.test/path");
    expect(() => getConfiguredAuthBaseURL()).toThrow("must be an origin");
  });

  it("requires HTTPS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "http://evil.example.test");
    expect(() => getConfiguredAuthBaseURL()).toThrow("must use HTTPS");
  });

  it("requires explicit production configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("APP_URL", "");
    expect(() => getConfiguredAuthBaseURL()).toThrow("must be configured");
  });
});
