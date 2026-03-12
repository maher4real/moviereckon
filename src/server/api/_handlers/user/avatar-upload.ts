/**
 * POST /api/user/avatar-upload
 * Upload a client-optimized avatar image to Vercel Blob and return a durable URL.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserFromRequest } from "../../lib/auth.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import { sanitizeSingleLineText } from "../../lib/input.js";
import {
  getBlobImageExtension,
  isBlobStorageConfigured,
  uploadAvatarToBlob,
} from "../../lib/blob.js";

const DATA_IMAGE_REGEX =
  /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;

function parseAvatarPayload(rawValue: unknown) {
  const value = sanitizeSingleLineText(rawValue, 400_000, {
    fallback: null,
    collapseWhitespace: false,
  });
  if (!value) return null;

  const match = DATA_IMAGE_REGEX.exec(value);
  if (!match) return null;

  const contentType = match[1]?.toLowerCase() === "image/jpg"
    ? "image/jpeg"
    : String(match[1] || "").toLowerCase();
  if (!getBlobImageExtension(contentType)) return null;

  try {
    const buffer = Buffer.from(match[2] || "", "base64");
    if (buffer.byteLength === 0) return null;
    return { buffer, contentType };
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

  if (!isBlobStorageConfigured()) {
    return res.status(503).json({
      error: "Avatar uploads are not configured on this deployment.",
    });
  }

  const clientIp = getClientIp(req);
  const rateLimit = await consumeRateLimit(
    `user:avatar-upload:${clientIp}`,
    20,
    10 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "user_avatar_upload",
      reason: "avatar_upload_limit",
      req,
      metadata: { source: rateLimit.source },
    });
    res.setHeader("Retry-After", String(Math.max(rateLimit.retryAfterSeconds, 30)));
    return res.status(429).json({
      error: "Too many avatar upload attempts. Please try again later.",
    });
  }

  const payload = parseAvatarPayload(req.body?.data_url);
  if (!payload) {
    return res.status(400).json({
      error: "Provide a supported avatar image payload.",
    });
  }

  const filenameBase = sanitizeSingleLineText(req.body?.filename, 80, {
    fallback: "avatar",
    collapseWhitespace: true,
  }) || "avatar";

  try {
    const url = await uploadAvatarToBlob({
      userId: user.id,
      body: payload.buffer,
      contentType: payload.contentType,
      filenameBase,
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ url });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return res.status(500).json({
      error: "Unable to upload avatar image right now.",
    });
  }
}
