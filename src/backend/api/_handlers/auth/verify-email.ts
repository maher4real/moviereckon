import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "../../lib/input.js";
import {
  buildVerifiedEmailUpdate,
  emailTokenMatches,
  isEmailTokenExpired,
  isUserEmailVerified,
} from "../../lib/email-auth.js";

const INVALID_LINK_ERROR = "Invalid or expired verification link.";

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

    if (!email || !token) {
      return res.status(400).json({ error: INVALID_LINK_ERROR });
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
            verificationTokenHash: null,
            verificationTokenExpiresAt: null,
            updated_at: new Date().toISOString(),
          },
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
      },
    );

    return res.status(200).json({ message: "Email verified successfully." });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
