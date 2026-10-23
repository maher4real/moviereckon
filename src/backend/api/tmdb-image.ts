import type { VercelRequest, VercelResponse } from "./lib/http";
import { createHash } from "crypto";
import { installGlobalSafeLogging } from "@/shared/lib/safeLogging";
import {
  isTmdbImageKind,
  resolveTmdbImageSourceUrl,
} from "@/shared/lib/tmdbImageProxy";
import { emitSecurityEvent } from "./lib/abuse-telemetry.js";
import { applyDefaultSecurityHeaders } from "./lib/cors.js";
import { consumeRateLimit, getClientIp } from "./lib/rate-limit.js";

installGlobalSafeLogging();

// Poster/backdrop images are content-addressed (URL encodes the specific image
// path) so they never change for a given URL — safe to cache for a year in the
// browser (no revalidation round-trips) and at the CDN edge, which keeps repeat
// requests away from this function, its rate limiter, and TMDB.
const IMAGE_PROXY_CACHE_CONTROL = "public, max-age=31536000, immutable";
const IMAGE_PROXY_CDN_CACHE_CONTROL = "public, max-age=31536000, immutable";
// A missing image stays missing for a while; cache briefly so broken refs don't
// re-invoke the function on every render.
const IMAGE_PROXY_NOT_FOUND_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";
const IMAGE_PROXY_IP_LIMIT_MAX = 320;
const IMAGE_PROXY_IP_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const IMAGE_PROXY_ASSET_LIMIT_MAX = 45;
const IMAGE_PROXY_ASSET_LIMIT_WINDOW_MS = 5 * 60 * 1000;

function hashImageRef(ref: string): string {
  return createHash("sha256").update(ref).digest("hex").slice(0, 16);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyDefaultSecurityHeaders(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const kindParam = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
  const refParam = Array.isArray(req.query.ref) ? req.query.ref[0] : req.query.ref;
  const sizeParam = Array.isArray(req.query.size) ? req.query.size[0] : req.query.size;

  if (typeof kindParam !== "string" || !isTmdbImageKind(kindParam)) {
    return res.status(400).json({ error: "Invalid image kind" });
  }

  if (typeof refParam !== "string" || refParam.trim().length === 0 || refParam.length > 512) {
    return res.status(400).json({ error: "Invalid image ref" });
  }

  const clientIp = getClientIp(req);
  const [ipRateLimit, assetRateLimit] = await Promise.all([
    consumeRateLimit(
      `tmdb-image:ip:${clientIp}`,
      IMAGE_PROXY_IP_LIMIT_MAX,
      IMAGE_PROXY_IP_LIMIT_WINDOW_MS,
    ),
    consumeRateLimit(
      `tmdb-image:asset:${clientIp}:${kindParam}:${hashImageRef(`${sizeParam || "default"}:${refParam}`)}`,
      IMAGE_PROXY_ASSET_LIMIT_MAX,
      IMAGE_PROXY_ASSET_LIMIT_WINDOW_MS,
    ),
  ]);

  if (!ipRateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "tmdb_image_proxy",
      reason: "ip_limit",
      req,
      metadata: {
        kind: typeof kindParam === "string" ? kindParam : "unknown",
        ip_source: ipRateLimit.source,
      },
    });
    res.setHeader("Retry-After", String(Math.max(ipRateLimit.retryAfterSeconds, 30)));
    return res.status(429).json({ error: "Too many image requests. Please try again later." });
  }

  if (!assetRateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "tmdb_image_proxy",
      reason: "asset_limit",
      req,
      metadata: {
        kind: kindParam,
        size: typeof sizeParam === "string" && sizeParam.length > 0 ? sizeParam : "default",
        ip_source: ipRateLimit.source,
        asset_source: assetRateLimit.source,
      },
    });
    const retryAfter = Math.max(ipRateLimit.retryAfterSeconds, assetRateLimit.retryAfterSeconds, 30);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many image requests. Please try again later." });
  }

  const upstreamUrl = resolveTmdbImageSourceUrl({
    kind: kindParam,
    ref: refParam,
    size: typeof sizeParam === "string" ? sizeParam : null,
  });
  if (!upstreamUrl) {
    return res.status(400).json({ error: "Invalid image request" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!upstreamResponse.ok) {
      if (upstreamResponse.status === 404) {
        res.setHeader("Cache-Control", IMAGE_PROXY_NOT_FOUND_CACHE_CONTROL);
        return res.status(404).end();
      }
      return res.status(502).end();
    }

    const contentType = upstreamResponse.headers.get("content-type") || "image/jpeg";
    const body = Buffer.from(await upstreamResponse.arrayBuffer());

    res.setHeader("Cache-Control", IMAGE_PROXY_CACHE_CONTROL);
    res.setHeader("CDN-Cache-Control", IMAGE_PROXY_CDN_CACHE_CONTROL);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(body.byteLength));
    return res.status(200).send(body);
  } catch (error) {
    clearTimeout(timeout);
    console.error("TMDB image proxy error:", error);
    return res.status(502).end();
  }
}
