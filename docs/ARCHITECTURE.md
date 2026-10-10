# DocMint Architecture

## What this document is

This describes **what DocMint actually does today**, verified against the
source tree. Earlier versions of this file described a system that was never
built — Redis caching, BullMQ queues, S3/R2 storage, Puppeteer rendering,
Kubernetes deployment, OTP and TOTP two-factor authentication, and a set of API
routes that do not exist. Those sections have been removed rather than
reworded, because a design document that describes absent components is worse
than no document at all.

Anything not implemented here is listed explicitly under
[§10 Not implemented](#10-not-implemented).

---

## 1. System overview

DocMint is a multi-tenant SaaS for generating business documents as PDF or
DOCX. It has two revenue paths:

- **Instant download** — ₹9 per document, no account required.
- **Premium subscription** — ₹299/month or ₹2,870/year, unlocks premium
  templates for the whole organization.

Users pick one of 30 seeded templates across 12 categories, fill in the
placeholders, preview the result, and export. There is also a drag-and-drop
payslip designer for building payslip layouts visually.

### Scale as built

| | |
|---|---|
| API routes | 37 |
| Pages | 35 |
| Prisma models | 25 |
| Prisma enums | 14 |
| Database migrations | 1 |
| Unit tests | 1129 across 49 files |
| E2E tests | 53 by default, 65 with destructive suites |

---

## 2. Tech stack (as built)

| Layer | Technology |
|---|---|
| Framework | Next.js 16.3.7 (App Router) + React 19.2 + TypeScript |
| Edge | `src/proxy.ts` — renamed from `middleware.ts` in Next 16 |
| Styling | TailwindCSS v4 + Radix UI |
| Database | PostgreSQL via Prisma 7 (Neon and pg driver adapters) |
| Auth | NextAuth v5 — credentials, Google, Microsoft Entra ID |
| Payments | Razorpay |
| Email | Resend |
| Documents | jsPDF (PDF), `docx` (Word), Tiptap (editor) |
| Designer | @dnd-kit |
| Testing | Vitest (unit), Playwright (staging E2E) |
| Container | Docker + docker-compose + nginx |

There is **no cache service, no job queue, and no object storage**. See §10.

---

## 3. Request path

```
Browser
  → nginx (TLS termination, webhook path protection)
    → src/proxy.ts   [edge]  security headers, CSP nonces,
    │                        HSTS (verified HTTPS only), page auth gate
      → App Router
        → page.tsx (almost all client components)
          → fetch() → /api/* route handler
            → src/lib/security/authorization.ts   guard + tenant scope
              → Prisma → PostgreSQL
```

A structural note: **33 of 35 pages are client components.** Only `/terms` and
`/privacy` are React Server Components. Pages fetch their own data from the
browser, so there is no server-side data layer and the full API surface is
exposed to the client. This is a known limitation, not an accident.

---

## 4. Multi-tenancy

`Organization` is the tenant boundary. Isolation is **row-level**, not
schema-per-tenant.

### How the tenant is resolved

From the **database**, on every guarded request — never from a request header
and never from the JWT.

`src/lib/tenant/multi-tenant.ts` previously read `x-tenant-id`, `x-user-id`,
and `x-user-role` from request headers and was deleted: those headers are
client-reachable and would have let any caller assert their own tenant and
role. Its only remaining descendant is the informational `x-tenant-slug`
header set by the proxy from the subdomain, which is not used for
authorization.

### The guard layer

`src/lib/security/authorization.ts` is the single entry point:

- `requireAuth` — any signed-in user.
- `requireUserScope` — signed-in user **with** an organization. Returns the
  org id so callers never assert a non-null JWT claim.
- `requireAdmin` — `ADMIN` or `SUPER_ADMIN`.
- `requireSuperAdmin` — platform-wide and money-moving operations only.
- `resolveOptionalScope` — for routes serving both anonymous and signed-in
  callers (public template preview/download).
- `crossTenant(guard, recordOrgId)` — denies a record owned by another org.
- `scopeWhere(guard, where)` — injects the org id into a Prisma `where`
  clause *after* the caller's filters, so a spread cannot override it.

### Why it is built this way

The session is a stateless JWT, so `role`, `organizationId` and
`emailVerified` are snapshotted at sign-in. Trusting them for the token's
lifetime meant a user demoted from `ADMIN` to `USER`, suspended, or moved
between organizations kept their old role and tenant — for the default 30-day
Auth.js token lifetime. That bypassed the premium paywall (the admin branch
skips the subscription check) and exposed the previous tenant's private
templates.

Every guard therefore re-reads the user row:

- **Fails closed.** A DB error rejects the request rather than trusting a
  stale token.
- **DB-authoritative role and org**, not the token.
- **Suspended or soft-deleted users and organizations** are rejected
  immediately rather than at token expiry.
- **`passwordVersion`** comparison revokes sessions issued before a password
  change or reset.
- A short-lived (5 s) in-process cache keeps this off the hot path.

### Ownership-column protection

`Prisma.DocumentUpdateInput` is a union that includes
`DocumentUncheckedUpdateInput`, which accepts `organizationId`, `userId`,
`deletedAt` and every other ownership column — and that TypeScript annotation
is erased at runtime. Spreading a request body straight into `data` let any
signed-in user re-parent their own document into another tenant with one
PATCH. `DocumentEngine.pickUpdatableFields` is an explicit allowlist that
excludes all ownership and lifecycle columns.

---

## 5. Data model

25 models. The tenant-scoped ones carry `organizationId`.

**Tenant & identity** — `Organization`, `User`, `Account`, `Session`,
`VerificationToken`, `Authenticator`.

**Documents** — `Document`, `DocumentVersion`, `DocumentShare`, `Folder`,
`Category`.

**Templates** — `Template`, `TemplateVersion`.

**Billing** — `Subscription`, `Payment`, `Coupon`.

**Operations** — `AuditLog`, `SupportTicket`, `SupportTicketReply`,
`Notification`, `NotificationRead`.

**Platform (global, no `organizationId`)** — `BlogPost`, `SystemSetting`,
`EmailTemplate`, `CompanyProfile`.

### Notable details

- **Soft delete** — `Document.deletedAt`; the admin user-delete path sets it.
- **Sharing** — `DocumentShare` with a 24-byte CSPRNG token, optional bcrypt
  password, expiry, and `maxDownloads` enforced by an atomic counter.
- **Payments** — `razorpayOrderId` and `razorpayPaymentId` are both unique.
  `Payment.usedAt` is the one-time consume marker for ₹9 downloads. Both
  `organizationId` and `userId` are **nullable**, because instant downloads
  are anonymous.
- **Auth tokens** — stored bcrypt-hashed and purpose-tagged: verification
  links are prefixed `v_`, password-reset links `r_`. A reset token cannot be
  consumed as a verification token.
- **Platform globals** — `BlogPost`, `SystemSetting` and `EmailTemplate` have
  no tenant column and are `SUPER_ADMIN`-only.

---

## 6. Authentication

```
Credentials (bcrypt, cost 12)  ─┐
Google OAuth                   ─┼─→ NextAuth v5 ─→ encrypted JWT (JWE) ─→ session
Microsoft Entra ID             ─┘
```

- **No auto-linking on OAuth.** A provider sign-in requires an existing,
  matching account; a new email from an unlinked provider does not create one.
- **JWT sessions.** The session token is a JWE (`alg=dir`,
  `enc=A256CBC-HS512`), not a plain signed JWT. `src/proxy.ts` replicates
  Auth.js's HKDF key derivation to verify it at the edge.
- **Email verification** is required before sign-in completes.
- **`passwordVersion`** increments on reset; guards reject any session issued
  at a lower version.
- **Verification/reset tokens** are single-use and bcrypt-hashed at rest. A
  keyed HMAC digest (`tokenIndex`) is stored alongside the hash so the owning
  row can be found with an index instead of a sweep. **The migration adding
  that column has not been applied to any environment**, so today the lookup
  still falls back to a bounded sweep for rows without an index. See
  [`TOKEN_LOOKUP_PROPOSAL.md`](./TOKEN_LOOKUP_PROPOSAL.md).
- **Email verification is enforced** at sign-in, not merely requested. An
  account that never clicked its verification link cannot obtain a session.

### The edge auth gate

`src/proxy.ts` redirects unauthenticated visitors away from `/dashboard`,
`/documents`, `/company`, `/settings`, `/subscription`, `/admin`,
`/payslip-designer`, `/templates/new` and `/templates/[id]/edit` before the
page renders. API routes self-protect; the proxy does not gate them.

The gate **fails closed**: if `AUTH_SECRET` is unset the token check returns
`false` rather than `true`. It previously returned `true`, which granted a
valid session to any caller presenting any cookie whenever the secret was
missing — an authentication bypass triggered by a missing env var rather than
by any credential.

---

## 7. Security controls

### Headers

`src/proxy.ts` owns all of them. `next.config.ts` sets the static baseline;
it deliberately does **not** set HSTS, because `headers()` cannot see the
request and was therefore emitting HTTPS pinning over plain HTTP.

| Header | Value |
|---|---|
| `Content-Security-Policy` | Enforced, with a per-response nonce |
| `Content-Security-Policy-Report-Only` | Stricter candidate, reported never enforced |
| `Reporting-Endpoints` | First-party `/api/csp-report`, omitted when no trustworthy origin exists |
| `Strict-Transport-Security` | `max-age=31536000`, **only** for requests verified as HTTPS |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb all `()` |

### Trusted proxy

`x-forwarded-proto` is forgeable whenever the app port is directly reachable,
so it is believed only when `TRUST_PROXY=true`. That flag also gates the CSP
reporting origin. `src/instrumentation.ts` warns at boot when it is unset in
production, because the failure mode is a silent loss of HSTS.

### HTML sanitization

`src/lib/security/sanitize-html.ts` is **allowlist-based**: structural, text,
table and media tags, plus a drawing subset of SVG. `script`, `iframe`,
`object`, `embed` and style carriers are dropped with their contents. URL
schemes are limited to `http`, `https`, `mailto`, `tel`, `ftp` and
`data:image/*`. CSS is stripped of `expression()`, `behavior`, `@import` and
`javascript:` URLs. SVG additionally loses animation elements, `on*` handlers
and non-fragment `href`.

This runs on user-authored document HTML before it is served from a public
share endpoint or inlined into a PDF.

### Payments

- Amounts are resolved **server-side** from constants; the client never
  supplies an amount.
- Razorpay signatures are verified with a **constant-time** comparison, and
  the result is **cross-checked against the Razorpay API** — payment belongs
  to the order, status is `captured`, and the amount matches.
- The webhook verifies an HMAC in constant time and fails **closed** when the
  IP is unknown in production. The previous logic skipped the check entirely
  when the IP could not be determined, so stripping the forwarding headers
  made the whole control evaporate.
- `Payment.usedAt` is claimed atomically, so a ₹9 payment cannot be replayed
  for unlimited downloads.

### CSRF

`assertSameOrigin` checks the `Origin` header and `Sec-Fetch-Site` on every
state-changing route.

### Input validation

`src/lib/security/request.ts` provides `cleanString` (length cap, control
characters), `boundedInt`, `enumValue`, `parsePagination` and `escapeHtml`.
External image URLs are checked against a host allowlist.

### Logging

`src/lib/security/logger.ts` emits structured JSON security events with
request correlation ids. Emails are masked. Webhook, payment, authorization
and rate-limit paths log through it rather than `console`.

---

## 8. Document engine

```
Template → placeholder extraction → variable resolution
         → HTML canvas → sanitize → preview
         → export: DOCX (server) | PDF (jsPDF, client) | HTML
```

- `DocumentEngine` — CRUD, versioning, duplicate, soft delete, favourites,
  sharing, stats. Every query is tenant-scoped.
- `TemplateEngine` — CRUD, duplicate, usage tracking, and
  `sanitizeTemplateForCaller`, which strips premium fields for callers without
  an active subscription.
- `DOCXGenerator` — server-side HTML → DOCX.
- `PDFGenerator` — jsPDF, A4.
- **Premium gating is enforced server-side.** Non-subscribers receive a
  truncated, watermarked sample.

### Payslip designer

A @dnd-kit canvas with a palette, properties panel, undo/redo, grouping,
z-ordering and HTML export. This is the largest untested surface in the
codebase — `canvas.tsx` is 865 lines with no unit tests.

### Export paths

PDF and DOCX use **different renderers**, which is the most important thing to
know about document output here:

- **PDF** — jsPDF `.html()` rasterises through the browser's own HTML engine
  via html2canvas, so tables, page breaks and CSS behave as they do on screen.
- **DOCX** — `src/lib/docx/docx-generator.ts` parses the HTML itself and emits
  native Word constructs: tables (colspan/rowspan, nested tables, borders,
  header shading), lists, headings, inline formatting, line breaks and
  embedded images.

`DOCXGenerator` previously had no `<table>` branch and skipped `<style>` tags
without skipping their contents, so every exported document lost all tables
and opened with raw CSS as body text. It now parses to a tree and renders
through an intermediate model; `docx-generator.regression.test.ts` asserts
this against all 30 seeded templates.

**Visual PDF output is not covered by unit tests** — jsPDF needs a browser DOM.
Structural coverage lives in `document-export.pdf-regression.test.ts`; visual
verification requires the Playwright staging suite, which has not run.

---

## 9. Testing

| Suite | Runner | Count | Requires |
|---|---|---|---|
| Unit | Vitest | 1129 / 49 files | nothing |
| E2E | Playwright | 53 default, 65 with destructive | deployed staging origin |

Unit tests concentrate on `src/lib/**`. **Components and pages have no unit
tests**; the coverage config does not include them, so component behaviour is
unmeasured.

The E2E suite targets a real staging deployment because it validates TLS,
HSTS, the trusted-proxy chain and browser CSP enforcement — none of which a
local server can exercise. `playwright.config.ts` refuses to run without
`STAGING_BASE_URL`, refuses hosts that look like production, and refuses plain
HTTP for non-local targets. Tests that create accounts or place orders are
tagged `@destructive` and gated behind `STAGING_ALLOW_DESTRUCTIVE=1`.

---

## 10. Not implemented

Listed explicitly so they are not mistaken for existing capability. These
appeared in earlier versions of this document and do not exist in the codebase:

| Claimed | Reality |
|---|---|
| Redis caching for sessions/templates | No Redis dependency. Dev compose starts a container nothing connects to. |
| BullMQ job queue | No queue dependency. Generation is synchronous in-request. |
| S3 / R2 object storage | No storage dependency. Uploads are data URLs in the database. |
| Puppeteer PDF rendering | No Puppeteer. PDFs are jsPDF on the client. |
| Kubernetes deployment | Docker compose + nginx only. |
| OTP authentication | No `/api/auth/otp/*` routes. |
| TOTP two-factor authentication | `User.twoFactorEnabled` exists in the schema; the admin dashboard returns a hardcoded `false`. No setup or verify routes. |
| `TemplateVariable` model | A TypeScript type, not a Prisma model. |
| `prisma.$use()` tenant middleware | Never existed. Tenant scoping is explicit in `scopeWhere` and the engines. |
| Prisma middleware auto-scoping | Not present; isolation is manual and per-query. |

Also absent: digital signing, QR verification on documents, bulk export,
translation, grammar checking.

---

## 11. Known limitations

1. **Rate limiting is per-process** (`src/lib/rate-limit.ts`). It blunts abuse
   on a single instance and does not hold across replicas. Documented in-file
   as abuse-blunting, not a security boundary.
2. **Token lookup still sweeps when the index column is absent.** The indexed
   HMAC path and its migration are implemented, but the migration is **not
   applied**, so production behaviour is still the bounded 50-candidate sweep:
   a valid token beyond that window is rejected. Fails safe, but denies
   legitimate users. See [`TOKEN_LOOKUP_PROPOSAL.md`](./TOKEN_LOOKUP_PROPOSAL.md).
3. **Financial validation covers arithmetic only.** No statutory rate (PF, ESI,
   professional tax, income tax, GST) is derived, because those need a business
   decision the product has not made. See
   [`FINANCIAL_VALIDATION.md`](./FINANCIAL_VALIDATION.md).
4. **Client-heavy rendering.** 33 of 35 pages are client components.
5. **AI generation is unwired.** `src/lib/ai/ai-engine.ts` has no callers.
6. **No component tests.** The largest and most intricate UI - the payslip
   designer - is untested.
7. **E2E unverified.** The suite has not been executed against a valid,
   isolated HTTPS staging environment.

---

## 12. Deployment

- `output: 'standalone'`, so the Docker image runs the server directly.
- nginx terminates TLS and guards the webhook path. HSTS is emitted by the
  app, not nginx, so `TRUST_PROXY=true` is required behind a proxy.
- `deploy/docker-compose.yml` runs `migrate`, `nextjs` and `nginx`.
- CI (`.github/workflows/ci.yml`) runs lint → typecheck → unit tests →
  `npm audit --audit-level=high` → production build. **The Playwright suite is
  not part of CI.**

### Required production configuration

| Variable | Why |
|---|---|
| `AUTH_SECRET` | Session encryption and token digests. The app refuses to trust cookies without it. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `TRUST_PROXY=true` | Required for HSTS and a correct CSP reporting origin. Never set when the app port is directly reachable. |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature verification. |
| `NEXT_PUBLIC_APP_URL` | Public origin used in email and share links. |