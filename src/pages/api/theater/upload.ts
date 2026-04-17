/**
 * POST /api/theater/upload
 * Upload a theater image (poster or cast photo) to Vercel Blob.
 * Requires admin JWT in Authorization header.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { put } from "@vercel/blob";

const JWT_SECRET = process.env.JWT_SECRET!;
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

function verifyAdminToken(req: NextApiRequest): boolean {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    return payload.role === "admin";
  } catch {
    return false;
  }
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
  if (!verifyAdminToken(req)) return res.status(403).json({ error: "Admin access required" });

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
