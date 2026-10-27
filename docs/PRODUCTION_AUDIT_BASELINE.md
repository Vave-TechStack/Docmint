# DocMint Production Security Audit — Baseline Report

> ## ⚠️ HISTORICAL DOCUMENT — read this first
>
> **This is a point-in-time audit dated 2026-09-30. It is preserved as
> evidence and has deliberately NOT been rewritten.** The findings below
> describe the codebase as it stood *before* the security hardening that
> landed in commit `7bdd7a7` on `security/https-phase-a`. Several are now
> fixed; the original wording is left intact so the audit trail stays honest.
>
> Do not treat the counts, file paths or findings below as current.
>
> ### What has changed since this audit
>
> The baseline reported 41 test files / 880 tests. The current suite is **49
> files / 1129 tests**, and the figures in this document are stale.
>
> Status of each finding recorded here:
>
> | # | Original finding | Severity then | Status now |
> |---|---|---|---|
> | 1 | Multi-tenant header spoofing (`multi-tenant.ts` reads `x-tenant-id`, `x-user-id`, `x-user-role`) | CRITICAL | **FIXED** — file deleted. Tenant, role and org are re-read from the database on every guarded request via `src/lib/security/authorization.ts`. |
> | 2 | In-memory rate limiter, not distributed | CRITICAL | **OPEN, accepted and documented** — `src/lib/rate-limit.ts`. Blunts abuse per instance; does not hold across replicas. |
> | 3 | CSP allows `'unsafe-inline'` and `'unsafe-eval'` | CRITICAL | **PARTIALLY ADDRESSED** — CSP is now nonce-based with an enforced policy plus a stricter report-only candidate. |
> | 4 | AI engine has no tenant isolation | CRITICAL | **MOOT** — the AI engine still has no callers and is not reachable from any route. |
> | 5 | Trust proxy defaults to true | HIGH | **FIXED** — trust is opt-in via `TRUST_PROXY=true`; HSTS requires a verified HTTPS request. |
> | 6 | Webhook IP whitelist includes private ranges in non-production | HIGH | **FIXED** — private ranges removed from the production path; the check now fails closed on an unknown IP instead of being skipped. |
> | 7 | Admin routes may leak data via audit logs | HIGH | **PARTIALLY ADDRESSED** — audit logs are tenant-scoped; emails are masked by the structured logger. |
> | 8 | 15s session revalidation cache allows stale roles | HIGH | **IMPROVED** — TTL reduced to 5s, cache invalidated on role change, suspension and password change. |
> | 9 | Reset tokens stored unhashed | MEDIUM | **FIXED** — tokens are bcrypt-hashed at rest and single-use. |
> | 10 | SVG upload handling must be sanitized before inlining | MEDIUM | **FIXED** — allowlist SVG sanitizer with a drawing-only subset. |
> | 11 | Instant-download payment reuse prevention | MEDIUM | **FIXED** — atomic `Payment.usedAt` claim, hardened for the webhook-first race. |
> | 12 | Missing security headers on some API routes | MEDIUM | **FIXED** — the edge proxy applies headers to all matched routes. |
> | 13 | No distributed rate limiting | MEDIUM | **OPEN** — same as #2. |
> | 14 | Cookie security (Secure/SameSite) | LOW | Mitigated by Auth.js defaults; verify in a deployed environment. |
> | 15 | Detailed errors in development responses | LOW | Mitigated — routes return generic messages; verified by leakage tests. |
> | 16 | Dependency audit needed | LOW | **ADDRESSED** — `npm audit --audit-level=high` runs in CI. |
>
> ### Findings introduced by the audit itself
>
> Two additional issues were found and fixed during remediation:
>
> - **Premium entitlement bypass** — `hasActivePremiumSubscription` ignored
>   `CANCELLED` and lapsed billing windows, so a lapsed subscriber retained
>   premium access.
> - **Proxy authentication bypass** — `src/proxy.ts` returned `true` from the
>   session check when `AUTH_SECRET` was unset, granting a valid session to
>   any caller presenting any cookie.
>
> ### Current status
>
> Production readiness has **not** been established. Unit tests do not
> demonstrate it. Outstanding blockers are tracked in the README's
> "Known limitations" section and in `docs/ARCHITECTURE.md` §11. In
> particular, the Playwright staging suite has not been executed.

---

