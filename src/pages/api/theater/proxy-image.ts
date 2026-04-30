/**
 * GET /api/theater/proxy-image?url=ENCODED_URL
 * Server-side image proxy — bypasses CDN hotlink protection for cast photos.
 * Requests come from Vercel's servers, not the browser, so Referer-based
 * blocking is avoided.
 *
 * Security:
 * - DNS resolved once; HTTP connection pinned to that IP (prevents rebinding TOCTOU)
 * - Content-Type normalized against strict allowlist (prevents SVG/script injection)
 * - Private IP ranges blocked (prevents SSRF to internal services)
 */
import { isIP } from "node:net";
import { resolve4 } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_SIZE_BYTES = 10_000_000; // 10 MB
const CACHE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Strict allowlist — SVG/XML explicitly excluded (can execute scripts in-browser)
const SAFE_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
  "image/avif": "image/avif",
};

function isPrivateIp(ip: string): boolean {
  const normalized = ip.toLowerCase();
  const version = isIP(normalized);
  if (version === 4) {
    const [a, b] = normalized.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
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

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".localhost") ||
    h === "metadata.google.internal" ||
    (isIP(h) > 0 && isPrivateIp(h))
  );
}

/**
 * Resolve hostname to IPv4 addresses, verify all are public, return first safe IP.
 * Returns null if any address is private or resolution fails.
 */
async function resolveToPublicIp(hostname: string): Promise<string | null> {
  // If already an IP literal, validate directly without DNS
  if (isIP(hostname) > 0) {
    return isPrivateIp(hostname) ? null : hostname;
  }
  try {
    const addresses = await resolve4(hostname);
    if (addresses.length === 0) return null;
    // Reject if ANY resolved IP is private (multi-homed host attack)
    if (addresses.some((ip) => isPrivateIp(ip))) return null;
    return addresses[0];
  } catch {
    return null; // DNS failure → block
  }
}

/**
 * Fetch URL with the connection pinned to a pre-resolved IP.
 * This eliminates the DNS rebinding TOCTOU window: the DNS lookup that
 * produced `resolvedIp` is the only lookup that influences the connection.
 */
function fetchWithPinnedIp(
  urlStr: string,
  resolvedIp: string,
): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === "https:";
    const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        hostname: parsed.hostname, // used for TLS SNI — cert validated against real hostname
        port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MovieReckon/1.0)",
          Accept: "image/jpeg,image/png,image/webp,image/gif,image/avif",
          Host: parsed.hostname,
        },
        // Pin the TCP connection to our pre-verified IP — second DNS lookup never happens
        lookup: (
          _host: string,
          _opts: unknown,
          cb: (err: null, addr: string, family: 4) => void,
        ) => cb(null, resolvedIp, 4),
        timeout: 8_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            contentType: (res.headers["content-type"] ?? "").toLowerCase(),
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Upstream timeout"));
    });
    req.end();
  });
}

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

  if (isBlockedHostname(parsed.hostname)) {
    return res.status(403).json({ error: "URL not allowed" });
  }

  // Resolve once — this same IP is used for the connection (no second lookup)
  const resolvedIp = await resolveToPublicIp(parsed.hostname);
  if (!resolvedIp) {
    return res.status(403).json({ error: "URL not allowed" });
  }

  try {
    const upstream = await fetchWithPinnedIp(urlStr, resolvedIp);

    if (upstream.status < 200 || upstream.status >= 300) {
      return res.status(502).json({ error: `Upstream returned ${upstream.status}` });
    }

    // Normalize against allowlist — never reflect upstream value directly (SVG injection)
    const rawMime = upstream.contentType.split(";")[0].trim();
    const safeContentType = SAFE_CONTENT_TYPES[rawMime];
    if (!safeContentType) {
      return res.status(422).json({ error: "URL does not point to a supported image type" });
    }

    if (upstream.body.byteLength > MAX_SIZE_BYTES) {
      return res.status(413).json({ error: "Image too large" });
    }

    res.setHeader("Content-Type", safeContentType);
    res.setHeader("Cache-Control", `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(upstream.body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy fetch failed";
    return res.status(502).json({ error: msg });
  }
}
