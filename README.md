# DocMint 🪙

**Create Professional Business Documents in Seconds.**

DocMint is a multi-tenant, AI-powered document generation platform. Pick a template, fill in the variables (or let AI draft them), and export a polished PDF or DOCX — offer letters, invoices, contracts, payslips, and 200+ document types across 12 categories. No login required for instant downloads; a premium subscription unlocks unlimited access.

---

## ✨ Features

- **📄 Template Library** — 20+ professionally designed sample templates across 12 categories (Finance, Legal, Business, Marketing, Resume Builder, Education, Medical, Manufacturing, Real Estate, Certificates, General, HR Documents), seeded out of the box.
- **⚡ Instant Download (₹1)** — Generate a document in seconds and pay via Razorpay, no account required (`/instant`).
- **👑 Premium Subscription (₹299/mo)** — Unlimited access to premium templates, managed via subscriptions, coupons, and grace periods.
- **🤖 AI Generation** — Automatic placeholder detection and AI-assisted content generation (OpenAI or Gemini, auto-detected by env vars).
- **📝 Visual Payslip Designer** — Drag-and-drop canvas editor to design custom payslip layouts with live preview and HTML export (`/payslip-designer`).
- **🔗 Document Management** — Folders, tags, versioning, and secure tokenized share links (`/share/[token]`).
- **🏢 Multi-Tenant** — Organization-scoped row-level isolation with subdomain detection (`x-tenant-slug` header).
- **🏷️ Company Branding** — Company profile with logo, address, GST/PAN, bank details, and signature injected into documents.
- **🛡️ Enterprise Security** — Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy) set in the edge proxy, bcrypt password hashing, JWT sessions, Razorpay webhook signature verification with IP allowlisting.
- **🖥️ Admin Panel** — Dashboard, users, subscriptions, revenue, support tickets, coupons, blog, audit logs, and template management.
- **📧 Transactional Email** — Verification and welcome emails via Resend.
- **✅ Tested** — 459 unit tests across auth, engines, generators, and utilities (Vitest).

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
- (Optional) **Redis** — included in docker-compose

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
# From the docker/ directory — starts Postgres, Redis, the app, and runs schema push
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
| `OPENAI_API_KEY` | ⬜ | Enables AI generation via OpenAI (preferred if set) |
| `GEMINI_API_KEY` | ⬜ | Enables AI generation via Gemini (used when `OPENAI_API_KEY` is absent) |
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
| `npm test` | Run the Vitest suite (459 tests) |
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
│   ├── ai/                 # OpenAI / Gemini engine
│   ├── docx/               # DOCX generator
│   ├── email/              # Resend email service
│   ├── engine/             # Template & document engines
│   ├── payment/            # Razorpay client
│   ├── utils/              # Export, upload, pagination, placeholders…
│   ├── auth.ts             # NextAuth config
│   └── prisma.ts           # Prisma client (driver adapters)
├── proxy.ts                # Edge proxy: security headers + tenant detection
└── types/                  # Shared TypeScript types

prisma/
├── schema.prisma           # Multi-tenant data model
├── seed.ts                 # Sample template seeding
└── seed-admin.ts           # Admin user seeding

docker/                     # Dev docker-compose (postgres, redis, app)
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
| `/api/admin/*` | Admin dashboard, users, revenue, tickets, coupons, blog, audit logs, templates |

---

## 📚 Documentation

- [Architecture & Design](./docs/ARCHITECTURE.md) — system design, data model, security, scalability
- [Google OAuth Setup](./docs/google-oauth-setup.md) — step-by-step Google login configuration
- [Contributing](./CONTRIBUTING.md) — contribution guidelines

---

## 🧪 Testing

```bash
npm test              # Run all 459 tests
npm run test:coverage # Coverage report
```

Tests cover the auth callbacks, template/document engines, DOCX & PDF generation, sample data integrity, and utility modules (export, upload, pagination, prisma-json, custom sections, image placeholders).

---

## 🚢 Deployment

### Build

```bash
npm run build && npm start
```

### Production (Docker)

A production setup lives in [`deploy/`](./deploy) (docker-compose + nginx with webhook security). Set the same env vars listed above on the host.

### Notes

- The edge proxy (`src/proxy.ts`) sets security headers and tenant detection — keep it in mind when changing routing.
- `NEXT_PUBLIC_*` variables are inlined at build time and must be set during the build.
- Razorpay webhooks must point to `https://<your-domain>/api/webhooks/razorpay` with the matching `RAZORPAY_WEBHOOK_SECRET`.

---

## 📄 License

Private — this repository is not open source.
