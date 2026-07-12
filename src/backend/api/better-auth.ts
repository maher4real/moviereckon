import type { NextApiRequest, NextApiResponse } from "next";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { toNodeHandler } from "better-auth/node";
import { connectToDatabase } from "./lib/mongodb.js";
import {
  sendPasswordResetEmail as sendPasswordResetTemplate,
  sendVerificationEmail as sendVerificationTemplate,
} from "./lib/email.js";
import { getConfiguredAuthBaseURL } from "./lib/auth-base-url.js";

type BetterAuthNodeRequest = Parameters<ReturnType<typeof toNodeHandler>>[0];
type BetterAuthNodeResponse = Parameters<ReturnType<typeof toNodeHandler>>[1];

let authInstancePromise: ReturnType<typeof createBetterAuthInstance> | null = null;

function parseBooleanEnv(value: string | undefined): boolean {
  return (value || "").toLowerCase() === "true";
}

function parseCommaSeparatedList(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getBaseURL() {
  return getConfiguredAuthBaseURL();
}

function getGoogleProviderConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  const googleProvider = {
    clientId,
    clientSecret,
  };

  const redirectURI = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (redirectURI && redirectURI.length > 0) {
    return {
      ...googleProvider,
      redirectURI,
    };
  }

  return googleProvider;
}

function assertSmtpConfigured(purpose: "verification" | "password-reset") {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL"];
  const missing = required.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `SMTP config missing for Better Auth ${purpose} email: ${missing.join(", ")}`,
    );
  }
}

async function createBetterAuthInstance() {
  const { db } = await connectToDatabase();
  const googleProvider = getGoogleProviderConfig();
  const requireEmailVerification = parseBooleanEnv(
    process.env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION || "false",
  );
  const trustedOrigins = parseCommaSeparatedList(
    process.env.BETTER_AUTH_TRUSTED_ORIGINS || process.env.CORS_ORIGIN,
  );

  return betterAuth({
        database: mongodbAdapter(db, {
          usePlural: true,
        }),
        user: {
          fields: {
            name: "username",
            image: "avatar_url",
            emailVerified: "email_verified",
            createdAt: "created_at",
            updatedAt: "updated_at",
          },
          additionalFields: {
            role: {
              type: "string",
              required: false,
              input: false,
              defaultValue: "user",
            },
          },
        },
        basePath: "/api/better-auth",
        baseURL: getBaseURL(),
        secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET,
        appName: "MovieReckon",
        ...(trustedOrigins.length > 0 ? { trustedOrigins } : {}),
        emailAndPassword: {
          enabled: true,
          requireEmailVerification,
          autoSignIn: true,
          sendResetPassword: async ({ user, url }) => {
            assertSmtpConfigured("password-reset");
            const username =
              typeof user.name === "string" && user.name.length > 0
                ? user.name
                : user.email.split("@")[0] || "there";
            await sendPasswordResetTemplate({
              toEmail: user.email,
              username,
              resetUrl: url,
            });
          },
        },
        emailVerification: {
          autoSignInAfterVerification: false,
          sendVerificationEmail: async ({ user, url }) => {
            assertSmtpConfigured("verification");
            const username =
              typeof user.name === "string" && user.name.length > 0
                ? user.name
                : user.email.split("@")[0] || "there";
            await sendVerificationTemplate({
              toEmail: user.email,
              username,
              verificationUrl: url,
            });
          },
        },
        ...(googleProvider ? { socialProviders: { google: googleProvider } } : {}),
  });
}

async function getBetterAuthInstance() {
  if (!authInstancePromise) {
    authInstancePromise = createBetterAuthInstance();
  }

  return authInstancePromise;
}

export async function getBetterAuthNodeHandler() {
  const auth = await getBetterAuthInstance();
  return toNodeHandler(auth);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const nodeHandler = await getBetterAuthNodeHandler();
  return nodeHandler(
    req as BetterAuthNodeRequest,
    res as BetterAuthNodeResponse,
  );
}
