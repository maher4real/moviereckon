import type { VercelRequest, VercelResponse } from "./http";
import { verifyCaptchaToken } from "./captcha.js";
import { consumeRateLimit, getClientIp } from "./rate-limit.js";
import { emitSecurityEvent } from "./abuse-telemetry.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "./input.js";
import { getPasswordValidationError } from "./password-policy.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
const verifiedRequests = new WeakMap<object, Set<"login" | "register">>();

export function wasForwardingPolicyVerified(
  req: VercelRequest,
  kind: "login" | "register",
): boolean {
  return verifiedRequests.get(req)?.has(kind) === true;
}

function markVerified(req: VercelRequest, kind: "login" | "register") {
  const kinds = verifiedRequests.get(req) ?? new Set<"login" | "register">();
  kinds.add(kind);
  verifiedRequests.set(req, kinds);
}

function captchaToken(req: VercelRequest): string {
  return sanitizeSingleLineText(req.body?.captcha_token, 4096, {
    fallback: "",
    collapseWhitespace: false,
  }) || "";
}

export async function enforceLoginForwardingPolicy(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ email: string; password: string } | null> {
  const email = sanitizeEmailAddress(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const [ipLimit, emailLimit] = await Promise.all([
    consumeRateLimit(`auth:login:ip:${getClientIp(req)}`, 25, 15 * 60 * 1000),
    consumeRateLimit(`auth:login:email:${email || "missing"}`, 12, 15 * 60 * 1000),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds, 60);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many login attempts. Please try again later." });
    return null;
  }
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return null;
  }
  const captcha = await verifyCaptchaToken(req, captchaToken(req), "login");
  if (!captcha.ok) {
    emitSecurityEvent({ type: "captcha_failed", outcome: "blocked", route: "auth_login", reason: captcha.reason || "captcha_verification_failed", req });
    res.status(400).json({ error: captcha.error || "CAPTCHA verification failed" });
    return null;
  }
  markVerified(req, "login");
  return { email, password };
}

export async function enforceRegistrationForwardingPolicy(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ email: string; password: string; username: string } | null> {
  const email = sanitizeEmailAddress(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const username = sanitizeSingleLineText(req.body?.username, 128, {
    fallback: "",
    collapseWhitespace: false,
  }) || "";
  const ipLimit = await consumeRateLimit(`auth:register:ip:${getClientIp(req)}`, 8, 30 * 60 * 1000);
  if (!ipLimit.allowed) {
    res.setHeader("Retry-After", String(Math.max(ipLimit.retryAfterSeconds, 60)));
    res.status(429).json({ error: "Too many registration attempts. Please try again later." });
    return null;
  }
  if (!email || !password || !username) {
    res.status(400).json({ error: "Email, password, and username are required" });
    return null;
  }
  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: "Please provide a valid email address" });
    return null;
  }
  if (!USERNAME_REGEX.test(username)) {
    res.status(400).json({ error: "Username must be 3-24 chars and only include letters, numbers, and underscores" });
    return null;
  }
  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return null;
  }
  const captcha = await verifyCaptchaToken(req, captchaToken(req), "signup");
  if (!captcha.ok) {
    emitSecurityEvent({ type: "captcha_failed", outcome: "blocked", route: "auth_register", reason: captcha.reason || "captcha_verification_failed", req });
    res.status(400).json({ error: captcha.error || "CAPTCHA verification failed" });
    return null;
  }
  markVerified(req, "register");
  return { email, password, username };
}
