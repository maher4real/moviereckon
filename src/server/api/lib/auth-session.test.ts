import { beforeAll, describe, expect, it, vi } from "vitest";

type AuthModule = typeof import("./auth.js");
type CookiesModule = typeof import("./cookies.js");

describe("auth session helpers", () => {
  let auth: AuthModule;
  let cookies: CookiesModule;

  beforeAll(async () => {
    vi.resetModules();
    process.env.JWT_SECRET = "test-jwt-secret-with-at-least-32-chars";
    process.env.REFRESH_TOKEN_PEPPER = "test-refresh-pepper";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/moviereckon-test";
    auth = await import("./auth.js");
    cookies = await import("./cookies.js");
  });

  it("keeps the session fingerprint stable across browser version updates on the same device", () => {
    const chrome122 = auth.getSessionFingerprintFromRequest({
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    const chrome123 = auth.getSessionFingerprintFromRequest({
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    const firefox = auth.getSessionFingerprintFromRequest({
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    expect(chrome122).toBe(chrome123);
    expect(chrome122).not.toBe(firefox);
    expect(auth.isVersionedSessionFingerprint(chrome122)).toBe(true);
  });

  it("reads and writes the device cookie with secure session attributes", () => {
    const response = {
      headers: new Map<string, string | string[]>(),
      getHeader(name: string) {
        return this.headers.get(name);
      },
      setHeader(name: string, value: string | string[]) {
        this.headers.set(name, value);
      },
    };

    cookies.setDeviceCookie(response as never, "device-123");

    const setCookie = response.headers.get("Set-Cookie");
    const serialized = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);

    expect(serialized).toContain(`${cookies.DEVICE_ID_COOKIE_NAME}=device-123`);
    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("Path=/");
    expect(serialized).toContain("SameSite=lax");
    expect(auth.getDeviceIdFromRequest({ headers: { cookie: `${cookies.DEVICE_ID_COOKIE_NAME}=device-123` } })).toBe(
      "device-123",
    );
  });

  it("clears access, refresh, and device cookies on logout", () => {
    const response = {
      headers: new Map<string, string | string[]>(),
      getHeader(name: string) {
        return this.headers.get(name);
      },
      setHeader(name: string, value: string | string[]) {
        this.headers.set(name, value);
      },
    };

    cookies.clearAuthCookies(response as never);

    const setCookie = response.headers.get("Set-Cookie");
    const serialized = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie);

    expect(serialized).toContain(`${cookies.ACCESS_TOKEN_COOKIE_NAME}=`);
    expect(serialized).toContain(`${cookies.REFRESH_TOKEN_COOKIE_NAME}=`);
    expect(serialized).toContain(`${cookies.DEVICE_ID_COOKIE_NAME}=`);
    expect(serialized).toContain("Max-Age=0");
  });
});
