/**
 * GET /api/user/export and DELETE /api/user/account
 *
 * Both operations are deliberately self-scoped from the authenticated user;
 * neither accepts a user id from the request body or query string.
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { clearAuthCookies } from "../../lib/cookies.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";
import {
  AccountDeletedError,
  AccountDeletionInProgressError,
} from "@/backend/services/accountLifecycle";
import { deleteUserAccount, exportUserData } from "@/backend/services/userPrivacy";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const limit = method === "DELETE"
    ? { maxRequests: 2, windowMs: 24 * 60 * 60 * 1000 }
    : { maxRequests: 6, windowMs: 15 * 60 * 1000 };
  if (
    await enforceRequestRateLimit({
      req,
      res,
      route: method === "DELETE" ? "user_account_delete" : "user_data_export",
      reason: method === "DELETE" ? "account_delete_limit" : "data_export_limit",
      errorMessage: "Too many privacy requests. Please try again later.",
      minRetryAfterSeconds: 60,
      rules: [
        {
          key: `user:${method === "DELETE" ? "account-delete" : "data-export"}:${user.id}`,
          maxRequests: limit.maxRequests,
          windowMs: limit.windowMs,
          metadataKey: "user",
        },
      ],
    })
  ) {
    return;
  }

  try {
    const { db } = await connectToDatabase();
    if (method === "GET") {
      const data = await exportUserData(db, user.id);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="moviereckon-data-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      return res.status(200).json({ data });
    }

    const result = await deleteUserAccount(db, user.id);
    // Expire all auth cookies only after the tombstone and owned data have
    // been persisted. A failed deletion remains retryable while deleting.
    clearAuthCookies(res);
    return res.status(200).json({ data: result });
  } catch (error) {
    if (error instanceof AccountDeletionInProgressError) {
      return res.status(409).json({ error: error.message, code: error.code });
    }
    if (error instanceof AccountDeletedError) {
      return res.status(410).json({ error: error.message, code: error.code });
    }
    console.error("Privacy request error:", error);
    return res.status(500).json({ error: "Unable to complete privacy request" });
  }
}
