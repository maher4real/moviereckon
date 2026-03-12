import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type VerificationEmailInput = {
  toEmail: string;
  username: string;
  verificationUrl: string;
};

type PasswordResetEmailInput = {
  toEmail: string;
  username: string;
  resetUrl: string;
};

type MailerConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo: string | null;
};

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedConfigKey: string | null = null;

function getTrimmedEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function getMailerConfig(): MailerConfig {
  const host = getTrimmedEnv("SMTP_HOST");
  const port = Number.parseInt(getTrimmedEnv("SMTP_PORT") || "587", 10);
  const user = getTrimmedEnv("SMTP_USER");
  const pass = getTrimmedEnv("SMTP_PASS");
  const fromEmail = getTrimmedEnv("SMTP_FROM_EMAIL");
  const fromName = getTrimmedEnv("SMTP_FROM_NAME") || "MovieReckon";
  const replyTo = getTrimmedEnv("SMTP_REPLY_TO_EMAIL") || null;
  const secure = getTrimmedEnv("SMTP_SECURE") === "true" || port === 465;

  if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass || !fromEmail) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL must be configured");
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: `${fromName} <${fromEmail}>`,
    replyTo,
  };
}

function getTransporter(): nodemailer.Transporter {
  const config = getMailerConfig();
  const configKey = JSON.stringify(config);

  if (!cachedTransporter || cachedConfigKey !== configKey) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
    cachedConfigKey = configKey;
  }

  return cachedTransporter;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailShell(title: string, body: string, actionLabel: string, actionUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#09090b;font-family:Arial,sans-serif;color:#f4f4f5;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="border:1px solid rgba(255,255,255,0.1);border-radius:24px;background:#111114;padding:32px;">
        <div style="font-size:28px;font-weight:700;letter-spacing:0.02em;margin-bottom:12px;color:#ffffff;">
          MovieReckon
        </div>
        <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px;color:#ffffff;">${title}</h1>
        <div style="font-size:15px;line-height:1.7;color:#d4d4d8;margin-bottom:24px;">
          ${body}
        </div>
        <a href="${actionUrl}" style="display:inline-block;padding:14px 20px;border-radius:14px;background:linear-gradient(90deg,#dc2626,#f97316);color:#ffffff;text-decoration:none;font-weight:700;">
          ${actionLabel}
        </a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;word-break:break-word;">
          If the button does not work, copy and paste this URL into your browser:<br />
          <a href="${actionUrl}" style="color:#fda4af;">${actionUrl}</a>
        </p>
      </div>
    </div>
  </body>
</html>`;
}

function renderVerificationEmail(input: VerificationEmailInput) {
  const safeUsername = escapeHtml(input.username || "there");
  const body = `
    <p style="margin:0 0 12px;">Hi ${safeUsername},</p>
    <p style="margin:0 0 12px;">Verify your email address to activate your MovieReckon account.</p>
    <p style="margin:0;">This link expires in 1 hour. If you did not create this account, you can ignore this email.</p>
  `;

  return {
    subject: "Verify your MovieReckon email",
    html: renderEmailShell("Verify your email", body, "Verify email", input.verificationUrl),
    text: [
      `Hi ${input.username || "there"},`,
      "",
      "Verify your email address to activate your MovieReckon account.",
      input.verificationUrl,
      "",
      "This link expires in 1 hour.",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
  };
}

function renderPasswordResetEmail(input: PasswordResetEmailInput) {
  const safeUsername = escapeHtml(input.username || "there");
  const body = `
    <p style="margin:0 0 12px;">Hi ${safeUsername},</p>
    <p style="margin:0 0 12px;">We received a request to reset your MovieReckon password.</p>
    <p style="margin:0;">This link expires in 1 hour. If you did not request a password reset, you can ignore this email.</p>
  `;

  return {
    subject: "Reset your MovieReckon password",
    html: renderEmailShell("Reset your password", body, "Reset password", input.resetUrl),
    text: [
      `Hi ${input.username || "there"},`,
      "",
      "We received a request to reset your MovieReckon password.",
      input.resetUrl,
      "",
      "This link expires in 1 hour.",
      "If you did not request a password reset, you can ignore this email.",
    ].join("\n"),
  };
}

async function sendEmail(input: SendEmailInput): Promise<void> {
  const transporter = getTransporter();
  const config = getMailerConfig();

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    replyTo: config.replyTo || undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
  const rendered = renderVerificationEmail(input);
  await sendEmail({
    to: input.toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const rendered = renderPasswordResetEmail(input);
  await sendEmail({
    to: input.toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
