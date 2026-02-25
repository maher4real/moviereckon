/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest, hashRefreshToken } from "../../lib/auth.js";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  clearAuthCookies,
  getCookieValue,
} from "../../lib/cookies.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await getUserFromRequest(req);
    const bodyRefreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    const cookieRefreshToken = getCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE_NAME) || "";
    const allDevices = req.body?.all_devices === true;
    const refreshToken = bodyRefreshToken || cookieRefreshToken;

    if (refreshToken) {
      const { db } = await connectToDatabase();

      // Delete the specific refresh token hash
      await db.collection("refresh_tokens").deleteOne(
        user
          ? { user_id: user.id, token_hash: hashRefreshToken(refreshToken) }
          : { token_hash: hashRefreshToken(refreshToken) },
      );

      // Legacy fallback (disabled for security):
      // await db.collection("refresh_tokens").deleteOne({ token: refreshToken });

      if (allDevices && user) {
        await db.collection("refresh_tokens").deleteMany({ user_id: user.id });
      }
    }

    if (allDevices && user && !refreshToken) {
      const { db } = await connectToDatabase();
      await db.collection("refresh_tokens").deleteMany({ user_id: user.id });
    }

    clearAuthCookies(res);

    if (allDevices && !user) {
      return res.status(401).json({ error: "Authentication required for all-device logout" });
    }

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
