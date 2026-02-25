import type { VercelRequest } from "@vercel/node";
import { getClientIp } from "./rate-limit.js";

const TURNSTILE_VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
};

export type CaptchaVerificationResult = {
  ok: boolean;
  error: string | null;
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
  expectedAction: "login" | "signup",
): Promise<CaptchaVerificationResult> {
  const secret = getSecretKey();
  if (!secret) {
    return { ok: false, error: "Captcha is not configured on the server." };
  }

  if (!token || token.trim().length === 0) {
    return { ok: false, error: "Please complete CAPTCHA verification." };
  }

  const formData = new URLSearchParams({
    secret,
    response: token.trim(),
    remoteip: getClientIp(req),
  });

  try {
    const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok || data.success !== true) {
      return { ok: false, error: "CAPTCHA verification failed. Please try again." };
    }

    if (data.action && data.action !== expectedAction) {
      return { ok: false, error: "CAPTCHA action mismatch. Please retry." };
    }

    const skipHostnameCheck = process.env.TURNSTILE_SKIP_HOSTNAME_CHECK === "true";
    if (!skipHostnameCheck) {
      const allowedHostnames = getAllowedCaptchaHostnames(req);
      const responseHostname = typeof data.hostname === "string" ? normalizeHostname(data.hostname) : "";

      if (allowedHostnames.size > 0 && (!responseHostname || !allowedHostnames.has(responseHostname))) {
        return { ok: false, error: "CAPTCHA hostname validation failed. Please retry." };
      }
    }

    return { ok: true, error: null };
  } catch (error) {
    console.error("CAPTCHA verification error:", error);
    return { ok: false, error: "Unable to validate CAPTCHA right now. Please try again." };
  }
}
