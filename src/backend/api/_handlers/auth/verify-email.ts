import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase } from "../../lib/mongodb.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "../../lib/input.js";
import {
  buildVerifiedEmailUpdate,
  buildVerificationTokenUnset,
  emailTokenMatches,
  isEmailVerificationDisabled,
  isEmailTokenExpired,
  isUserEmailVerified,
} from "../../lib/email-auth.js";
import { enforceRequestRateLimit, hashRateLimitValue } from "../../lib/request-rate-limit.js";
import { getClientIp } from "../../lib/rate-limit.js";

const INVALID_LINK_ERROR = "Invalid or expired verification link.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isEmailVerificationDisabled()) {
    return res.status(200).json({
      message: "Email verification is currently disabled. You can sign in now.",
      alreadyVerified: true,
    });
  }

  try {
    const email = sanitizeEmailAddress(req.body?.email);
    const token =
      sanitizeSingleLineText(req.body?.token, 512, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";

    if (!email || !token) {
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    const clientIp = getClientIp(req);
    if (
      await enforceRequestRateLimit({
        req,
        res,
        route: "auth_verify_email",
        reason: "verify_email_limit",
        errorMessage: "Please wait before trying that verification link again.",
        minRetryAfterSeconds: 60,
        rules: [
          {
            key: `auth:verify-email:ip:${clientIp}`,
            maxRequests: 20,
            windowMs: 60 * 60 * 1000,
            metadataKey: "ip",
          },
          {
            key: `auth:verify-email:email:${email}`,
            maxRequests: 8,
            windowMs: 60 * 60 * 1000,
            metadataKey: "email",
          },
          {
            key: `auth:verify-email:token:${hashRateLimitValue(token)}`,
            maxRequests: 10,
            windowMs: 60 * 60 * 1000,
            metadataKey: "token",
          },
        ],
      })
    ) {
      return;
    }

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne(
      { email },
      {
        projection: {
          emailVerified: 1,
          email_verified: 1,
          verificationTokenHash: 1,
          verificationTokenExpiresAt: 1,
        },
      },
    );

    if (!user) {
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    if (isUserEmailVerified(user)) {
      return res.status(200).json({
        message: "Email already verified. You can sign in now.",
        alreadyVerified: true,
      });
    }

    if (isEmailTokenExpired(user.verificationTokenExpiresAt)) {
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            updated_at: new Date().toISOString(),
          },
          $unset: buildVerificationTokenUnset(),
        },
      );
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    if (!emailTokenMatches(token, "verify-email", user.verificationTokenHash)) {
      return res.status(400).json({ error: INVALID_LINK_ERROR });
    }

    const now = new Date().toISOString();
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          ...buildVerifiedEmailUpdate(now),
          updated_at: now,
        },
        $unset: buildVerificationTokenUnset(),
      },
    );

    return res.status(200).json({ message: "Email verified successfully." });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
