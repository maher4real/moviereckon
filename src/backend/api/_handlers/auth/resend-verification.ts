import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase } from "../../lib/mongodb.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { sanitizeEmailAddress } from "../../lib/input.js";
import {
  buildEmailVerificationUrl,
  buildPendingVerificationUpdate,
  createEmailToken,
  isEmailVerificationDisabled,
  isUserEmailVerified,
} from "../../lib/email-auth.js";
import { sendVerificationEmail } from "../../lib/email.js";

const GENERIC_MESSAGE =
  "If the account exists and still needs verification, we sent a fresh verification email.";

async function getRetryAfterSeconds(email: string, clientIp: string) {
  const [ipLimit, emailLimit, cooldownLimit] = await Promise.all([
    consumeRateLimit(`auth:resend-verification:ip:${clientIp}`, 8, 60 * 60 * 1000),
    consumeRateLimit(`auth:resend-verification:email:${email || "missing"}`, 4, 60 * 60 * 1000),
    consumeRateLimit(`auth:resend-verification:cooldown:${email || "missing"}`, 1, 60 * 1000),
  ]);

  if (ipLimit.allowed && emailLimit.allowed && cooldownLimit.allowed) {
    return 0;
  }

  return Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds, cooldownLimit.retryAfterSeconds, 60);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isEmailVerificationDisabled()) {
    return res.status(200).json({
      message: "Email verification is currently disabled. You can sign in now.",
    });
  }

  try {
    const email = sanitizeEmailAddress(req.body?.email);
    const clientIp = getClientIp(req);
    const retryAfterSeconds = await getRetryAfterSeconds(email, clientIp);

    if (retryAfterSeconds > 0) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Please wait before requesting another verification email." });
    }

    if (!email) {
      return res.status(200).json({ message: GENERIC_MESSAGE });
    }

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne(
      { email },
      {
        projection: {
          email: 1,
          username: 1,
          password_hash: 1,
          emailVerified: 1,
          email_verified: 1,
        },
      },
    );

    if (!user || typeof user.password_hash !== "string" || isUserEmailVerified(user)) {
      return res.status(200).json({ message: GENERIC_MESSAGE });
    }

    const { rawToken, tokenHash, expiresAt } = createEmailToken("verify-email");
    const now = new Date().toISOString();
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          ...buildPendingVerificationUpdate(tokenHash, expiresAt),
          updated_at: now,
        },
      },
    );

    try {
      await sendVerificationEmail({
        toEmail: user.email,
        username: user.username || "there",
        verificationUrl: buildEmailVerificationUrl(req, rawToken, user.email),
      });
    } catch (error) {
      console.error("Resend verification email error:", error);
    }

    return res.status(200).json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Resend verification handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
