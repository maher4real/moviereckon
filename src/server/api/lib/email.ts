import { createHash } from "crypto";

type SendVerificationEmailInput = {
  userId: string;
  toEmail: string;
  username: string;
  verificationUrl: string;
};

export type SendVerificationEmailResult = {
  sent: boolean;
  previewUrl: string | null;
  providerId: string | null;
};

type ResendConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  timeoutMs: number;
  maxAttempts: number;
};

const RESEND_SEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function getTrimmedEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function normalizePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function isLikelyEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeDisplayName(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || "MovieReckon";
}

function getResendConfig(): ResendConfig {
  const apiKey = getTrimmedEnv("RESEND_API_KEY");
  const fromEmail = getTrimmedEnv("RESEND_FROM_EMAIL");
  const fromName = sanitizeDisplayName(getTrimmedEnv("RESEND_FROM_NAME") || "MovieReckon");
  const replyToEmail = getTrimmedEnv("RESEND_REPLY_TO_EMAIL") || null;
  const timeoutMs = normalizePositiveInteger(getTrimmedEnv("RESEND_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS);
  const maxAttempts = normalizePositiveInteger(getTrimmedEnv("RESEND_MAX_ATTEMPTS"), DEFAULT_MAX_ATTEMPTS);

  return { apiKey, fromEmail, fromName, replyToEmail, timeoutMs, maxAttempts };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHeaderToken(value: string, fallback: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildVerificationIdempotencyKey(input: SendVerificationEmailInput): string {
  const fingerprint = createHash("sha256")
    .update(`${input.userId}:${input.toEmail.toLowerCase()}:${input.verificationUrl}`)
    .digest("hex")
    .slice(0, 48);

  return `verify-email/${fingerprint}`;
}

function buildTagValue(value: string, fallback: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildVerificationEmailContent(input: SendVerificationEmailInput) {
  const escapedUsername = escapeHtml(input.username || "there");
  const escapedVerificationUrl = escapeHtml(input.verificationUrl);

  return {
    subject: "Verify your MovieReckon email",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin-bottom: 12px;">Verify your email address</h2>
        <p style="margin: 0 0 12px 0;">Hi ${escapedUsername},</p>
        <p style="margin: 0 0 12px 0;">
          Please verify your MovieReckon account email by clicking the button below.
        </p>
        <p style="margin: 20px 0;">
          <a href="${escapedVerificationUrl}" style="background: #ef4444; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Verify Email
          </a>
        </p>
        <p style="margin: 0 0 8px 0; color: #4b5563;">
          If the button does not work, copy and paste this link:
        </p>
        <p style="margin: 0; word-break: break-all;">
          <a href="${escapedVerificationUrl}">${escapedVerificationUrl}</a>
        </p>
        <p style="margin-top: 16px; color: #4b5563;">
          If you did not create a MovieReckon account, you can safely ignore this email.
        </p>
        <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">
          This verification link expires in 24 hours.
        </p>
      </div>
    `,
    text: [
      `Hi ${input.username || "there"},`,
      "",
      "Please verify your MovieReckon account email by visiting the link below:",
      input.verificationUrl,
      "",
      "If you did not create a MovieReckon account, you can safely ignore this email.",
      "This verification link expires in 24 hours.",
    ].join("\n"),
  };
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = (await response.json()) as Record<string, unknown>;
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function getErrorCode(errorPayload: Record<string, unknown>): string {
  const candidates = [
    errorPayload.name,
    errorPayload.code,
    errorPayload.error,
    errorPayload.type,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim().toLowerCase();
    }
  }

  return "";
}

function isRetryableResponseStatus(status: number, errorCode: string): boolean {
  if (status === 409) {
    return errorCode === "concurrent_idempotent_requests";
  }

  if (status === 429 && /quota_exceeded/.test(errorCode)) {
    return false;
  }

  return RETRYABLE_STATUS_CODES.has(status);
}

function parseRetryAfterMs(response: Response): number {
  const retryAfterHeader = response.headers.get("retry-after");
  if (!retryAfterHeader) return 0;

  const retryAfterSeconds = Number.parseFloat(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.floor(retryAfterSeconds * 1000);
  }

  const retryAfterDateMs = Date.parse(retryAfterHeader);
  if (!Number.isNaN(retryAfterDateMs)) {
    return Math.max(retryAfterDateMs - Date.now(), 0);
  }

  return 0;
}

function getBackoffDelayMs(attempt: number, retryAfterMs: number): number {
  if (retryAfterMs > 0) {
    return retryAfterMs;
  }

  return attempt * 300;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAbortSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("resend_request_timeout"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

async function sendWithResend(
  config: ResendConfig,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const { signal, cleanup } = buildAbortSignal(config.timeoutMs);

    try {
      const response = await fetch(RESEND_SEND_EMAIL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal,
      });

      const responseJson = await parseJsonSafe(response);

      if (response.ok) {
        return typeof responseJson.id === "string" ? responseJson.id : null;
      }

      const errorCode = getErrorCode(responseJson);
      const retryable = attempt < config.maxAttempts && isRetryableResponseStatus(response.status, errorCode);
      if (retryable) {
        await sleep(getBackoffDelayMs(attempt, parseRetryAfterMs(response)));
        continue;
      }

      console.error("Resend email error:", {
        status: response.status,
        errorCode,
        payload: responseJson,
      });
      throw new Error("Failed to send verification email");
    } catch (error) {
      const abortError = error instanceof Error && error.name === "AbortError";
      const retryable = attempt < config.maxAttempts && (signal.aborted || abortError || error instanceof TypeError);
      if (retryable) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await sleep(getBackoffDelayMs(attempt, 0));
        continue;
      }

      throw error instanceof Error ? error : new Error("Failed to send verification email");
    } finally {
      cleanup();
    }
  }

  throw lastError || new Error("Failed to send verification email");
}

export async function sendVerificationEmail(
  input: SendVerificationEmailInput,
): Promise<SendVerificationEmailResult> {
  const config = getResendConfig();

  if (!isLikelyEmailAddress(input.toEmail)) {
    throw new Error("A valid recipient email address is required");
  }

  if (config.fromEmail && !isLikelyEmailAddress(config.fromEmail)) {
    throw new Error("RESEND_FROM_EMAIL must be a valid email address");
  }

  if (config.replyToEmail && !isLikelyEmailAddress(config.replyToEmail)) {
    throw new Error("RESEND_REPLY_TO_EMAIL must be a valid email address");
  }

  const { subject, html, text } = buildVerificationEmailContent(input);
  const idempotencyKey = buildVerificationIdempotencyKey(input);

  if (!config.apiKey || !config.fromEmail) {
    if (isProductionEnv()) {
      throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured in production");
    }

    console.info(`[email-dev] Verify ${input.toEmail}: ${input.verificationUrl}`);
    return { sent: false, previewUrl: input.verificationUrl, providerId: null };
  }

  const payload: Record<string, unknown> = {
    from: `${config.fromName} <${config.fromEmail}>`,
    to: [input.toEmail],
    subject,
    html,
    text,
    reply_to: config.replyToEmail || config.fromEmail,
    tags: [
      { name: "flow", value: "auth" },
      { name: "template", value: "verify_email" },
      { name: "user_id", value: buildTagValue(input.userId, "unknown") },
      { name: "env", value: buildTagValue(normalizeHeaderToken(process.env.NODE_ENV || "development", "development"), "development") },
    ],
    headers: {
      "X-Entity-Ref-ID": idempotencyKey,
    },
  };

  const providerId = await sendWithResend(config, payload, idempotencyKey);
  return { sent: true, previewUrl: null, providerId };
}
