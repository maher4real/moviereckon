type SendVerificationEmailInput = {
  toEmail: string;
  username: string;
  verificationUrl: string;
};

export type SendVerificationEmailResult = {
  sent: boolean;
  previewUrl: string | null;
};

function getResendConfig() {
  const apiKey = typeof process.env.RESEND_API_KEY === "string" ? process.env.RESEND_API_KEY.trim() : "";
  const fromEmail = typeof process.env.RESEND_FROM_EMAIL === "string" ? process.env.RESEND_FROM_EMAIL.trim() : "";
  const fromName =
    typeof process.env.RESEND_FROM_NAME === "string" && process.env.RESEND_FROM_NAME.trim().length > 0
      ? process.env.RESEND_FROM_NAME.trim()
      : "MovieReckon";

  return { apiKey, fromEmail, fromName };
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = (await response.json()) as Record<string, unknown>;
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

export async function sendVerificationEmail(
  input: SendVerificationEmailInput,
): Promise<SendVerificationEmailResult> {
  const { apiKey, fromEmail, fromName } = getResendConfig();
  const subject = "Verify your MovieReckon email";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin-bottom: 12px;">Verify your email address</h2>
      <p style="margin: 0 0 12px 0;">Hi ${input.username || "there"},</p>
      <p style="margin: 0 0 12px 0;">
        Please verify your MovieReckon account email by clicking the button below.
      </p>
      <p style="margin: 20px 0;">
        <a href="${input.verificationUrl}" style="background: #ef4444; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Verify Email
        </a>
      </p>
      <p style="margin: 0 0 8px 0; color: #4b5563;">
        If the button does not work, copy and paste this link:
      </p>
      <p style="margin: 0; word-break: break-all;">
        <a href="${input.verificationUrl}">${input.verificationUrl}</a>
      </p>
      <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">
        This verification link expires in 24 hours.
      </p>
    </div>
  `;

  if (!apiKey || !fromEmail) {
    if (isProductionEnv()) {
      throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured in production");
    }

    // Local development fallback: log the link instead of hard failing.
    console.info(`[email-dev] Verify ${input.toEmail}: ${input.verificationUrl}`);
    return { sent: false, previewUrl: input.verificationUrl };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [input.toEmail],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorPayload = await parseJsonSafe(response);
    console.error("Resend email error:", errorPayload);
    throw new Error("Failed to send verification email");
  }

  return { sent: true, previewUrl: null };
}