**Date:** 2026-09-30  
**Project:** DocMint - Enterprise Document Generator  
**Stack:** Next.js 16, React 19, TypeScript, Prisma ORM, PostgreSQL/Neon, NextAuth v5, Tailwind CSS v4, Radix UI, TipTap, Razorpay, Vitest

---

## Baseline Test Results

| Check | Status | Details |
|-------|--------|---------|
| TypeScript (`tsc --noEmit`) | ✅ PASS | No type errors |
| ESLint | ✅ PASS | No linting errors |
| Production Build (`next build`) | ✅ PASS | 42 routes compiled successfully |
| Vitest Suite (`vitest run`) | ✅ PASS | 41 test files, 880 tests passed |
| Test Coverage | 78.76% statements, 83% branches, 77.33% functions, 77.46% lines | Good coverage for critical paths |

---

## Architecture Overview

### Application Structure
- **App Router** with Server Components and Server Actions
- **API Routes** under `/src/app/api/` for all backend operations
- **Middleware** (`proxy.ts`) for edge-level auth gating and security headers
- **Prisma ORM** with PostgreSQL (Neon/PG adapters)
- **NextAuth v5** with JWT session strategy
- **Multi-tenant** architecture with Organization as tenant boundary

### Key Models (from Prisma Schema)
- **Organization** - Tenant root, with plan (FREE/PREMIUM/ENTERPRISE), status
- **User** - Belongs to Organization, roles: SUPER_ADMIN, ADMIN, MANAGER, USER
- **Document** - User-owned, org-scoped, with versions, shares, folders
- **Template** - Org-scoped or global, visibility controls (PUBLIC/PRIVATE/ORGANIZATION/PREMIUM/AI)
- **Subscription** - Org-scoped, Razorpay integration, status lifecycle
- **Payment** - Org/user-scoped, supports SUBSCRIPTION, INSTANT_DOWNLOAD, RENEWAL
- **DocumentShare** - Token-based sharing with password, expiry, download limits
- **AuditLog** - Org-scoped, tracks all sensitive actions
- **CompanyProfile** - Org branding, signatures, billing details
- **SystemSetting** - Global (no orgId), SUPER_ADMIN only

### Authentication Flow
1. Credentials (email/password) with bcrypt (cost 12)
2. OAuth: Google, Microsoft Entra ID (no auto-linking, requires existing verified account)
3. NextAuth v5 JWT sessions with custom claims (orgId, role, emailVerified)
4. Edge middleware validates session cookie on protected pages
5. API routes revalidate against DB on every request (15s cache)

### Authorization System (`src/lib/security/authorization.ts`)
- Centralized guards: `requireAuth`, `requireUserScope`, `requireAdmin`, `requireSuperAdmin`
- DB revalidation on every request (fail-closed)
- `scopeWhere()` helper injects orgId into Prisma queries
- `crossTenant()` explicit check for resource ownership
- SUPER_ADMIN can optionally narrow to one org via `?organizationId=`

### Security Headers (proxy.ts + next.config.ts)
- CSP with `'unsafe-inline'` and `'unsafe-eval'` (required for TipTap, Razorpay)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Strict-Transport-Security: max-age=31536000
- Permissions-Policy: camera=(), microphone=(), geolocation=()

### Rate Limiting (`src/lib/rate-limit.ts`)
- In-memory sliding window (per-process)
- Keys: IP-based (reads `x-real-ip` → last `x-forwarded-for` hop → 'unknown')
- Configurable per endpoint (login: 10/min, signup: 5/min, webhook: 10/sec, etc.)
- Bucket cap: 20,000 entries with LRU eviction

### Input Validation (`src/lib/security/request.ts`)
- `cleanString()` - length cap, control char stripping, newline handling
- `assertSameOrigin()` - CSRF defense (Origin header + Sec-Fetch-Site)
- `readJsonBody()` - safe JSON parsing
- `enumValue()`, `boundedInt()` - allowlist validation
- `escapeHtml()` - output encoding for email/CMS

