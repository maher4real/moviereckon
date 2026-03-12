import type { VercelRequest, VercelResponse } from "@vercel/node";
import { installGlobalSafeLogging } from "@/shared/lib/safeLogging";
import {
  isTmdbImageKind,
  resolveTmdbImageSourceUrl,
} from "@/shared/lib/tmdbImageProxy";
import { applyDefaultSecurityHeaders } from "./lib/cors.js";

installGlobalSafeLogging();

const IMAGE_PROXY_CACHE_CONTROL =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

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
      return res.status(upstreamResponse.status === 404 ? 404 : 502).end();
    }

    const contentType = upstreamResponse.headers.get("content-type") || "image/jpeg";
    const body = Buffer.from(await upstreamResponse.arrayBuffer());

    res.setHeader("Cache-Control", IMAGE_PROXY_CACHE_CONTROL);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(body.byteLength));
    return res.status(200).send(body);
  } catch (error) {
    clearTimeout(timeout);
    console.error("TMDB image proxy error:", error);
    return res.status(502).end();
  }
}
