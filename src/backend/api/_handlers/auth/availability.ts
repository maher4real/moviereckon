/**
 * GET /api/auth/availability
 * Check whether signup email or username is already taken
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "../../lib/input.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

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
  const rateLimit = await consumeRateLimit(`auth:availability:ip:${clientIp}`, 90, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "auth_availability",
      reason: "availability_check_limit",
      req,
      metadata: { source: rateLimit.source },
    });
    res.setHeader("Retry-After", String(Math.max(rateLimit.retryAfterSeconds, 30)));
    return res.status(429).json({ error: "Too many availability checks. Please try again shortly." });
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

  const filters: Array<Record<string, string>> = [];
  if (email) filters.push({ email });
  if (username) filters.push({ username });

  const { db } = await connectToDatabase();
  const existing = await db
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
    .toArray();

  const emailExists = email ? existing.some((user) => user.email === email) : false;
  const usernameExists = username ? existing.some((user) => user.username === username) : false;

  return res.status(200).json({
    email_exists: emailExists,
    username_exists: usernameExists,
  });
}
