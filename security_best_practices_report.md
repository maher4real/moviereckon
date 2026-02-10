# Security Best Practices Report

## Executive Summary
The app security posture is materially improved and close to production-ready. The previously identified high-risk issues (non-secure cookie override, weak TMDB proxy controls, missing CSP/Permissions-Policy, and weak input validation on key user endpoints) have been remediated in code. Two medium risks remain that require infrastructure-level decisions.

## Resolved Findings

### [SEC-FIX-001] Production cookies can no longer be forced insecure
- Status: Resolved
- Location:
  - `api/lib/cookies.ts:24`
  - `api/lib/cookies.ts:28`
  - `api/lib/cookies.ts:102`
- What changed:
  - Production now always uses `Secure` cookies, even if `SESSION_COOKIE_SECURE=false` is set.
  - Added `SameSite=None` safety fallback to `Lax` when cookies are not secure.

### [SEC-FIX-002] TMDB proxy abuse controls added
- Status: Partially resolved
- Location:
  - `api/tmdb.ts:48`
  - `api/tmdb.ts:68`
  - `api/tmdb.ts:75`
- What changed:
  - Enforced required `Origin` header.
  - Enforced JSON content type.
  - Added IP and endpoint rate limiting with `429` + `Retry-After`.

### [SEC-FIX-003] Production CORS defaults hardened
- Status: Resolved
- Location:
  - `api/lib/cors.ts:3`
  - `api/lib/cors.ts:22`
  - `api/lib/cors.ts:40`
- What changed:
  - Production and development CORS defaults are now separated.
  - Localhost origins are stripped automatically in production mode.

### [SEC-FIX-004] Input validation added on user mutation endpoints
- Status: Resolved
- Location:
  - `api/_handlers/user/watch-history.ts:12`
  - `api/_handlers/user/liked-items.ts:11`
  - `api/_handlers/user/preferences.ts:9`
  - `api/_handlers/user/profile.ts:11`
- What changed:
  - Added strict normalization for IDs, enums, strings, URLs, and arrays before DB writes.
  - Rejected malformed payload shapes with explicit `400` responses.

### [SEC-FIX-005] Browser hardening headers added
- Status: Resolved
- Location:
  - `vercel.json:7`
  - `vercel.json:13`
- What changed:
  - Added `Content-Security-Policy`.
  - Added `Permissions-Policy`.

### [SEC-FIX-006] Startup error detail leakage reduced
- Status: Resolved
- Location:
  - `src/main.tsx:60`
- What changed:
  - Detailed startup error text is now shown only in development (`import.meta.env.DEV`).

## Remaining Findings

### [SEC-REM-001] Rate limiting is instance-local in serverless runtime
- Severity: Medium
- Location:
  - `api/lib/rate-limit.ts:8`
  - `api/lib/rate-limit.ts:30`
- Evidence:
  - Limits are stored in in-memory `Map`, not shared across function instances.
- Impact:
  - Distributed attacks can bypass limits via horizontal scale/cold starts.
- Recommended fix:
  - Move counters to a shared store (Redis/Upstash/KV) with TTL.

### [SEC-REM-002] TMDB proxy is still public (no caller auth)
- Severity: Medium
- Location:
  - `api/tmdb.ts:29`
  - `api/tmdb.ts:44`
- Evidence:
  - Endpoint can be called by unauthenticated clients; `Origin` checks are not a strong auth control.
- Impact:
  - Determined attackers can still automate calls and consume provider quota.
- Recommended fix:
  - Add stronger abuse controls (signed request token, optional app-level auth for expensive endpoints, or bot protection at edge).

## Validation Run
- `npm run build`: pass
- `npm run test`: pass
- ESLint on changed security files: pass
- `npm audit --omit=dev`: unavailable in this environment due DNS/network restriction to npm registry

## Notes
- This report reflects repository code and local runtime config visible in this workspace.
- Edge/WAF protections not in repo were not directly inspected.
