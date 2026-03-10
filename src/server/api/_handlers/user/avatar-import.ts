/**
 * POST /api/user/avatar-import
 * Fetch a remote avatar image so the client can optimize and store it locally.
 */
import { isIP } from "node:net";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserFromRequest } from "../../lib/auth.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import { sanitizeSingleLineText } from "../../lib/input.js";

const MAX_REMOTE_AVATAR_BYTES = 5 * 1024 * 1024;

function isPrivateIpHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const version = isIP(normalized);

  if (version === 4) {
    const [a, b] = normalized.split(".").map((part) => Number(part));
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  if (version === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

function isBlockedRemoteHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".localhost") ||
    isPrivateIpHostname(normalized)
  );
}

function parseRemoteAvatarUrl(rawValue: unknown): URL | null {
  const value = sanitizeSingleLineText(rawValue, 1500, {
    fallback: null,
    collapseWhitespace: false,
  });
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (isBlockedRemoteHostname(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const clientIp = getClientIp(req);
  const rateLimit = await consumeRateLimit(
    `user:avatar-import:${clientIp}`,
    20,
    10 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "user_avatar_import",
      reason: "avatar_import_limit",
      req,
      metadata: { source: rateLimit.source },
    });
    res.setHeader("Retry-After", String(Math.max(rateLimit.retryAfterSeconds, 30)));
    return res.status(429).json({ error: "Too many avatar import attempts. Please try again later." });
  }

  const remoteUrl = parseRemoteAvatarUrl(req.body?.url);
  if (!remoteUrl) {
    return res.status(400).json({ error: "Provide a valid public http(s) image URL." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(remoteUrl.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "MovieReckonAvatarImporter/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return res.status(400).json({ error: "Could not fetch image from that URL." });
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ error: "The provided URL did not return an image." });
    }

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_AVATAR_BYTES) {
      return res.status(400).json({ error: "The remote image is too large. Use a smaller image." });
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (imageBuffer.byteLength > MAX_REMOTE_AVATAR_BYTES) {
      return res.status(400).json({ error: "The remote image is too large. Use a smaller image." });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(imageBuffer.byteLength));
    return res.status(200).send(imageBuffer);
  } catch (error) {
    console.error("Avatar import error:", error);
    return res.status(400).json({ error: "Unable to import image from that URL." });
  } finally {
    clearTimeout(timeout);
  }
}
