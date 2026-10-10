# DocMint 🪙

**Create Professional Business Documents in Seconds.**

DocMint is a multi-tenant, AI-powered document generation platform. Pick a template, fill in the variables (or let AI draft them), and export a polished PDF or DOCX — offer letters, invoices, contracts, payslips, and other business documents across 12 categories. No login required for instant downloads; a premium subscription unlocks unlimited access.

---

## ✨ Features

- **📄 Template Library** — 30 professionally designed sample templates across 12 categories (Finance, Legal, Business, Marketing, Resume Builder, Education, Medical, Manufacturing, Real Estate, Certificates, General, HR Documents), seeded out of the box.
- **⚡ Instant Download (₹9)** — Generate a document in seconds and pay via Razorpay, no account required (`/instant`).
- **👑 Premium Subscription (₹299/mo)** — Unlimited access to premium templates, managed via subscriptions, coupons, and grace periods.
- **🤖 AI Generation (not yet wired up)** — `src/lib/ai/ai-engine.ts` implements placeholder detection and OpenAI/Gemini-backed generation, but **no route or UI calls it yet**. Treat the AI feature as unavailable until an endpoint is added.
- **📝 Visual Payslip Designer** — Drag-and-drop canvas editor to design custom payslip layouts with live preview and HTML export (`/payslip-designer`).
- **🔗 Document Management** — Folders, tags, versioning, and secure tokenized share links (`/share/[token]`).
- **🏢 Multi-Tenant** — Organization-scoped row-level isolation with subdomain detection (`x-tenant-slug` header).
- **🏷️ Company Branding** — Company profile with logo, address, GST/PAN, bank details, and signature injected into documents.
- **🛡️ Enterprise Security** — Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy) set in the edge proxy, bcrypt password hashing, JWT sessions, Razorpay webhook signature verification with IP allowlisting.
- **🖥️ Admin Panel** — Dashboard, users, subscriptions, revenue, support tickets, coupons, blog, audit logs, and template management.
- **📧 Transactional Email** — Verification and welcome emails via Resend.
- **✅ Tested** — 1251 unit tests across auth, engines, generators, documents, and utilities (Vitest), plus a Playwright suite for staging browser validation.

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript |
| Styling | TailwindCSS v4 + Radix UI (shadcn-style components) |
| Database | PostgreSQL 16 via [Prisma 7](https://prisma.io) (driver adapters) |
| Auth | NextAuth v5 — credentials (email/password), Google, Microsoft Entra ID |
| Payments | Razorpay (orders, checkout, webhooks) |
| AI | OpenAI / Gemini API |
| Email | Resend |
| Document Engine | jsPDF (PDF), `docx` (Word), Tiptap editor |
| Testing | Vitest |
| Containerization | Docker + docker-compose |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL** 16 (or use the included docker-compose)

No cache or queue service is required. The dev compose file starts a Redis
container, but nothing in the application connects to it — it is not a
dependency.

### 1. Quick Start (Local)

```bash
# Clone and install
git clone https://github.com/Vave-TechStack/Docmint.git
cd Docmint
npm install

# Configure environment
cp .env.example .env        # then fill in DATABASE_URL and AUTH_SECRET (see below)

# Set up the database schema
npx prisma generate
npx prisma db push

# Seed sample templates (and admin user)
npm run db:seed
npx tsx prisma/seed-admin.ts

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

### 2. Quick Start (Docker)

```bash
# From the docker/ directory — starts Postgres, the app, and runs schema push
docker compose -f docker/docker-compose.yml up --build
```

> The compose file passes `AUTH_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `NEXT_PUBLIC_RAZORPAY_KEY_ID` through from your host environment — export them first or add them to your shell profile.

### 3. Database & Seeding

| Command | Purpose |
|---------|---------|
| `npx prisma db push` | Sync the Prisma schema to your database (no migration files) |
| `npm run db:seed` | Populate sample templates and demo data (`prisma/seed.ts`) |
| `npx tsx prisma/seed-admin.ts` | Create the SUPER_ADMIN user (default `admin@docmint.com` / `Admin@749`) |

> ⚠️ **Change the default admin password before going to production.** Override it with `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars when seeding.

---

## 🔐 Environment Variables

Copy `.env.example` to `.env` (or set them in your deployment). All `.env*` files are gitignored — **never commit secrets**.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/docmint?schema=public` |
| `AUTH_SECRET` | ✅ | NextAuth v5 signing secret. Generate with `openssl rand -base64 32` |
| `RAZORPAY_KEY_ID` | ⚠️ | Razorpay API key (payments) |
| `RAZORPAY_KEY_SECRET` | ⚠️ | Razorpay API secret (server-side) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | ⚠️ | Razorpay key exposed to the browser for checkout |
| `RAZORPAY_WEBHOOK_SECRET` | ⚠️ | Verifies Razorpay webhook signatures (`/api/webhooks/razorpay`) |
| `NEXT_PUBLIC_APP_URL` | ⬜ | Public app URL used for share links (defaults to `http://localhost:3000`) |
| `APP_URL` | ⬜ | Fallback for share links if `NEXT_PUBLIC_APP_URL` is unset |
| `GOOGLE_CLIENT_ID` | ⬜ | Enables Google login (see `docs/google-oauth-setup.md`) |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | ⬜ | Enables Microsoft Entra ID login |
| `MICROSOFT_CLIENT_SECRET` | ⬜ | Microsoft Entra ID client secret |
| `OPENAI_API_KEY` | ⬜ | Enables AI generation via OpenAI (preferred if set). **Engine exists but is not currently called by any route.** |
| `GEMINI_API_KEY` | ⬜ | Enables AI generation via Gemini (used when `OPENAI_API_KEY` is absent). **Not currently called by any route.** |
| `RESEND_API_KEY` | ⬜ | Transactional email (verification, welcome) |
| `RESEND_FROM_EMAIL` | ⬜ | Sender address for emails (defaults to `noreply@docmint.com`) |
| `SUPPORT_EMAIL` | ⬜ | Support contact shown to users (defaults to `support@docmint.com`) |
| `ADMIN_EMAIL` | ⬜ | Admin email for `seed-admin.ts` (defaults to `admin@docmint.com`) |
| `ADMIN_PASSWORD` | ⬜ | Admin password for `seed-admin.ts` (defaults to `Admin@749`) |
| `SEED_SYNC_HTML` | ⬜ | Set to `1` to re-sync template HTML during `db:seed` |

✅ = required · ⚠️ = required for that feature to work · ⬜ = optional

---

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint across the project |
| `npm test` | Run the Vitest suite (1251 tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with coverage report |
| `npm run db:seed` | Seed sample templates (`prisma/seed.ts`) |

---

## 📁 Project Structure

```
src/
├── app/                    # App Router pages & API routes
│   ├── admin/              # Admin panel pages
│   ├── api/                # Route handlers (auth, documents, templates, payments…)
│   ├── payslip-designer/   # Visual payslip editor
│   ├── page.tsx            # Landing page
│   └── instant/, templates/, documents/, settings/, subscription/, login/, signup/, …
├── components/
│   ├── editor/             # Tiptap document editor
│   ├── payslip-designer/   # Canvas, palette, properties panel, store
│   └── ui/                 # Badge, Button, Card, Modal, Select…
├── lib/
│   ├── security/            # Authorization guards, sanitization, CSP, crypto, logging
│   ├── ai/                  # OpenAI / Gemini engine (not yet wired to any route)
│   ├── docx/                # DOCX generator
│   ├── email/               # Resend email service
│   ├── engine/              # Template & document engines
│   ├── payment/             # Razorpay client
│   ├── utils/               # Export, upload, pagination, placeholders…
│   ├── auth.ts              # NextAuth config
│   └── prisma.ts            # Prisma client (driver adapters)
├── proxy.ts                 # Edge proxy: security headers, CSP nonces, page auth gate
└── types/                   # Shared TypeScript types

prisma/
├── schema.prisma           # Multi-tenant data model
├── seed.ts                 # Sample template seeding
└── seed-admin.ts           # Admin user seeding

docker/                     # Dev docker-compose (postgres, app)
deploy/                     # Production docker-compose + nginx config
docs/                       # Architecture & OAuth setup guides
```

### Key API Routes

| Route | Purpose |
|-------|---------|
| `/api/auth/[...nextauth]` | NextAuth handlers (credentials + OAuth) |
| `/api/auth/signup` | Email/password registration |
| `/api/documents` · `/api/documents/[id]` | Document CRUD |
| `/api/documents/share/[token]` · `/download` | Public shared document view/download |
| `/api/templates` · `/api/templates/[id]` | Template CRUD + download |
| `/api/instant/preview` · `/sample` · `/download` | Instant (no-account) document flow |
| `/api/payments/create-order` | Razorpay order creation |
| `/api/webhooks/razorpay` | Razorpay payment webhook (signature-verified) |
| `/api/subscriptions` | Subscription plans & status |
| `/api/company/profile` | Company branding profile |
| `/api/account` | Profile update (`PATCH`) and authenticated password change (`POST`) |
| `/api/contact` | Public contact form |
| `/api/csp-report` | First-party CSP violation collector |
| `/api/admin/*` | Admin dashboard, users, revenue, tickets, coupons, blog, audit logs, templates |

---

## 📚 Documentation

- [Architecture & Design](./docs/ARCHITECTURE.md) — what is actually implemented today, and what is planned
- [Financial Validation](./docs/FINANCIAL_VALIDATION.md) — what is checked, and which rules need a business decision
- [Rate Limiting Design](./docs/RATE_LIMITING_DESIGN.md) — multi-replica design; nothing provisioned
- [Token Lookup Proposal](./docs/TOKEN_LOOKUP_PROPOSAL.md) — indexed lookup design for verification/reset tokens
- [Production Audit Baseline](./docs/PRODUCTION_AUDIT_BASELINE.md) — historical security audit and current status
- [Google OAuth Setup](./docs/google-oauth-setup.md) — step-by-step Google login configuration
- [Contributing](./CONTRIBUTING.md) — contribution guidelines

---

## 🧪 Testing

```bash
npm test              # Run all 1129 tests
npm run test:coverage # Coverage report
npm run test:e2e      # Playwright suite — requires STAGING_BASE_URL (see below)
```

Tests cover the auth callbacks, template/document engines, DOCX & PDF generation, sample data integrity, and utility modules (export, upload, pagination, prisma-json, custom sections, image placeholders).

### End-to-end tests

The Playwright suite in `e2e/` validates behaviour that only exists in a real
deployment — TLS termination, HSTS, the trusted-proxy chain and browser CSP
enforcement — so it **requires a deployed staging origin** and will not start a
server for you.

```bash
STAGING_BASE_URL=https://staging.example.com npm run test:e2e
```

- `STAGING_BASE_URL` is mandatory; the config refuses to run without it, and
  refuses any host that looks like production or is not HTTPS.
- Tests that create accounts or place orders are tagged `@destructive` and are
  skipped unless `STAGING_ALLOW_DESTRUCTIVE=1`.
- Credentials (`STAGING_SUPER_ADMIN_EMAIL`, `STAGING_PREMIUM_USER_EMAIL`,
  `RAZORPAY_KEY_ID`, …) are read from the environment and never committed.
  See `e2e/support/staging.ts` for the full list and the safety guards.

53 tests run by default; 65 with destructive suites enabled.

---

## 🚢 Deployment

### Build

```bash
npm run build && npm start
```

### Production (Docker)

A production setup lives in [`deploy/`](./deploy) (docker-compose + nginx with webhook security). Set the same env vars listed above on the host.

### Notes

- The edge proxy (`src/proxy.ts`) sets security headers, CSP nonces, and the page-level auth gate — keep it in mind when changing routing.
- HSTS is emitted **only** by the proxy, and only when the request is verified as HTTPS. Set `TRUST_PROXY=true` in production when a reverse proxy overwrites `x-forwarded-proto`; leave it unset for local dev or the app port must not be directly reachable.
- `NEXT_PUBLIC_*` variables are inlined at build time and must be set during the build.
- Razorpay webhooks must point to `https://<your-domain>/api/webhooks/razorpay` with the matching `RAZORPAY_WEBHOOK_SECRET`.
- Rate limiting is in-memory and per-process. It blunts abuse on a single instance but is **not** a distributed limiter — do not run multiple app replicas without an external limiter.

---

## ⚠️ Known limitations

- **Rate limiting is per-process** (`src/lib/rate-limit.ts`). Limits do not hold across multiple replicas, and reset on every deploy. This blocks a multi-replica deployment. See [`docs/RATE_LIMITING_DESIGN.md`](./docs/RATE_LIMITING_DESIGN.md).
- **Financial validation covers arithmetic only.** Documents are checked for internal consistency (earnings vs gross, net vs gross minus deductions, tax vs components, amount-in-words vs the figure). No statutory rate — PF, ESI, professional tax, income tax, GST — is derived, because those depend on employer type, state and filing category the product has not specified. See [`docs/FINANCIAL_VALIDATION.md`](./docs/FINANCIAL_VALIDATION.md).
- **A pending migration is required for indexed token lookup.** `prisma/migrations/20261010000000_add_token_index` is written but **not applied to any environment**. Until it is applied, verification and reset tokens fall back to a bounded sweep of up to 50 unexpired tokens, so a valid token beyond that window is rejected. See [`docs/TOKEN_LOOKUP_PROPOSAL.md`](./docs/TOKEN_LOOKUP_PROPOSAL.md).
- **Most pages are client components.** Only `/terms` and `/privacy` are React Server Components; every other page fetches its data from the browser.
- **The payslip designer has no unit tests** and is the largest untested surface in the codebase.
- **AI generation is not wired up.** The engine exists but nothing calls it.
- **The E2E suite has not been executed** against a valid, isolated HTTPS staging environment. 65 tests covering tenant isolation, CSP, security headers and payment flows remain unverified.

---

## 📄 License

Private — this repository is not open source.
