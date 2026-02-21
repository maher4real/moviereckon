/**
 * GET /api/auth/me
 * Get current authenticated user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserFromRequest, getUserById } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userPayload = await getUserFromRequest(req);
    
    if (!userPayload) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get full user from database
    const user = await getUserById(userPayload.id);
    
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
