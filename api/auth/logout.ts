/**
 * POST /api/auth/logout
 * Logout and invalidate refresh token
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../lib/mongodb";
import { verifyRefreshToken } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      if (payload) {
        const { db } = await connectToDatabase();
        await db.collection("refresh_tokens").deleteOne({
          user_id: payload.id,
          token: refreshToken,
        });
      }
    }

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
