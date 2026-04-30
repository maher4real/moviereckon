import type { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { consumeRateLimit } from "@/backend/api/lib/rate-limit";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const ADMIN_TOKEN_EXPIRES = "8h";

function getIp(req: NextApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(fwd) ? fwd[0] : fwd;
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real;
  return "unknown";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require non-empty password, secret with at least 32 chars (256 bits minimum)
  if (!ADMIN_PASSWORD || JWT_SECRET.length < 32) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }

  // 10 attempts per IP per 15 minutes
  const ip = getIp(req);
  const rl = await consumeRateLimit(`admin:login:ip:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSeconds));
    return res.status(429).json({ error: "Too many attempts. Please wait." });
  }

  const { password } = req.body as { password?: string };

  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password required" });
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(ADMIN_PASSWORD);
  const provided = Buffer.from(password);
  const match =
    expected.length === provided.length &&
    Buffer.compare(expected, provided) === 0;

  if (!match) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = jwt.sign(
    { role: "admin", iss: "moviereckon-admin" },
    JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_EXPIRES }
  );

  return res.status(200).json({ token });
}
