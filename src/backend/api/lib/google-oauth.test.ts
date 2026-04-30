import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function stubGoogleCertFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ "test-kid": publicKey }), {
        status: 200,
        headers: { "cache-control": "public, max-age=60" },
      })),
  );
}

describe("verifyGoogleIdToken", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("verifies a signed Google credential with matching nonce", async () => {
    stubGoogleCertFetch();

    const credential = jwt.sign(
      {
        sub: "google-user-1",
        email: "user@example.com",
        email_verified: true,
        name: "Example User",
        given_name: "Example",
        picture: "https://example.com/avatar.jpg",
        nonce: "nonce-123",
      },
      privateKey,
      {
        algorithm: "RS256",
        audience: "google-client-id",
        issuer: "https://accounts.google.com",
        expiresIn: "5m",
        header: { alg: "RS256", kid: "test-kid" },
      },
    );

    const { verifyGoogleIdToken } = await import("./google-oauth.js");
    const result = await verifyGoogleIdToken({
      credential,
      clientId: "google-client-id",
      nonce: "nonce-123",
    });

    expect(result.errorCode).toBeNull();
    expect(result.profile).toMatchObject({
      sub: "google-user-1",
      email: "user@example.com",
      email_verified: true,
      name: "Example User",
    });
  });

  it("rejects a credential when the nonce does not match", async () => {
    stubGoogleCertFetch();

    const credential = jwt.sign(
      {
        sub: "google-user-1",
        email: "user@example.com",
        email_verified: true,
        nonce: "nonce-123",
      },
      privateKey,
      {
        algorithm: "RS256",
        audience: "google-client-id",
        issuer: "https://accounts.google.com",
        expiresIn: "5m",
        header: { alg: "RS256", kid: "test-kid" },
      },
    );

    const { verifyGoogleIdToken } = await import("./google-oauth.js");
    const result = await verifyGoogleIdToken({
      credential,
      clientId: "google-client-id",
      nonce: "nonce-xyz",
    });

    expect(result.profile).toBeNull();
    expect(result.errorCode).toBe("credential_verification_failed");
  });

  it("rejects an unverified Google email", async () => {
    stubGoogleCertFetch();

    const credential = jwt.sign(
      {
        sub: "google-user-2",
        email: "user@example.com",
        email_verified: false,
        nonce: "nonce-123",
      },
      privateKey,
      {
        algorithm: "RS256",
        audience: "google-client-id",
        issuer: "https://accounts.google.com",
        expiresIn: "5m",
        header: { alg: "RS256", kid: "test-kid" },
      },
    );

    const { verifyGoogleIdToken } = await import("./google-oauth.js");
    const result = await verifyGoogleIdToken({
      credential,
      clientId: "google-client-id",
      nonce: "nonce-123",
    });

    expect(result.profile).toBeNull();
    expect(result.errorCode).toBe("email_not_verified");
  });
});
