/**
 * Theater Router - /api/theater/[...route]
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { installGlobalSafeLogging } from "@/shared/lib/safeLogging";
import theaterHandler from "./_handlers/theater/index.js";
import {
  applyApiCors,
  applyDefaultSecurityHeaders,
  applyNoStoreHeaders,
  hasAjaxHeader,
  isStateChangingMethod,
  isTrustedRequestOrigin,
} from "./lib/cors.js";
import { emitSecurityEvent } from "./lib/abuse-telemetry.js";
import { consumeRateLimit, getClientIp } from "./lib/rate-limit.js";

installGlobalSafeLogging();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyDefaultSecurityHeaders(res);
  const { originAllowed } = applyApiCors(req, res);

  if (req.method === "OPTIONS") {
    if (!originAllowed) {
      emitSecurityEvent({
        type: "cors_origin_blocked",
        outcome: "blocked",
        route: "theater_router",
        reason: "preflight_origin_not_allowed",
        req,
      });
      return res.status(403).json({ error: "Origin not allowed" });
    }
    return res.status(204).end();
  }

  if (!originAllowed) {
    emitSecurityEvent({
      type: "cors_origin_blocked",
      outcome: "blocked",
      route: "theater_router",
      reason: "origin_not_allowed",
      req,
    });
    return res.status(403).json({ error: "Origin not allowed" });
  }

  applyNoStoreHeaders(res);

  const method = (req.method || "GET").toUpperCase();
  const routeRateLimit = await consumeRateLimit(
    `theater:router:${getClientIp(req)}:${method}`,
    isStateChangingMethod(method) ? 60 : 300,
    5 * 60 * 1000,
  );
  if (!routeRateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "theater_router",
      reason: "router_limit",
      req,
      metadata: { source: routeRateLimit.source },
    });
    const retryAfter = Math.max(routeRateLimit.retryAfterSeconds, 30);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }

  if (isStateChangingMethod(method)) {
    if (
      !isTrustedRequestOrigin(req, {
        allowRefererFallback: true,
        allowMissingOriginForSafeMethods: false,
      })
    ) {
      emitSecurityEvent({
        type: "csrf_origin_blocked",
        outcome: "blocked",
        route: "theater_router",
        reason: "untrusted_origin",
        req,
      });
      return res.status(403).json({ error: "Invalid request origin" });
    }

    if (!hasAjaxHeader(req)) {
      emitSecurityEvent({
        type: "csrf_header_missing",
        outcome: "blocked",
        route: "theater_router",
        reason: "missing_x_requested_with",
        req,
      });
      return res.status(403).json({ error: "Missing required request header" });
    }
  }

  try {
    return theaterHandler(req, res);
  } catch (error) {
    console.error("Theater router error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
