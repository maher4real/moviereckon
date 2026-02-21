/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb";
import { getUserFromRequest, hashRefreshToken } from "../../lib/auth";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  clearAuthCookies,
  getCookieValue,
} from "../../lib/cookies";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bodyRefreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    const cookieRefreshToken = getCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE_NAME) || "";
    const refreshToken = bodyRefreshToken || cookieRefreshToken;

    if (refreshToken) {
      const { db } = await connectToDatabase();

      // Delete the specific refresh token hash
      await db.collection("refresh_tokens").deleteOne({ token_hash: hashRefreshToken(refreshToken) });

      // Legacy fallback (disabled for security):
      // await db.collection("refresh_tokens").deleteOne({ token: refreshToken });
    }

    clearAuthCookies(res);

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
