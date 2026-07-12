/**
 * POST /api/theater/upload
 * Upload a theater image (poster or cast photo) to Vercel Blob.
 * Requires authenticated admin cookie session.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { put } from "@vercel/blob";
import { getUserFromRequest, userHasRoleAtLeast } from "@/backend/api/lib/auth";
import {
  hasAjaxHeader,
  isTrustedRequestOrigin,
} from "@/backend/api/lib/cors";
import {
  consumeRateLimit,
  getClientIp,
  handleRateLimitUnavailable,
} from "@/backend/api/lib/rate-limit";

const MAX_BYTES = 5_000_000; // 5 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const DATA_URL_RE =
  /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;

export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6) {
    const signature = buffer.subarray(0, 6).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isTrustedRequestOrigin(req as never, { allowRefererFallback: true })) {
    return res.status(403).json({ error: "Invalid request origin" });
  }
  if (!hasAjaxHeader(req as never)) {
    return res.status(403).json({ error: "Missing required request header" });
  }

  let rateLimit;
  try {
    rateLimit = await consumeRateLimit(
      `theater:upload:${getClientIp(req as never)}`,
      20,
      15 * 60 * 1000,
    );
  } catch (error) {
    if (handleRateLimitUnavailable(error, res as never)) return;
    throw error;
  }
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    return res.status(429).json({ error: "Too many uploads. Please wait." });
  }

  const user = await getUserFromRequest(req);
  if (!user || !(await userHasRoleAtLeast(user, "admin"))) {
    return res.status(403).json({ error: "Admin access required" });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "Blob storage is not configured" });
  }

  const { data_url, filename = "image" } = req.body as {
    data_url?: string;
    filename?: string;
  };

  if (!data_url || typeof data_url !== "string") {
    return res.status(400).json({ error: "data_url is required" });
  }

  const match = DATA_URL_RE.exec(data_url);
  if (!match) {
    return res.status(400).json({ error: "Invalid image format. Use JPEG, PNG, WebP, or GIF." });
  }

  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) return res.status(400).json({ error: "Unsupported image type" });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    return res.status(400).json({ error: "Invalid base64 data" });
  }

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return res.status(400).json({ error: "Image must be between 1 byte and 5 MB" });
  }
  if (detectImageMime(buffer) !== mimeType) {
    return res.status(400).json({ error: "Image content does not match its declared format" });
  }

  const safeBase = String(filename)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "image";

  try {
    const pathname = `theater/${safeBase}-${Date.now()}.${ext}`;
    const blob = await put(pathname, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: mimeType,
    });
    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error("Theater upload error:", err);
    return res.status(500).json({ error: "Upload failed. Please try again." });
  }
}
