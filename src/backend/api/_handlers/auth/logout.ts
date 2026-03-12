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
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";
import { getClientIp } from "../../lib/rate-limit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await getUserFromRequest(req);
    const clientIp = getClientIp(req);
    const rules = [
      {
        key: `auth:logout:ip:${clientIp}`,
        maxRequests: 40,
        windowMs: 15 * 60 * 1000,
        metadataKey: "ip",
      },
    ];
    if (user?.id) {
      rules.push({
        key: `auth:logout:user:${user.id}`,
        maxRequests: 20,
        windowMs: 15 * 60 * 1000,
        metadataKey: "user",
      });
    }

    if (
      await enforceRequestRateLimit({
        req,
        res,
        route: "auth_logout",
        reason: "logout_limit",
        errorMessage: "Too many logout requests. Please try again later.",
        rules,
      })
    ) {
      return;
    }

    const cookieRefreshToken = getCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE_NAME) || "";
    const allDevices = req.body?.all_devices === true;
    const refreshToken = cookieRefreshToken;

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
