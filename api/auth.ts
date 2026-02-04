/**
 * Auth Router - Consolidated serverless function
 * Routes: /api/auth/login, /api/auth/register, /api/auth/refresh, /api/auth/me, /api/auth/logout
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import loginHandler from "./_handlers/auth/login.js";
import registerHandler from "./_handlers/auth/register.js";
import refreshHandler from "./_handlers/auth/refresh.js";
import meHandler from "./_handlers/auth/me.js";
import logoutHandler from "./_handlers/auth/logout.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Parse the route from the URL
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // pathParts = ['api', 'auth', 'login'] etc.
  const route = pathParts[2] || "";

  try {
    switch (route) {
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
      default:
        return res.status(404).json({ error: `Auth route not found: ${route}` });
    }
  } catch (error) {
    console.error("Auth router error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
