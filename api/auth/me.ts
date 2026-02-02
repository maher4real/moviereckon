/**
 * GET /api/auth/me
 * Get current authenticated user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserFromRequest, getUserById } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization as string | null;
    
    // Build a mock Request object for getUserFromRequest
    const mockRequest = {
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "authorization") return authHeader;
          return null;
        },
      },
    } as Request;

    const userPayload = await getUserFromRequest(mockRequest);
    if (!userPayload) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get full user data
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
