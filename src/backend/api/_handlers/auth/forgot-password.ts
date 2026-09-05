import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase } from "../../lib/mongodb.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { verifyCaptchaToken } from "../../lib/captcha.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "../../lib/input.js";
import { buildPasswordResetUrl, createEmailToken } from "../../lib/email-auth.js";
import { sendPasswordResetEmail } from "../../lib/email.js";

const GENERIC_MESSAGE =
  "If an account exists for that email, we sent password reset instructions.";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getRetryAfterSeconds(email: string, clientIp: string) {
  const [ipLimit, emailLimit, cooldownLimit] = await Promise.all([
    consumeRateLimit(`auth:forgot-password:ip:${clientIp}`, 10, 60 * 60 * 1000),
    consumeRateLimit(`auth:forgot-password:email:${email || "missing"}`, 5, 60 * 60 * 1000),
    consumeRateLimit(`auth:forgot-password:cooldown:${email || "missing"}`, 1, 60 * 1000),
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

  try {
    const email = sanitizeEmailAddress(req.body?.email);
    const captchaToken =
      sanitizeSingleLineText(req.body?.captcha_token, 4096, {
        fallback: "",
        collapseWhitespace: false,
      }) || "";

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const clientIp = getClientIp(req);
    const retryAfterSeconds = await getRetryAfterSeconds(email, clientIp);
    if (retryAfterSeconds > 0) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Please wait before requesting another reset email." });
    }

    const captchaResult = await verifyCaptchaToken(req, captchaToken, "forgot-password");
    if (!captchaResult.ok) {
      return res.status(400).json({ error: captchaResult.error || "CAPTCHA verification failed" });
    }

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne(
      { email },
      {
        projection: {
          email: 1,
          username: 1,
          password_hash: 1,
        },
      },
    );

    if (user && typeof user.password_hash === "string") {
      const { rawToken, tokenHash, expiresAt } = createEmailToken("reset-password");
      const now = new Date().toISOString();
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetTokenHash: tokenHash,
            passwordResetTokenExpiresAt: expiresAt,
            updated_at: now,
          },
        },
      );

      try {
        await sendPasswordResetEmail({
          toEmail: user.email,
          username: user.username || "there",
          resetUrl: buildPasswordResetUrl(req, rawToken, user.email),
        });
      } catch (error) {
        console.error("Password reset email error:", error);
      }
    }

    return res.status(200).json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
