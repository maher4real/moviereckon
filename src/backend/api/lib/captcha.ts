import type { VercelRequest } from "@vercel/node";
import { randomUUID } from "crypto";
import { getClientIp } from "./rate-limit.js";

const TURNSTILE_VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_TURNSTILE_VERIFY_TIMEOUT_MS = 8_000;
const DEFAULT_TURNSTILE_MAX_TOKEN_AGE_SECONDS = 300;
const MAX_ALLOWED_FUTURE_SKEW_MS = 2 * 60 * 1000;

type TurnstileVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  cdata?: string;
};

export type CaptchaFailureReason =
  | "not_configured"
  | "missing_token"
  | "provider_rejected"
  | "stale_token"
  | "action_mismatch"
  | "hostname_mismatch"
  | "invalid_timestamp"
  | "verification_timeout"
  | "network_error";

export type CaptchaVerificationResult = {
  ok: boolean;
  error: string | null;
  reason: CaptchaFailureReason | null;
  errorCodes: string[];
  responseAction: string | null;
  responseHostname: string | null;
  challengeTs: string | null;
};

function getSecretKey(): string {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  return typeof secret === "string" ? secret.trim() : "";
}

async function parseJsonSafe(response: Response): Promise<TurnstileVerifyResponse> {
  try {
    const json = (await response.json()) as TurnstileVerifyResponse;
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function getPositiveIntegerEnv(name: string, fallbackValue: number): number {
  const rawValue = process.env[name];
  if (!rawValue) return fallbackValue;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function getVerifyTimeoutMs(): number {
  return getPositiveIntegerEnv("TURNSTILE_VERIFY_TIMEOUT_MS", DEFAULT_TURNSTILE_VERIFY_TIMEOUT_MS);
}

function getMaxTokenAgeSeconds(): number {
  return getPositiveIntegerEnv("TURNSTILE_MAX_TOKEN_AGE_SECONDS", DEFAULT_TURNSTILE_MAX_TOKEN_AGE_SECONDS);
}

function createFailureResult(
  error: string,
  reason: CaptchaFailureReason,
  data: TurnstileVerifyResponse = {},
): CaptchaVerificationResult {
  return {
    ok: false,
    error,
    reason,
    errorCodes: Array.isArray(data["error-codes"]) ? data["error-codes"] : [],
    responseAction: typeof data.action === "string" ? data.action : null,
    responseHostname: typeof data.hostname === "string" ? normalizeHostname(data.hostname) : null,
    challengeTs: typeof data.challenge_ts === "string" ? data.challenge_ts : null,
  };
}

function getAllowedCaptchaHostnames(req: VercelRequest): Set<string> {
  const values = new Set<string>();
  const configured = process.env.TURNSTILE_ALLOWED_HOSTNAMES;
  if (configured) {
    configured
      .split(",")
      .map((entry) => normalizeHostname(entry))
      .filter((entry) => entry.length > 0)
      .forEach((entry) => values.add(entry));
  }

  if (typeof req.headers.host === "string" && req.headers.host.trim().length > 0) {
    values.add(normalizeHostname(req.headers.host.split(":")[0] || ""));
  }

  if (process.env.VERCEL_URL) {
    values.add(normalizeHostname(process.env.VERCEL_URL.split(":")[0] || ""));
  }

  return values;
}

export async function verifyCaptchaToken(
  req: VercelRequest,
  token: string,
  expectedAction: "login" | "signup" | "forgot-password",
): Promise<CaptchaVerificationResult> {
  const secret = getSecretKey();
  if (!secret) {
    return createFailureResult("CAPTCHA is unavailable right now. Please try again later.", "not_configured");
  }

  if (!token || token.trim().length === 0) {
    return createFailureResult("Please complete CAPTCHA verification.", "missing_token");
  }

  const formData = new URLSearchParams({
    secret,
    response: token.trim(),
    remoteip: getClientIp(req),
    idempotency_key: randomUUID(),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getVerifyTimeoutMs());

  try {
    const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    const data = await parseJsonSafe(response);
    const providerErrorCodes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
    const providerRejectedReason: CaptchaFailureReason =
      providerErrorCodes.includes("timeout-or-duplicate") ? "stale_token" : "provider_rejected";
    const providerRejectedMessage =
      providerRejectedReason === "stale_token"
        ? "CAPTCHA expired. Please verify again."
        : "CAPTCHA verification failed. Please try again.";

    if (!response.ok || data.success !== true) {
      return createFailureResult(providerRejectedMessage, providerRejectedReason, data);
    }

    if (typeof data.action !== "string" || data.action !== expectedAction) {
      return createFailureResult("CAPTCHA validation failed. Please refresh and try again.", "action_mismatch", data);
    }

    const skipHostnameCheck = process.env.TURNSTILE_SKIP_HOSTNAME_CHECK === "true";
    if (!skipHostnameCheck) {
      const allowedHostnames = getAllowedCaptchaHostnames(req);
      const responseHostname = typeof data.hostname === "string" ? normalizeHostname(data.hostname) : "";

      if (allowedHostnames.size > 0 && (!responseHostname || !allowedHostnames.has(responseHostname))) {
        return createFailureResult(
          "CAPTCHA validation failed. Please refresh and try again.",
          "hostname_mismatch",
          data,
        );
      }
    }

    const challengeTimestampMs =
      typeof data.challenge_ts === "string" ? Date.parse(data.challenge_ts) : Number.NaN;
    if (!Number.isFinite(challengeTimestampMs)) {
      return createFailureResult("CAPTCHA validation failed. Please verify again.", "invalid_timestamp", data);
    }

    const nowMs = Date.now();
    const maxTokenAgeMs = getMaxTokenAgeSeconds() * 1000;
    if (
      challengeTimestampMs > nowMs + MAX_ALLOWED_FUTURE_SKEW_MS
      || nowMs - challengeTimestampMs > maxTokenAgeMs
    ) {
      return createFailureResult("CAPTCHA expired. Please verify again.", "stale_token", data);
    }

    return {
      ok: true,
      error: null,
      reason: null,
      errorCodes: providerErrorCodes,
      responseAction: data.action,
      responseHostname: typeof data.hostname === "string" ? normalizeHostname(data.hostname) : null,
      challengeTs: typeof data.challenge_ts === "string" ? data.challenge_ts : null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      return createFailureResult(
        "Unable to validate CAPTCHA right now. Please try again.",
        "verification_timeout",
      );
    }
    console.error("CAPTCHA verification error:", error);
    return createFailureResult(
      "Unable to validate CAPTCHA right now. Please try again.",
      "network_error",
    );
  }
}
