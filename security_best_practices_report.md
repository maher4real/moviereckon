# Security Best Practices Report

## Executive Summary
The codebase has multiple high-impact auth/security issues: a fail-open JWT secret fallback, browser-stored auth tokens, plaintext refresh token persistence, and permissive CORS defaults. These can lead to account takeover if an attacker gets script execution in the browser, exploits deployment misconfiguration, or obtains database contents.

## Critical Findings

### [SEC-001] Fail-open JWT secret fallback
- Severity: Critical
- Location: `api/lib/auth.ts:8`
- Evidence:
  - `const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";`
- Impact:
  - If `JWT_SECRET` is unset/misconfigured in any environment, tokens are signed with a predictable static secret. Attackers can forge valid access/refresh JWTs and impersonate any user.
- Fix:
  - Remove fallback entirely; fail startup when `JWT_SECRET` is missing.
  - Enforce minimum secret entropy/length and rotation policy.
- Mitigation:
  - Add startup health check that validates required secrets before serving traffic.

## High Findings

### [SEC-002] Access + refresh tokens stored in `localStorage`
- Severity: High
- Location:
  - `src/lib/mongodbClient.ts:33`
  - `src/lib/mongodbClient.ts:75`
  - `src/lib/mongodbClient.ts:76`
  - `src/lib/mongodbClient.ts:77`
  - `src/lib/mongodbClient.ts:68`
  - `src/lib/mongodbClient.ts:72`
  - `src/integrations/supabase/client.ts:13`
  - `src/lib/backendClient.ts:16`
- Evidence:
  - Tokens are read/written directly from browser storage.
- Impact:
  - Any XSS in the app or a malicious extension can exfiltrate tokens and hijack sessions.
- Fix:
  - Move auth sessions to `HttpOnly` cookies with `Secure`/`SameSite`.
  - Keep refresh token server-managed and inaccessible to JavaScript.
- Mitigation:
  - Tight CSP + strict input/output handling to reduce XSS probability while migrating.

### [SEC-003] Refresh tokens stored in plaintext in database
- Severity: High
- Location:
  - `api/_handlers/auth/login.ts:45`
  - `api/_handlers/auth/register.ts:68`
  - `api/_handlers/auth/refresh.ts:63`
  - `api/_handlers/auth/logout.ts:21`
- Evidence:
  - Raw refresh token values are inserted and queried/deleted directly.
- Impact:
  - Database compromise immediately grants reusable live sessions (until expiry/revocation).
- Fix:
  - Store only a hash of refresh tokens (e.g., SHA-256/HMAC digest) and compare hashed values.
  - Add token family/reuse detection for replay prevention.
- Mitigation:
  - Reduce refresh TTL, rotate frequently, and track token metadata (`jti`, device, IP heuristics).

### [SEC-004] Over-permissive and inconsistent CORS defaults
- Severity: High
- Location:
  - `api/auth.ts:14`
  - `api/auth.ts:17`
  - `api/user.ts:17`
  - `api/user.ts:20`
- Evidence:
  - `Access-Control-Allow-Origin` defaults to `*` and `Access-Control-Allow-Credentials` is set to `true`.
- Impact:
  - CORS policy is overly broad by default and semantically inconsistent (`*` + credentials). This weakens cross-origin boundaries and creates brittle browser behavior.
- Fix:
  - Require explicit allowed origin(s), remove wildcard fallback, and only set `Allow-Credentials` when needed.
  - Validate incoming `Origin` against an allowlist.
- Mitigation:
  - Deny by default in production if `CORS_ORIGIN` is missing.

## Medium Findings

### [SEC-005] No brute-force/rate-limit controls on auth endpoints
- Severity: Medium
- Location:
  - `api/_handlers/auth/login.ts:9`
  - `api/_handlers/auth/register.ts:9`
- Evidence:
  - Login/register handlers process requests without throttling, lockout, or abuse controls.
- Impact:
  - Increases exposure to credential stuffing and automated guessing attacks.
- Fix:
  - Add IP/user-based rate limiting and temporary lockouts for repeated failures.
  - Add monitoring/alerts for auth abuse patterns.

### [SEC-006] Weak password policy baseline
- Severity: Medium
- Location: `api/_handlers/auth/register.ts:21`
- Evidence:
  - Minimum password length is 6.
- Impact:
  - Allows weak passwords that are easier to brute-force.
- Fix:
  - Increase minimum length (e.g., 10-12+), encourage passphrases, and optionally check against breached-password lists.

### [SEC-007] Health endpoint leaks internal error messages
- Severity: Medium
- Location: `api/health.ts:40`
- Evidence:
  - Response returns raw `error.message` from backend failures.
- Impact:
  - Can expose internals (connection/auth/config details) useful for reconnaissance.
- Fix:
  - Return generic error text to clients; keep detailed errors in server logs only.

### [SEC-008] TMDB proxy is broadly callable with unvalidated endpoint path
- Severity: Medium
- Location:
  - `supabase/functions/tmdb-proxy/index.ts:3`
  - `supabase/functions/tmdb-proxy/index.ts:4`
  - `supabase/functions/tmdb-proxy/index.ts:26`
  - `supabase/functions/tmdb-proxy/index.ts:38`
- Evidence:
  - CORS allows all origins and request body controls `endpoint` directly.
- Impact:
  - Increases risk of API-key quota abuse and unintended TMDB endpoint access through your proxy.
- Fix:
  - Enforce endpoint allowlist + method checks and add per-client rate limits.
  - Restrict caller auth if this is not intended to be fully public.

## Low Findings

### [SEC-009] Potentially dangerous insecure TLS switch for MongoDB
- Severity: Low
- Location:
  - `api/lib/mongodb.ts:11`
  - `api/lib/mongodb.ts:52`
  - `api/lib/mongodb.ts:55`
- Evidence:
  - `MONGODB_TLS_INSECURE=true` enables invalid cert acceptance.
- Impact:
  - If enabled in non-dev environments, increases MITM risk.
- Fix:
  - Hard-block this flag outside development and emit startup error if enabled in production.

### [SEC-010] Security headers not visible in app config
- Severity: Low
- Location:
  - `vercel.json:1`
  - `index.html:1`
- Evidence:
  - No explicit CSP, frame-ancestors/X-Frame-Options, nosniff, or referrer policy config is visible in repo.
- Impact:
  - Reduced defense-in-depth against XSS/clickjacking/content-type attacks (could still be configured at hosting edge).
- Fix:
  - Add headers at Vercel/edge level and verify at runtime.

## Notes and Assumptions
- This report is based on code visible in this repository/workspace.
- Runtime protections configured outside the repo (WAF/CDN/edge headers/Supabase function auth policies) were not visible here and should be verified separately.
