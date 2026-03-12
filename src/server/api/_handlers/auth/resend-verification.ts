/**
 * POST /api/auth/resend-verification
 * Re-issue an email verification link for an existing unverified local account.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import {
  buildEmailVerificationUrl,
  createEmailVerificationToken,
} from "../../lib/email-verification.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { consumeRateLimit, getClientIp } from "../../lib/rate-limit.js";
import { verifyCaptchaToken } from "../../lib/captcha.js";
import { emitSecurityEvent } from "../../lib/abuse-telemetry.js";
import { sanitizeEmailAddress, sanitizeSingleLineText } from "../../lib/input.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_SUCCESS_MESSAGE =
  "If an unverified account exists for that email, a new verification link has been sent.";

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
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    const clientIp = getClientIp(req);
    const ipRateLimit = await consumeRateLimit(`auth:resend-verification:ip:${clientIp}`, 8, 30 * 60 * 1000);
    const emailRateLimit = await consumeRateLimit(
      `auth:resend-verification:email:${email}`,
      5,
      30 * 60 * 1000,
    );

    if (!ipRateLimit.allowed || !emailRateLimit.allowed) {
      emitSecurityEvent({
        type: "rate_limit_blocked",
        outcome: "blocked",
        route: "auth_resend_verification",
        reason: "verification_resend_limit",
        req,
        metadata: {
          ip_source: ipRateLimit.source,
          email_source: emailRateLimit.source,
        },
      });
      const retryAfter = Math.max(ipRateLimit.retryAfterSeconds, emailRateLimit.retryAfterSeconds, 60);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many verification requests. Please try again later." });
    }

    const captchaResult = await verifyCaptchaToken(req, captchaToken, "login");
    if (!captchaResult.ok) {
      emitSecurityEvent({
        type: "captcha_failed",
        outcome: "blocked",
        route: "auth_resend_verification",
        reason: captchaResult.reason || "captcha_verification_failed",
        req,
        metadata: {
          captcha_error_codes: captchaResult.errorCodes,
          captcha_response_action: captchaResult.responseAction,
          captcha_response_hostname: captchaResult.responseHostname,
        },
      });
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
          email_verified: 1,
          email_verification_provider: 1,
        },
      },
    );

    if (!user || user.email_verified === true || typeof user.password_hash !== "string") {
      return res.status(200).json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    if (user.email_verification_provider === "firebase") {
      return res.status(400).json({
        error: "This account uses Firebase email verification. Sign in to resend the verification email.",
        code: "firebase_client_required",
      });
    }

    const { rawToken } = await createEmailVerificationToken(db, {
      userId: user._id.toString(),
      email,
    });
    const verificationUrl = buildEmailVerificationUrl(req, rawToken);

    let verificationPreviewUrl: string | null = null;

    try {
      const emailResult = await sendVerificationEmail({
        userId: user._id.toString(),
        toEmail: email,
        username: typeof user.username === "string" ? user.username : "there",
        verificationUrl,
      });
      verificationPreviewUrl = emailResult.previewUrl;
    } catch (verificationError) {
      console.error("Verification resend email error:", verificationError);
    }

    return res.status(200).json({
      message: GENERIC_SUCCESS_MESSAGE,
      verification_preview_url: verificationPreviewUrl,
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
