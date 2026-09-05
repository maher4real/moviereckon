import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { VercelRequest } from "./http";

const EMAIL_TOKEN_TTL_MS = 60 * 60 * 1000;
const EMAIL_TOKEN_SIZE_BYTES = 32;

export type EmailTokenPurpose = "verify-email" | "reset-password";

type EmailVerificationShape = Record<string, unknown> & {
  emailVerified?: unknown;
  email_verified?: unknown;
};

function readBooleanEnv(name: string): boolean | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function getTokenPepper(): string {
  const value = process.env.EMAIL_TOKEN_PEPPER || process.env.JWT_SECRET || "";
  if (!value || value.length < 32) {
    throw new Error("EMAIL_TOKEN_PEPPER or JWT_SECRET must be configured and at least 32 characters");
  }
  return value;
}

function getRequestOrigin(req: VercelRequest): string {
  const protoHeader = req.headers["x-forwarded-proto"];
  const hostHeader = req.headers.host;
  const proto =
    typeof protoHeader === "string" && protoHeader.length > 0
      ? protoHeader.split(",")[0]?.trim()
      : process.env.NODE_ENV === "production"
        ? "https"
        : "http";

  if (typeof hostHeader !== "string" || hostHeader.trim().length === 0) {
    throw new Error("Unable to determine application origin");
  }

  return `${proto}://${hostHeader.trim()}`;
}

export function getAppUrl(req?: VercelRequest): string {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (req) return getRequestOrigin(req);
  throw new Error("APP_URL must be configured");
}

export function createEmailToken(purpose: EmailTokenPurpose): {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
} {
  const rawToken = randomBytes(EMAIL_TOKEN_SIZE_BYTES).toString("hex");
  const tokenHash = hashEmailToken(rawToken, purpose);
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS).toISOString();
  return { rawToken, tokenHash, expiresAt };
}

export function hashEmailToken(rawToken: string, purpose: EmailTokenPurpose): string {
  return createHash("sha256")
    .update(`${getTokenPepper()}:${purpose}:${rawToken}`)
    .digest("hex");
}

export function emailTokenMatches(
  rawToken: string,
  purpose: EmailTokenPurpose,
  storedHash: unknown,
): boolean {
  if (typeof storedHash !== "string" || storedHash.length === 0) {
    return false;
  }

  const computed = Buffer.from(hashEmailToken(rawToken, purpose), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export function isEmailTokenExpired(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return true;
  const expiresAtMs = Date.parse(value);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs < Date.now();
}

export function buildEmailVerificationUrl(
  req: VercelRequest,
  rawToken: string,
  email: string,
): string {
  const baseUrl = getAppUrl(req);
  const params = new URLSearchParams({
    token: rawToken,
    email,
  });
  return `${baseUrl}/verify-email?${params.toString()}`;
}

export function buildPasswordResetUrl(
  req: VercelRequest,
  rawToken: string,
  email: string,
): string {
  const baseUrl = getAppUrl(req);
  const params = new URLSearchParams({
    token: rawToken,
    email,
  });
  return `${baseUrl}/reset-password?${params.toString()}`;
}

export function isUserEmailVerified(user: EmailVerificationShape | null | undefined): boolean {
  return user?.emailVerified === true || user?.email_verified === true;
}

export function isEmailVerificationDisabled(): boolean {
  const explicit = readBooleanEnv("EMAIL_VERIFICATION_DISABLED");
  if (explicit !== null) return explicit;

  // Verification is opt-in until email infrastructure is explicitly enabled.
  return true;
}

export function isEmailVerificationSatisfied(
  user: EmailVerificationShape | null | undefined,
): boolean {
  return isEmailVerificationDisabled() || isUserEmailVerified(user);
}

export function buildVerifiedEmailUpdate(now: string) {
  return {
    emailVerified: true,
    email_verified: true,
    emailVerifiedAt: now,
    email_verified_at: now,
  };
}

export function buildPendingVerificationUpdate(
  tokenHash: string,
  expiresAt: string,
) {
  return {
    emailVerified: false,
    email_verified: false,
    emailVerifiedAt: null,
    email_verified_at: null,
    verificationTokenHash: tokenHash,
    verificationTokenExpiresAt: expiresAt,
  };
}

export function buildVerificationTokenUnset() {
  return {
    verificationTokenHash: "",
    verificationTokenExpiresAt: "",
  };
}

export function buildPasswordResetTokenUnset() {
  return {
    passwordResetTokenHash: "",
    passwordResetTokenExpiresAt: "",
  };
}
