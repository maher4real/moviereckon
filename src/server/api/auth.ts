/**
 * Auth Router - Consolidated serverless function
 * Routes: /api/auth/login, /api/auth/register, /api/auth/refresh, /api/auth/me,
 * /api/auth/logout, /api/auth/availability, /api/auth/google-start, /api/auth/google-callback,
 * /api/auth/verify-email
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import availabilityHandler from "./_handlers/auth/availability.js";
import loginHandler from "./_handlers/auth/login.js";
import registerHandler from "./_handlers/auth/register.js";
import refreshHandler from "./_handlers/auth/refresh.js";
import meHandler from "./_handlers/auth/me.js";
import logoutHandler from "./_handlers/auth/logout.js";
import googleStartHandler from "./_handlers/auth/google-start.js";
import googleCallbackHandler from "./_handlers/auth/google-callback.js";
import verifyEmailHandler from "./_handlers/auth/verify-email.js";
import {
  applyApiCors,
  applyDefaultSecurityHeaders,
  hasAjaxHeader,
  isStateChangingMethod,
  isTrustedRequestOrigin,
} from "./lib/cors.js";
import { emitSecurityEvent } from "./lib/abuse-telemetry.js";
import { consumeRateLimit, getClientIp } from "./lib/rate-limit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyDefaultSecurityHeaders(res);
  const { originAllowed } = applyApiCors(req, res);

  if (req.method === "OPTIONS") {
    if (!originAllowed) {
      emitSecurityEvent({
        type: "cors_origin_blocked",
        outcome: "blocked",
        route: "auth_router",
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
      route: "auth_router",
      reason: "origin_not_allowed",
      req,
    });
    return res.status(403).json({ error: "Origin not allowed" });
  }

  const method = (req.method || "GET").toUpperCase();
  const routeRateLimit = await consumeRateLimit(
    `auth:router:${getClientIp(req)}:${method}`,
    isStateChangingMethod(method) ? 160 : 420,
    5 * 60 * 1000,
  );
  if (!routeRateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "auth_router",
      reason: "router_limit",
      req,
      metadata: { source: routeRateLimit.source },
    });
    const retryAfter = Math.max(routeRateLimit.retryAfterSeconds, 30);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many auth requests. Please try again shortly." });
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
        route: "auth_router",
        reason: "untrusted_origin",
        req,
      });
      return res.status(403).json({ error: "Invalid request origin" });
    }

    if (!hasAjaxHeader(req)) {
      emitSecurityEvent({
        type: "csrf_header_missing",
        outcome: "blocked",
        route: "auth_router",
        reason: "missing_x_requested_with",
        req,
      });
      return res.status(403).json({ error: "Missing required request header" });
    }
  }

  // Legacy CORS fallback (disabled for security):
  // res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  // res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  // res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // res.setHeader("Access-Control-Allow-Credentials", "true");

  // Parse the route from the URL
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // pathParts = ['api', 'auth', 'login'] etc.
  const routeFromQuery = url.searchParams.get("route") || "";
  const routeFromPath = pathParts[2] || "";
  const route = routeFromQuery || routeFromPath;

  try {
    switch (route) {
      case "availability":
        return availabilityHandler(req, res);
      case "login":
        return loginHandler(req, res);
      case "register":
        return registerHandler(req, res);
      case "refresh":
        return refreshHandler(req, res);
      case "me":
        return meHandler(req, res);
      case "logout":
        return logoutHandler(req, res);
      case "google-start":
        return googleStartHandler(req, res);
      case "google-callback":
        return googleCallbackHandler(req, res);
      case "verify-email":
        return verifyEmailHandler(req, res);
      default:
        return res.status(404).json({ error: `Auth route not found: ${route}` });
    }
  } catch (error) {
    console.error("Auth router error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
