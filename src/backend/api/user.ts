/**
 * User Router - Consolidated serverless function
 * Routes: /api/user/watch-history, /api/user/liked-items, /api/user/preferences,
 * /api/user/profile, /api/user/avatar-import, /api/user/avatar-upload, /api/user/clear-history,
 * /api/user/comments, /api/user/feedback, /api/user/recommendations, /api/user/watchlist
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { installGlobalSafeLogging } from "@/shared/lib/safeLogging";
import watchHistoryHandler from "./_handlers/user/watch-history.js";
import likedItemsHandler from "./_handlers/user/liked-items.js";
import watchlistHandler from "./_handlers/user/watchlist.js";
import preferencesHandler from "./_handlers/user/preferences.js";
import profileHandler from "./_handlers/user/profile.js";
import avatarImportHandler from "./_handlers/user/avatar-import.js";
import avatarUploadHandler from "./_handlers/user/avatar-upload.js";
import clearHistoryHandler from "./_handlers/user/clear-history.js";
import commentsHandler from "./_handlers/user/comments.js";
import feedbackHandler from "./_handlers/user/feedback.js";
import recommendationsHandler from "./_handlers/user/recommendations.js";
import aiRecommendationsHandler from "./_handlers/user/ai-recommendations.js";
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
        route: "user_router",
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
      route: "user_router",
      reason: "origin_not_allowed",
      req,
    });
    return res.status(403).json({ error: "Origin not allowed" });
  }

  applyNoStoreHeaders(res);

  const method = (req.method || "GET").toUpperCase();
  const routeRateLimit = await consumeRateLimit(
    `user:router:${getClientIp(req)}:${method}`,
    isStateChangingMethod(method) ? 220 : 520,
    5 * 60 * 1000,
  );
  if (!routeRateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "user_router",
      reason: "router_limit",
      req,
      metadata: { source: routeRateLimit.source },
    });
    const retryAfter = Math.max(routeRateLimit.retryAfterSeconds, 30);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many user requests. Please try again shortly." });
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
        route: "user_router",
        reason: "untrusted_origin",
        req,
      });
      return res.status(403).json({ error: "Invalid request origin" });
    }

    if (!hasAjaxHeader(req)) {
      emitSecurityEvent({
        type: "csrf_header_missing",
        outcome: "blocked",
        route: "user_router",
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
  // pathParts = ['api', 'user', 'watch-history'] etc.
  const routeFromQuery = url.searchParams.get("route") || "";
  const routeFromPath = pathParts[2] || "";
  const route = routeFromQuery || routeFromPath;

  try {
    switch (route) {
      case "watch-history":
        return watchHistoryHandler(req, res);
      case "liked-items":
        return likedItemsHandler(req, res);
      case "preferences":
        return preferencesHandler(req, res);
      case "profile":
        return profileHandler(req, res);
      case "avatar-import":
        return avatarImportHandler(req, res);
      case "avatar-upload":
        return avatarUploadHandler(req, res);
      case "clear-history":
        return clearHistoryHandler(req, res);
      case "comments":
        return commentsHandler(req, res);
      case "feedback":
        return feedbackHandler(req, res);
      case "recommendations":
        return recommendationsHandler(req, res);
      case "ai-recommendations":
        return aiRecommendationsHandler(req, res);
      case "watchlist":
        return watchlistHandler(req, res);
      default:
        return res.status(404).json({ error: `User route not found: ${route}` });
    }
  } catch (error) {
    console.error("User router error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
