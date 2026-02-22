import type { VercelRequest } from "@vercel/node";
import { getClientIp } from "./rate-limit.js";

const TURNSTILE_VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  action?: string;
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

    return { ok: true, error: null };
  } catch (error) {
    console.error("CAPTCHA verification error:", error);
    return { ok: false, error: "Unable to validate CAPTCHA right now. Please try again." };
  }
}
