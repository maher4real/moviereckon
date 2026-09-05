/**
 * Auth Router - Consolidated serverless function
 * Routes: /api/auth/login, /api/auth/register, /api/auth/refresh, /api/auth/me,
 * /api/auth/logout, /api/auth/availability, /api/auth/google-start, /api/auth/google-callback,
 * /api/auth/google-one-tap,
 * /api/auth/verify-email, /api/auth/resend-verification, /api/auth/forgot-password,
 * /api/auth/reset-password
 */
import type { VercelRequest, VercelResponse } from "./lib/http";
import { installGlobalSafeLogging } from "@/shared/lib/safeLogging";
import availabilityHandler from "./_handlers/auth/availability.js";
import loginHandler from "./_handlers/auth/login.js";
import registerHandler from "./_handlers/auth/register.js";
import refreshHandler from "./_handlers/auth/refresh.js";
import meHandler from "./_handlers/auth/me.js";
import logoutHandler from "./_handlers/auth/logout.js";
import googleStartHandler from "./_handlers/auth/google-start.js";
import googleCallbackHandler from "./_handlers/auth/google-callback.js";
import googleOneTapHandler from "./_handlers/auth/google-one-tap.js";
import verifyEmailHandler from "./_handlers/auth/verify-email.js";
import resendVerificationHandler from "./_handlers/auth/resend-verification.js";
import forgotPasswordHandler from "./_handlers/auth/forgot-password.js";
import resetPasswordHandler from "./_handlers/auth/reset-password.js";
import {
  applyApiCors,
  applyDefaultSecurityHeaders,
  applyNoStoreHeaders,
  hasAjaxHeader,
  isStateChangingMethod,
  isTrustedRequestOrigin,
} from "./lib/cors.js";
import { emitSecurityEvent } from "./lib/abuse-telemetry.js";
import { consumeRateLimit, getClientIp, RateLimitUnavailableError } from "./lib/rate-limit.js";
import { normalizeUserRole } from "./lib/auth.js";
import { getConfiguredAuthBaseURL } from "./lib/auth-base-url.js";
import {
  enforceLoginForwardingPolicy,
  enforceRegistrationForwardingPolicy,
} from "./lib/auth-forwarding-policy.js";

installGlobalSafeLogging();

function getSingleHeader(
  headers: VercelRequest["headers"],
  name: string,
): string | null {
  const normalized = headers as Record<string, string | string[] | undefined>;
  const raw = normalized[name] ?? normalized[name.toLowerCase()] ?? normalized[name.toUpperCase()];
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw;
}

function createForwardHeaders(req: VercelRequest): Headers {
  const headers = new Headers();

  const userAgent = getSingleHeader(req.headers, "user-agent");
  if (userAgent) headers.set("user-agent", userAgent);

  const accept = getSingleHeader(req.headers, "accept");
  if (accept) headers.set("accept", accept);

  const contentType = getSingleHeader(req.headers, "content-type");
  if (contentType) headers.set("content-type", contentType);

  const xRequestedWith = getSingleHeader(req.headers, "x-requested-with");
  if (xRequestedWith) headers.set("x-requested-with", xRequestedWith);

  const referer = getSingleHeader(req.headers, "referer");
  if (referer) headers.set("referer", referer);

  const authorization = getSingleHeader(req.headers, "authorization");
  if (authorization) headers.set("authorization", authorization);

  const cookie = getSingleHeader(req.headers, "cookie");
  if (cookie) headers.set("cookie", cookie);

  headers.set("origin", getConfiguredAuthBaseURL());

  return headers;
}

