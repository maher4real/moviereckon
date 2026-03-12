import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import { emitSecurityEvent } from "./abuse-telemetry.js";
import { consumeRateLimit } from "./rate-limit.js";

export type RequestRateLimitRule = {
  key: string;
  maxRequests: number;
  windowMs: number;
  metadataKey?: string;
};

type EnforceRequestRateLimitParams = {
  req: VercelRequest;
  res: VercelResponse;
  route: string;
  reason: string;
  errorMessage: string;
  rules: RequestRateLimitRule[];
  metadata?: Record<string, unknown>;
  minRetryAfterSeconds?: number;
  onBlocked?: (retryAfterSeconds: number) => void;
};

export function hashRateLimitValue(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 16);
}

export async function enforceRequestRateLimit(
  params: EnforceRequestRateLimitParams,
): Promise<boolean> {
  const results = await Promise.all(
    params.rules.map(async (rule) => ({
      rule,
      result: await consumeRateLimit(rule.key, rule.maxRequests, rule.windowMs),
    })),
  );

  const blocked = results.filter(({ result }) => !result.allowed);
  if (blocked.length === 0) {
    return false;
  }

  const metadata: Record<string, unknown> = {
    ...(params.metadata || {}),
    blocked_limits: blocked.map(({ rule }) => rule.metadataKey || "unknown"),
  };

  results.forEach(({ rule, result }, index) => {
    const sourceKey = `${rule.metadataKey || `limit_${index + 1}`}_source`;
    metadata[sourceKey] = result.source;
  });

  emitSecurityEvent({
    type: "rate_limit_blocked",
    outcome: "blocked",
    route: params.route,
    reason: params.reason,
    req: params.req,
    metadata,
  });

  const retryAfter = Math.max(
    params.minRetryAfterSeconds || 30,
    ...blocked.map(({ result }) => result.retryAfterSeconds),
  );
  params.res.setHeader("Retry-After", String(retryAfter));
  if (params.onBlocked) {
    params.onBlocked(retryAfter);
    return true;
  }
  params.res.status(429).json({ error: params.errorMessage });
  return true;
}
