/**
 * GET /api/auth/verify-email
 * Verify email token and activate account.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { consumeEmailVerificationToken } from "../../lib/email-verification.js";
import { getRequestOrigin } from "../../lib/google-oauth.js";

function redirect(res: VercelResponse, location: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  return res.status(302).end();
}

function getAuthRedirectUrl(req: VercelRequest, query: string): string {
  const explicitBase = process.env.EMAIL_VERIFICATION_REDIRECT_BASE_URL;
  const base =
    typeof explicitBase === "string" && explicitBase.trim().length > 0
      ? explicitBase.trim().replace(/\/$/, "")
      : getRequestOrigin(req) || "";

  if (base) {
    return `${base}/auth?${query}`;
  }

  return `/auth?${query}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const token = url.searchParams.get("token") || "";
    const { db } = await connectToDatabase();
    const { userId, errorCode } = await consumeEmailVerificationToken(db, token);

    if (!userId || errorCode) {
      return redirect(res, getAuthRedirectUrl(req, `verify_error=${encodeURIComponent(errorCode || "invalid_token")}`));
    }

    const now = new Date().toISOString();
    const userUpdate = await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          email_verified: true,
          email_verified_at: now,
          updated_at: now,
        },
      },
    );

    if (userUpdate.matchedCount !== 1) {
      return redirect(res, getAuthRedirectUrl(req, "verify_error=user_not_found"));
    }

    await db.collection("email_verification_tokens").deleteMany({
      user_id: userId,
      used_at: null,
    });

    return redirect(res, getAuthRedirectUrl(req, "email_verified=1"));
  } catch (error) {
    console.error("Email verification error:", error);
    return redirect(res, getAuthRedirectUrl(req, "verify_error=server_error"));
  }
}