async function callBetterAuth(
  req: VercelRequest,
  route: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
) {
  const method = options.method || "POST";
  const headers = createForwardHeaders(req);
  const endpoint = new URL(`${getConfiguredAuthBaseURL()}/api/better-auth${route}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value == null) continue;
      endpoint.searchParams.set(key, value);
    }
  }

  const hasBody = method === "POST" && options.body !== undefined;
  if (hasBody) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(endpoint.toString(), {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    redirect: "manual",
  });

  const responseText = await response.text();
  let payload: unknown = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { raw: responseText };
  }

  const setCookieHeaderProvider =
    response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookieValues =
    (typeof setCookieHeaderProvider.getSetCookie === "function"
      ? setCookieHeaderProvider.getSetCookie()
      : []) || [];

  const singleSetCookie = response.headers.get("set-cookie");
  const effectiveSetCookies =
    setCookieValues.length > 0
      ? setCookieValues
      : singleSetCookie
        ? [singleSetCookie]
        : [];

  return {
    ok: response.ok,
    status: response.status,
    payload,
    response,
    setCookies: effectiveSetCookies,
  };
}

function betterAuthError(payload: unknown, fallback = "Authentication failed"): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const messageContainer = payload as Record<string, unknown>;

    if (typeof messageContainer.error === "string") {
      return messageContainer.error;
    }

    if (
      messageContainer.error &&
      typeof messageContainer.error === "object" &&
      "message" in messageContainer.error &&
      typeof (messageContainer.error as Record<string, unknown>).message === "string"
    ) {
      return String((messageContainer.error as Record<string, unknown>).message);
    }

    if (typeof messageContainer.message === "string") {
      return messageContainer.message;
    }
  }

  return fallback;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeBetterAuthUser(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const u = payload as Record<string, unknown>;
  const additionalFields =
    u.additionalFields && typeof u.additionalFields === "object"
      ? (u.additionalFields as Record<string, unknown>)
      : null;

  const id =
    typeof u.id === "string"
      ? u.id
      : typeof u._id === "string"
        ? u._id
        : "";
  const email = typeof u.email === "string" ? u.email : "";
  const username =
    typeof u.username === "string"
      ? u.username
      : typeof u.name === "string"
        ? u.name
        : "";

  if (!id || !email || !username) {
    return null;
  }

  const rawRole =
    typeof u.role === "string"
      ? u.role
      : typeof additionalFields?.role === "string"
        ? additionalFields.role
        : "user";

  return {
    id,
    email,
    username,
    role: normalizeUserRole(rawRole),
    avatar_url:
      typeof u.avatar_url === "string"
        ? u.avatar_url
        : typeof u.image === "string"
          ? u.image
          : null,
    created_at: normalizeDate(u.created_at) || normalizeDate(u.createdAt),
    updated_at: normalizeDate(u.updated_at) || normalizeDate(u.updatedAt),
    emailVerified:
      typeof u.email_verified === "boolean"
        ? u.email_verified
        : typeof u.emailVerified === "boolean"
          ? u.emailVerified
          : false,
  };
}

function mapUserBody(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const user = normalizeBetterAuthUser((payload as Record<string, unknown>).user);
  if (!user) return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      updated_at: user.updated_at,
      emailVerified: user.emailVerified,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyDefaultSecurityHeaders(res);
  const { originAllowed } = applyApiCors(req, res);

  if (req.method === "OPTIONS") {
    if (!originAllowed) {
      emitSecurityEvent({
        type: "cors_origin_blocked",
        outcome: "blocked",
        route: "auth_router",
        reason: "preflight_origin_not_allowed",
        req,
      });
      return res.status(403).json({ error: "Origin not allowed" });
    }
    return res.status(204).end();
  }

  if (!originAllowed) {
    emitSecurityEvent({
      type: "cors_origin_blocked",
      outcome: "blocked",
      route: "auth_router",
      reason: "origin_not_allowed",
      req,
    });
    return res.status(403).json({ error: "Origin not allowed" });
  }

  applyNoStoreHeaders(res);

  const method = (req.method || "GET").toUpperCase();
  const routeRateLimit = await consumeRateLimit(
    `auth:router:${getClientIp(req)}:${method}`,
    isStateChangingMethod(method) ? 160 : 420,
    5 * 60 * 1000,
  );
  if (!routeRateLimit.allowed) {
    emitSecurityEvent({
      type: "rate_limit_blocked",
      outcome: "blocked",
      route: "auth_router",
      reason: "router_limit",
      req,
      metadata: { source: routeRateLimit.source },
    });
    const retryAfter = Math.max(routeRateLimit.retryAfterSeconds, 30);
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(429)
      .json({ error: "Too many auth requests. Please try again shortly." });
  }

  if (isStateChangingMethod(method)) {
    if (
      !isTrustedRequestOrigin(req, {
        allowRefererFallback: true,
        allowMissingOriginForSafeMethods: false,
      })
    ) {
      emitSecurityEvent({
        type: "csrf_origin_blocked",
        outcome: "blocked",
        route: "auth_router",
        reason: "untrusted_origin",
        req,
      });
      return res.status(403).json({ error: "Invalid request origin" });
    }

    if (!hasAjaxHeader(req)) {
      emitSecurityEvent({
        type: "csrf_header_missing",
        outcome: "blocked",
        route: "auth_router",
        reason: "missing_x_requested_with",
        req,
      });
      return res.status(403).json({ error: "Missing required request header" });
    }
  }

  // Parse the route from the URL
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const routeFromQuery = url.searchParams.get("route") || "";
  const routeFromPath = pathParts[2] || "";
  const route = routeFromQuery || routeFromPath;

  const forwardAndReturnCookies = (responseResult: Awaited<ReturnType<typeof callBetterAuth>>) => {
    if (responseResult.setCookies.length > 0) {
      res.setHeader("Set-Cookie", responseResult.setCookies);
    }
  };

  const fallbackLegacyAuth = async () => {
    switch (route) {
      case "login":
        return loginHandler(req, res);
      case "register":
        return registerHandler(req, res);
      case "refresh":
        return refreshHandler(req, res);
      case "me":
        return meHandler(req, res);
      case "logout":
        return logoutHandler(req, res);
      case "verify-email":
        return verifyEmailHandler(req, res);
      case "resend-verification":
        return resendVerificationHandler(req, res);
      case "forgot-password":
        return forgotPasswordHandler(req, res);
      case "reset-password":
        return resetPasswordHandler(req, res);
      default:
        return null;
    }
  };

  try {
    switch (route) {
      case "availability":
        return availabilityHandler(req, res);
      case "login": {
        try {
          const validated = await enforceLoginForwardingPolicy(req, res);
          if (!validated) return;
          const result = await callBetterAuth(req, "/sign-in/email", {
            method: "POST",
            body: validated,
          });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return res
              .status(result.status)
              .json({ error: betterAuthError(result.payload) });
          }

          const userPayload = mapUserBody(result.payload);
          if (!userPayload) {
            return res.status(500).json({ error: "Invalid authentication response" });
          }

          return res.status(200).json({
            ...userPayload,
            session: "cookie",
          });
        } catch {
          return fallbackLegacyAuth();
        }
      }
      case "register": {
        try {
          const validated = await enforceRegistrationForwardingPolicy(req, res);
          if (!validated) return;
          const result = await callBetterAuth(req, "/sign-up/email", {
            method: "POST",
            body: {
              email: validated.email,
              password: validated.password,
              name: validated.username,
            },
          });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return res
              .status(result.status)
              .json({ error: betterAuthError(result.payload) });
          }

          const userPayload = mapUserBody(result.payload);
          if (!userPayload) {
            return res.status(500).json({ error: "Invalid authentication response" });
          }

          const requiresEmailVerification = userPayload.user.emailVerified !== true;

          return res.status(201).json({
            ...(result.payload as Record<string, unknown>),
            ...(userPayload),
            requires_email_verification: requiresEmailVerification,
            message: requiresEmailVerification
              ? "Account created. Check your email to verify your address before signing in."
              : "Account created successfully.",
          });
        } catch {
          return fallbackLegacyAuth();
        }
      }
      case "refresh": {
        try {
          const result = await callBetterAuth(req, "/get-session", { method: "GET" });
          forwardAndReturnCookies(result);

          const session =
            result.ok && result.payload && typeof result.payload === "object"
              ? (result.payload as Record<string, unknown>).user
              : null;

          if (!result.ok || !session) {
            return fallbackLegacyAuth();
          }

          const userPayload = mapUserBody({ user: session });
          if (!userPayload) {
            return fallbackLegacyAuth();
          }

          return res.status(200).json({
            ...userPayload,
            session: "cookie",
          });
        } catch {
          return fallbackLegacyAuth();
        }
      }
      case "me": {
        try {
          const result = await callBetterAuth(req, "/get-session", { method: "GET" });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return meHandler(req, res);
          }

          const session =
            result.payload && typeof result.payload === "object"
              ? (result.payload as Record<string, unknown>).user
              : null;
          const userPayload = mapUserBody({ user: session });
          if (!userPayload) {
            return meHandler(req, res);
          }

          return res.status(200).json(userPayload);
        } catch {
          return meHandler(req, res);
        }
      }
      case "logout": {
        try {
          const result = await callBetterAuth(req, "/sign-out", {
            method: "POST",
          });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return fallbackLegacyAuth();
          }

          return res.status(200).json({ message: "Logged out successfully" });
        } catch {
          return logoutHandler(req, res);
        }
      }
      case "google-start":
        return googleStartHandler(req, res);
      case "google-callback":
        return googleCallbackHandler(req, res);
      case "google-one-tap":
        return googleOneTapHandler(req, res);
      case "verify-email": {
        const token =
          typeof req.body?.token === "string" ? req.body.token : "";

        if (!token) {
          return res.status(400).json({ error: "Invalid or expired verification link." });
        }

        try {
          const result = await callBetterAuth(req, "/verify-email", {
            method: "GET",
            query: { token },
          });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return res.status(400).json({
              error: betterAuthError(result.payload),
            });
          }

          return res.status(200).json({
            message: "Email verified successfully.",
            alreadyVerified: false,
          });
        } catch {
          return fallbackLegacyAuth();
        }
      }
      case "resend-verification": {
        const email =
          typeof req.body?.email === "string" ? req.body.email : "";
        try {
          const result = await callBetterAuth(req, "/send-verification-email", {
            method: "POST",
            body: { email },
          });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return res
              .status(result.status)
              .json({ error: betterAuthError(result.payload) });
          }

          return res.status(200).json({
            message:
              "If the account exists and still needs verification, we sent a fresh verification email.",
          });
        } catch {
          return resendVerificationHandler(req, res);
        }
      }
      case "forgot-password": {
        const email =
          typeof req.body?.email === "string" ? req.body.email : "";
        try {
          const result = await callBetterAuth(req, "/request-password-reset", {
            method: "POST",
            body: { email },
          });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return res
              .status(result.status)
              .json({ error: betterAuthError(result.payload) });
          }

          return res.status(200).json({
            message: "If an account exists for that email, we sent password reset instructions.",
          });
        } catch {
          return forgotPasswordHandler(req, res);
        }
      }
      case "reset-password": {
        try {
          const token =
            typeof req.body?.token === "string" ? req.body.token : "";
          const password =
            typeof req.body?.password === "string" ? req.body.password : "";
          const email =
            typeof req.body?.email === "string" ? req.body.email : "";

          const result = await callBetterAuth(req, "/reset-password", {
            method: "POST",
            body: {
              token,
              password,
              newPassword: password,
              email,
            },
          });
          forwardAndReturnCookies(result);

          if (!result.ok) {
            return res
              .status(result.status)
              .json({ error: betterAuthError(result.payload) });
          }

          return res.status(200).json({
            message: "Password reset successfully. You can sign in now.",
          });
        } catch {
          return resetPasswordHandler(req, res);
        }
      }
      default:
        return res.status(404).json({ error: `Auth route not found: ${route}` });
    }
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) throw error;
    console.error("Auth router error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