### HTML Sanitization (`src/lib/security/sanitize-html.ts`)
- **Allowlist-based** (replaced dangerous blocklist)
- Allowed tags: structural, text, table, media (img), SVG drawing subset
- Drop-with-content: script, iframe, object, embed, style carriers (noscript, template, math, foreignObject)
- URL scheme allowlist: http, https, mailto, tel, ftp, data:image/*
- CSS sanitization: strips expression(), behavior, @import, javascript: urls
- SVG sanitization: strips script, foreignObject, animation elements, on* attrs, non-fragment href

### Payment Security (`src/lib/payment/razorpay.ts`)
- Server-side amount resolution (never trusts client)
- HMAC verification with constant-time comparison
- **Cross-check with Razorpay API**: payment belongs to order, status=captured, amount matches expected
- One-time use for instant downloads (`Payment.usedAt` atomic claim)

### Document Sharing (`src/lib/engine/document-engine.ts`)
- Cryptographically random tokens (24 bytes = 48 hex chars)
- Bcrypt for share passwords (legacy SHA-256 supported for migration)
- Atomic download counter with row-level locking
- Expiry, maxDownloads, revocation
- HTML sanitized before serving from public share endpoints

### AI Engine (`src/lib/ai/ai-engine.ts`)
- **Currently unused** (no routes/UI call it)
- Supports OpenAI and Gemini
- No tenant isolation implemented (would be critical if enabled)

---

## Identified Security Concerns (Baseline)

### CRITICAL
1. **Multi-tenant header spoofing risk** - `multi-tenant.ts` reads `x-tenant-id`, `x-user-id`, `x-user-role` from headers which could be spoofed if not set by trusted proxy
2. **In-memory rate limiter** - Not distributed, fails open across multiple instances
3. **CSP allows `'unsafe-inline'` and `'unsafe-eval'`** - Required for TipTap/Razorpay but weakens XSS protection
4. **AI engine has no tenant isolation** - If enabled, could leak cross-org data

### HIGH
5. **Trust proxy defaults to true** - If deployed without trusted proxy, IP spoofing bypasses rate limits
6. **Webhook IP whitelist includes private ranges in non-production** - Risk if env misconfigured
7. **Some admin routes may leak data via audit logs** - Need to verify no secrets in audit trail
8. **Session revalidation cache** - 15s TTL means stale roles/org status possible briefly

### MEDIUM
9. **Password reset tokens stored in VerificationToken table** - Single-use but not hashed at rest
10. **SVG upload handling** - Complex pipeline, must ensure sanitization runs before inlining
11. **Instant download payment reuse prevention** - Race condition handling is complex, needs verification
12. **Missing security headers on some API routes** - Only proxy.ts sets them globally
13. **No distributed rate limiting** - Single instance only

### LOW
14. **Cookie security** - NextAuth handles but should verify Secure/SameSite in production
15. **Error messages** - Some routes return detailed errors in development
16. **Dependency audit needed** - Run `npm audit` for supply chain

### INFORMATIONAL
17. **Good practices already in place:**
    - Centralized authorization with DB revalidation
    - Allowlist HTML sanitizer
    - Constant-time HMAC comparison
    - Payment cross-verification with Razorpay API
    - Atomic operations for download counters
    - Input validation with length bounds
    - CSRF protection via Origin/Sec-Fetch-Site
    - Audit logging for sensitive actions
    - Premium content gating (server-side)

---

## Next Steps

Proceed to Phase 1-30 systematic audit and remediation:
1. **Phase 1:** Multi-tenant isolation - verify every query scopes to organizationId
2. **Phase 2:** IDOR - test every ID parameter for cross-tenant access
3. **Phase 3:** Authentication - verify session handling, OAuth, password reset
4. **Phase 4:** Authorization - test RBAC matrix, privilege escalation
5. **Phase 5-30:** Continue through all phases per audit plan

---

## Files to Investigate Further

Priority order for deep audit:
1. `src/lib/tenant/multi-tenant.ts` - Header-based tenant resolution
2. `src/lib/security/authorization.ts` - Central authz logic
3. `src/app/api/webhooks/razorpay/route.ts` - Webhook handling
4. `src/app/api/instant/download/route.ts` - Payment consumption race
5. `src/lib/ai/ai-engine.ts` - AI tenant isolation (if enabled)
6. `src/lib/rate-limit.ts` - Rate limiter implementation
7. `src/proxy.ts` - Edge middleware auth and headers
8. `src/lib/security/sanitize-html.ts` - XSS protection
8. `src/app/api/auth/*` - Auth endpoints
9. `src/app/api/admin/*` - Admin endpoints
10. All document/template/share API routes