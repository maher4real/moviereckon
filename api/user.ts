/**
 * User Router - Consolidated serverless function
 * Routes: /api/user/watch-history, /api/user/liked-items, /api/user/preferences,
 * /api/user/profile, /api/user/clear-history, /api/user/comments, /api/user/feedback
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import watchHistoryHandler from "./_handlers/user/watch-history.js";
import likedItemsHandler from "./_handlers/user/liked-items.js";
import preferencesHandler from "./_handlers/user/preferences.js";
import profileHandler from "./_handlers/user/profile.js";
import clearHistoryHandler from "./_handlers/user/clear-history.js";
import commentsHandler from "./_handlers/user/comments.js";
import feedbackHandler from "./_handlers/user/feedback.js";
import { applyApiCors, applyDefaultSecurityHeaders } from "./lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyDefaultSecurityHeaders(res);
  const { originAllowed } = applyApiCors(req, res);

  if (req.method === "OPTIONS") {
    if (!originAllowed) {
      return res.status(403).json({ error: "Origin not allowed" });
    }
    return res.status(204).end();
  }

  if (!originAllowed) {
    return res.status(403).json({ error: "Origin not allowed" });
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
  const route = pathParts[2] || "";

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
      case "clear-history":
        return clearHistoryHandler(req, res);
      case "comments":
        return commentsHandler(req, res);
      case "feedback":
        return feedbackHandler(req, res);
      default:
        return res.status(404).json({ error: `User route not found: ${route}` });
    }
  } catch (error) {
    console.error("User router error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
