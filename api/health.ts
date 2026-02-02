/**
 * GET /api/health
 * Health check endpoint - verifies MongoDB connection
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "./lib/mongodb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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
      database: "connected",
      latency_ms: latency,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
