/**
 * DELETE /api/user/clear-history
 * Clear all user history data
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Authenticate user
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (
    await enforceRequestRateLimit({
      req,
      res,
      route: "user_clear_history",
      reason: "clear_history_limit",
      errorMessage: "Too many history reset requests. Please try again later.",
      minRetryAfterSeconds: 60,
      rules: [
        {
          key: `user:clear-history:user:${user.id}`,
          maxRequests: 6,
          windowMs: 60 * 60 * 1000,
          metadataKey: "user",
        },
      ],
    })
  ) {
    return;
  }

  const { db } = await connectToDatabase();

  try {
    // Delete all user data
    await Promise.all([
      db.collection("watch_history").deleteMany({ user_id: user.id }),
      db.collection("liked_items").deleteMany({ user_id: user.id }),
      db.collection("user_preferences").updateOne(
        { user_id: user.id },
        { $set: { preferred_languages: [], preferred_genres: [], updated_at: new Date().toISOString() } }
      ),
    ]);

    return res.status(200).json({ message: "History cleared successfully" });
  } catch (error) {
    console.error("Clear history error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
