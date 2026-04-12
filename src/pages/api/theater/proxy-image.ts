/**
 * GET /api/theater/proxy-image?url=ENCODED_URL
 * Server-side image proxy — bypasses CDN hotlink protection for cast photos.
 * Requests come from Vercel's servers, not the browser, so Referer-based
 * blocking is avoided.
 */
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_SIZE_BYTES = 10_000_000; // 10 MB
const CACHE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const raw = req.query.url;
  const urlStr = Array.isArray(raw) ? raw[0] : raw;

  if (!urlStr) return res.status(400).json({ error: "url parameter required" });

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return res.status(400).json({ error: "Only http/https URLs are supported" });
  }

  try {
    const upstream = await fetch(urlStr, {
      headers: {
        // Impersonate a browser to bypass basic bot checks
        "User-Agent": "Mozilla/5.0 (compatible; MovieReckon/1.0)",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(422).json({ error: "URL does not point to an image" });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE_BYTES) {
      return res.status(413).json({ error: "Image too large" });
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy fetch failed";
    return res.status(502).json({ error: msg });
  }
}
