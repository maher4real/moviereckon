/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb";
import { getUserFromRequest } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const { db } = await connectToDatabase();
      
      // Delete the specific refresh token
      await db.collection("refresh_tokens").deleteOne({ token: refreshToken });
    }

    // Optionally also clear all tokens for this user if they want to log out everywhere
    const user = await getUserFromRequest(req);
    if (user) {
      // Could optionally delete all refresh tokens for this user here
    }

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
