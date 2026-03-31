/**
 * GET /api/auth/availability
 * Check whether signup email or username is already taken
 * Rate-limited to prevent username/email enumeration attacks
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import {
  sanitizeEmailAddress,
  sanitizeSingleLineText,
} from "../../lib/input.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

// Simulate query delay to prevent timing-based username enumeration
async function constantTimeDelay(): Promise<void> {
  // Add random jitter between 50-150ms to prevent timing attacks
  const delayMs = 50 + Math.random() * 100;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientIp = getClientIp(req);

  // Stricter rate limiting to prevent enumeration attacks:
  // 30 requests per 10 minutes per IP (vs 90 before)
  const rateLimit = await consumeRateLimit(
    `auth:availability:ip:${clientIp}`,
    30,
    10 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "auth_availability",
      reason: "availability_check_limit",
      req,
      metadata: { source: rateLimit.source },
    });
    res.setHeader(
      "Retry-After",
      String(Math.max(rateLimit.retryAfterSeconds, 60)),
    );
    return res
      .status(429)
      .json({
        error: "Too many availability checks. Please try again shortly.",
      });
  }

  const email = sanitizeEmailAddress(getQueryParam(req, "email"));
  const username =
    sanitizeSingleLineText(getQueryParam(req, "username"), 128, {
      fallback: "",
      collapseWhitespace: false,
    }) || "";

  if (!email && !username) {
    return res.status(400).json({ error: "email or username is required" });
  }

  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  if (username && !USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username" });
  }

  try {
    const filters: Array<Record<string, string>> = [];
    if (email) filters.push({ email });
    if (username) filters.push({ username });

    const { db } = await connectToDatabase();

    // Start query and delay in parallel to maintain constant response time
    const [existing] = await Promise.all([
      db
        .collection("users")
        .find(
          { $or: filters },
          {
            projection: {
              email: 1,
              username: 1,
            },
          },
        )
        .toArray(),
      constantTimeDelay(),
    ]);

    const emailExists = email
      ? existing.some((user) => user.email === email)
      : false;
    const usernameExists = username
      ? existing.some((user) => user.username === username)
      : false;

    return res.status(200).json({
      email_exists: emailExists,
      username_exists: usernameExists,
    });
  } catch (error) {
    console.error("Availability check error:", error);
    return res
      .status(500)
      .json({ error: "Service error. Please try again shortly." });
  }
}
