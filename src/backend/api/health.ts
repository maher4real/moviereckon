/**
 * GET /api/health
 * Health check endpoint - verifies MongoDB connection
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { installGlobalSafeLogging } from "@/shared/lib/safeLogging";
import { connectToDatabase } from "./lib/mongodb.js";
import { applyApiCors, applyDefaultSecurityHeaders } from "./lib/cors.js";

installGlobalSafeLogging();

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
  // res.setHeader("Access-Control-Allow-Origin", "*");
  // res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  // res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const start = Date.now();
    const { db } = await connectToDatabase();

    // Simple ping to verify connection
    await db.command({ ping: 1 });
    const latency = Date.now() - start;

    return res.status(200).json({
      status: "healthy",
      latency_ms: latency,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return res.status(500).json({
      status: "unhealthy",
      // Return generic error to avoid leaking infrastructure details.
      error: "Service unavailable",
      timestamp: new Date().toISOString(),
    });
  }
}
