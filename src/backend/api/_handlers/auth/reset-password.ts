import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { clearAuthCookies } from "../../lib/cookies.js";
import { hashPassword } from "../../lib/auth.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "../../lib/input.js";
import {
  clearPasswordResetUpdate,
  emailTokenMatches,
  isEmailTokenExpired,
} from "../../lib/email-auth.js";
import { getPasswordValidationError } from "../../lib/password-policy.js";
import { enforceRequestRateLimit, hashRateLimitValue } from "../../lib/request-rate-limit.js";
import { getClientIp } from "../../lib/rate-limit.js";

const INVALID_LINK_ERROR = "Invalid or expired password reset link.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = sanitizeEmailAddress(req.body?.email);
    const token =
      sanitizeSingleLineText(req.body?.token, 512, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !token) {
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    const clientIp = getClientIp(req);
    if (
      await enforceRequestRateLimit({
        req,
        res,
        route: "auth_reset_password",
        reason: "reset_password_limit",
        errorMessage: "Please wait before trying that reset link again.",
        minRetryAfterSeconds: 60,
        rules: [
          {
            key: `auth:reset-password:ip:${clientIp}`,
            maxRequests: 10,
            windowMs: 60 * 60 * 1000,
            metadataKey: "ip",
          },
          {
            key: `auth:reset-password:email:${email}`,
            maxRequests: 5,
            windowMs: 60 * 60 * 1000,
            metadataKey: "email",
          },
          {
            key: `auth:reset-password:token:${hashRateLimitValue(token)}`,
            maxRequests: 8,
            windowMs: 60 * 60 * 1000,
            metadataKey: "token",
          },
        ],
      })
    ) {
      return;
    }

    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne(
      { email },
      {
        projection: {
          passwordResetTokenHash: 1,
          passwordResetTokenExpiresAt: 1,
        },
      },
    );

    if (!user) {
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    if (isEmailTokenExpired(user.passwordResetTokenExpiresAt)) {
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            ...clearPasswordResetUpdate(),
            updated_at: new Date().toISOString(),
          },
        },
      );
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    if (!emailTokenMatches(token, "reset-password", user.passwordResetTokenHash)) {
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          password_hash: passwordHash,
          ...clearPasswordResetUpdate(),
          updated_at: now,
        },
      },
    );
    await db.collection("refresh_tokens").deleteMany({ user_id: user._id.toString() });
    clearAuthCookies(res);

    return res.status(200).json({ message: "Password reset successfully. You can sign in now." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
