import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./proxy";

describe("nonce CSP", () => {
  it("requires nonce and removes unsafe inline scripts in production", () => {
    const policy = buildContentSecurityPolicy("nonce-one", false);
    expect(policy).toContain("script-src 'self' 'nonce-nonce-one' 'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("https://challenges.cloudflare.com");
  });

  it("allows React debugging eval only in development", () => {
    expect(buildContentSecurityPolicy("nonce-two", true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("nonce-two", true)).not.toBe(
      buildContentSecurityPolicy("nonce-one", true),
    );
  });
});
