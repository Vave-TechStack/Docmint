# DocMint Architecture Document

## Enterprise AI-Powered Document Generation Platform

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Principles](#3-architecture-principles)
4. [System Architecture](#4-system-architecture)
5. [Multi-Tenant Data Model](#5-multi-tenant-data-model)
6. [Microservices Architecture](#6-microservices-architecture)
7. [Document Engine Design](#7-document-engine-design)
8. [Security Architecture](#8-security-architecture)
9. [Scalability Design](#9-scalability-design)
10. [Deployment Strategy](#10-deployment-strategy)
11. [API Contracts](#11-api-contracts)
12. [Database Schema](#12-database-schema)

---

## 1. System Overview

DocMint is a **production-ready enterprise SaaS platform** for AI-powered business document generation. It serves multiple verticals including HR, Finance, Legal, Education, Medical, Manufacturing, and Real Estate sectors.

### Core Capabilities
- **200+ Document Types** across 10+ categories
- **AI-powered content generation** with variable detection
- **Multi-tenant isolation** with complete data separation
- **Dual business model**: Instant Download (₹9) + Premium Subscription (₹299/mo)
- **Real-time document editing** with drag-and-drop interface
- **Enterprise-grade security** with SOC2/GDPR readiness

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16 (App Router) | SSR, SSG, ISR for optimal performance |
| **UI Framework** | React 19 + TypeScript | Type-safe component architecture |
| **Styling** | TailwindCSS v4 + Shadcn UI | Utility-first responsive design |
| **Database** | PostgreSQL 16 | Relational data with JSONB for flexibility |
| **ORM** | Prisma 7 | Type-safe database access |
| **Auth** | NextAuth v5 | OAuth, OTP, 2FA, credentials |
| **Caching** | Redis 7 + Upstash | Session cache, rate limiting, queues |
| **Queue** | BullMQ + Redis | Background job processing |
| **PDF Engine** | jsPDF + Puppeteer | Client & server-side PDF generation |
| **DOCX Engine** | docy | Microsoft Word document generation |
| **Payments** | Razorpay | Subscription & instant payments |
| **AI** | OpenAI / Gemini API | Content generation, translation |
| **Storage** | AWS S3 / Cloudflare R2 | Document & media storage |
| **Email** | Resend / SendGrid | Transactional emails |
| **CDN** | Cloudflare / Vercel Edge | Global content delivery |
| **Monitoring** | Sentry + DataDog | Error tracking & APM |
| **Container** | Docker + Kubernetes | Orchestration & scaling |

---

## 3. Architecture Principles

### Clean Architecture Layers

```
┌──────────────────────────────────────────────┐
│                 Presentation                  │
│          (Next.js Pages / API Routes)         │
├──────────────────────────────────────────────┤
│               Application Layer               │
│      (Use Cases / Services / Orchestrators)    │
├──────────────────────────────────────────────┤
│                 Domain Layer                  │
│   (Entities / Value Objects / Aggregates)     │
├──────────────────────────────────────────────┤
│               Infrastructure Layer            │
│  (Database / Cache / Queue / External APIs)   │
└──────────────────────────────────────────────┘
```

### Domain-Driven Design (DDD) Bounded Contexts

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Identity   │  │  Document   │  │   Template  │
│   & Access   │  │   Engine    │  │   System    │
├─────────────┤  ├─────────────┤  ├─────────────┤
│ • Auth       │  │ • Generation│  │ • CRUD      │
│ • Users      │  │ • Editor    │  │ • Variables │
│ • Tenants    │  │ • Export    │  │ • Library   │
│ • Roles      │  │ • AI        │  │ • Import    │
└─────────────┘  └─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Subscription │  │   Payment   │  │    Admin    │
├─────────────┤  ├─────────────┤  ├─────────────┤
│ • Plans      │  │ • Razorpay  │  │ • Dashboard │
│ • Billing    │  │ • Invoices  │  │ • Users     │
│ • Renewals   │  │ • Refunds   │  │ • Settings  │
│ • Grace      │  │ • Coupons   │  │ • Audit     │
└─────────────┘  └─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐
│   Company   │  │     AI      │
│   Profile   │  │   Engine    │
├─────────────┤  ├─────────────┤
│ • Branding   │  │ • Generate  │
│ • Signature  │  │ • Translate │
│ • Bank Info  │  │ • Grammar   │
│ • Theme      │  │ • Auto-fill │
└─────────────┘  └─────────────┘
```

### SOLID Principles Applied

1. **S**ingle Responsibility: Each service handles one concern
2. **O**pen/Closed: Template system open for extension, closed for modification
3. **L**iskov Substitution: All document types inherit from base Document
4. **I**nterface Segregation: Fine-grained interfaces per bounded context
5. **D**ependency Inversion: High-level modules depend on abstractions

---

## 4. System Architecture

### High-Level Architecture Diagram

```
                                ┌─────────────┐
                                │   CDN /     │
                                │  Edge Cache │
                                └──────┬──────┘
                                       │
┌──────────┐  ┌──────────┐  ┌──────────┴──────────┐
│  Mobile   │  │  Browser │  │      Next.js        │
│  Users    │  │  Users   │  │   (App Router)      │
└─────┬────┘  └────┬─────┘  │  - SSR/ISR/SSG      │
      │            │        │  - API Routes        │
      └────────────┴────────┤  - Middleware        │
                            │  - Edge Functions    │
                            └──────────┬──────────┘
                                       │
                            ┌──────────┴──────────┐
                            │    Rate Limiter      │
                            │   (Redis/Upstash)    │
                            └──────────┬──────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
    ┌─────────┴─────────┐  ┌──────────┴──────────┐  ┌─────────┴─────────┐
    │   Auth Service    │  │  Document Service   │  │   Payment Service │
    │   (NextAuth v5)   │  │  (Next.js API)      │  │   (Razorpay)      │
    └─────────┬─────────┘  └──────────┬──────────┘  └─────────┬─────────┘
              │                        │                        │
    ┌─────────┴─────────┐  ┌──────────┴──────────┐  ┌─────────┴─────────┐
    │   PostgreSQL      │  │   Redis Cache       │  │   Document Queue  │
    │   (Primary DB)    │  │   (Session + Cache) │  │   (BullMQ)        │
    └───────────────────┘  └─────────────────────┘  └───────────────────┘
              │                        │                        │
    ┌─────────┴─────────┐  ┌──────────┴──────────┐  ┌─────────┴─────────┐
    │   S3 / R2         │  │   Email Service     │  │   AI Service      │
    │   (File Storage)  │  │   (Resend)          │  │   (OpenAI)        │
    └───────────────────┘  └─────────────────────┘  └───────────────────┘
```

### Request Flow

```
User Request → CDN → Next.js Edge → Rate Limiter → Middleware (Auth/Tenant)
  → App Router → Server Component → Data Fetching (React Server Components)
  → Prisma → PostgreSQL → Response → Cache (Redis) → CDN
```

---

## 5. Multi-Tenant Data Model

### Tenant Isolation Strategy

**Schema-per-tenant is not used** due to scalability concerns at 10M+ users. Instead, we use **row-level tenant isolation** with a composite key approach.

```
┌─────────────────────────────────────────────┐
│              Organization Table              │
├─────────────────────────────────────────────┤
│ id           │ UUID (PK)                     │
│ name         │ String                        │
│ slug         │ String (UNIQUE)               │
│ domain       │ String (UNIQUE, nullable)     │
│ plan         │ Enum (FREE/PREMIUM/ENTERPRISE)│
│ status       │ Enum (ACTIVE/SUSPENDED/DELETED)│
│ settings     │ JSONB (tenant config)         │
│ created_at   │ DateTime                      │
├─────────────────────────────────────────────┤
│       ALL domain tables have tenant_id       │
└─────────────────────────────────────────────┘
```

### Tenant Context Propagation

```typescript
// Middleware extracts tenant from:
// 1. JWT token (for authenticated users) - tenant_id claim
// 2. Subdomain (for org-specific access) - org.saas.com
// 3. Custom domain (for enterprise) - docs.company.com

// Tenant context flows through:
// Next.js Middleware → Request Headers → Prisma Middleware → All Queries
```

---

## 6. Document Engine Design

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Document Engine                      │
├─────────────────────────────────────────────────────┤
│                    Public API                         │
│  generateDocument()  previewDocument()  exportDoc()  │
├─────────────────────────────────────────────────────┤
│            Document Pipeline Orchestrator             │
├───────────┬───────────┬───────────┬─────────────────┤
│ Template  │ Variable  │ Layout    │ Media           │
│ Engine    │ Resolver  │ Engine    │ Processor       │
├───────────┴───────────┴───────────┴─────────────────┤
│            Export Adapters                            │
│  PDFAdapter │ DOCXAdapter │ HTMLAdapter │ PrintAdapter│
├─────────────────────────────────────────────────────┤
│            Caching Layer (Redis)                      │
└─────────────────────────────────────────────────────┘
```

### Document Generation Flow

```
1. User selects template
2. Placeholder detection & extraction
3. Form generation from placeholders
4. User fills form data
5. Variable resolution with Company branding
6. Document rendering (HTML Canvas)
7. Preview generation
8. Export to target format (PDF/DOCX/HTML)
9. Digital signing (if enabled)
10. QR code generation for verification
11. Watermark application
12. Download/Email/Share
```

### Placeholder System

```typescript
// Placeholder detection regex
const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

// Built-in placeholders mapped to resolvers
const BUILT_IN_PLACEHOLDERS = {
  'CompanyName': CompanyService.getName,
  'CompanyLogo': CompanyService.getLogo,
  'CurrentDate': () => new Date().toLocaleDateString(),
  'CurrentYear': () => new Date().getFullYear(),
  'EmployeeName': DocumentDataService.getEmployeeName,
  // ... more built-ins
};

// Custom placeholders from company profile
const COMPANY_PLACEHOLDERS = {
  'GST': CompanyProfileService.getGST,
  'PAN': CompanyProfileService.getPAN,
  'CIN': CompanyProfileService.getCIN,
};
```

---

## 7. Security Architecture

### Authentication Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User     │───▶│ NextAuth │───▶│  JWT     │───▶│  Session │
│  Request  │    │  v5      │    │  Issue   │    │  Cache   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │
              ┌──────┴──────┐
              │  Providers   │
              │ • Credentials│
              │ • Google     │
              │ • Microsoft  │
              │ • OTP        │
              │ • TOTP (2FA) │
              └─────────────┘
```

### Security Layers

1. **Network Security**: WAF, Cloud Armor, DDoS protection
2. **Application Security**: CSRF tokens, XSS sanitization, SQL injection prevention (Prisma)
3. **Authentication**: JWT with short expiry (15min) + Refresh tokens (7 days)
4. **Authorization**: RBAC with role hierarchy (Admin > Manager > User)
5. **Data Security**: AES-256 encryption at rest, TLS 1.3 in transit
6. **API Security**: Rate limiting, request validation (Zod), audit logging

### Multi-Tenant Security

```typescript
// Every database query MUST include tenant_id filter
prisma.document.findMany({
  where: {
    tenantId: currentTenantId,  // REQUIRED
    userId: currentUserId,      // For user-scoped queries
  }
});

// Prisma middleware enforces tenant isolation
prisma.$use(async (params, next) => {
  if (isDomainModel(params.model)) {
    params.args.where = {
      ...params.args.where,
      tenantId: getCurrentTenantId(),
    };
  }
  return next(params);
});
```

---

## 8. Scalability Design

### Horizontal Scaling Strategy

```
┌──────────────────────────────────────────────────┐
│                 Load Balancer                      │
│              (Cloudflare / AWS ALB)                │
└─────────────────────┬────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │              │              │
┌───────┴───────┐ ┌───┴───────┐ ┌───┴───────┐
│  Next.js      │ │  Next.js  │ │  Next.js  │
│  Instance 1   │ │  Instance2│ │  Instance N│
│  (Docker)     │ │  (Docker) │ │  (Docker)  │
└───────┬───────┘ └───┬───────┘ └───┬───────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
              ┌────────┴────────┐
              │   PostgreSQL    │
              │  (Primary + Read │
              │   Replicas)     │
              └─────────────────┘
                       │
              ┌────────┴────────┐
              │     Redis       │
              │  (Cluster Mode) │
              └─────────────────┘
```

### Caching Strategy

| Cache Type | TTL | Storage | Purpose |
|-----------|-----|---------|---------|
| Session | 24h | Redis | User sessions |
| Templates | 1h | Redis | Frequently used templates |
| Company Profile | 30min | Redis | Branding data |
| API Responses | 5min | Redis | Rate-limited endpoints |
| Static Assets | 1yr | CDN | Images, fonts, CSS |

### Queue System (BullMQ)

```
┌────────────────┐
│  Document Job  │
│  Queue          │
├────────────────┤
│ • PDF Generation│
│ • DOCX Export   │
│ • Email Send    │
│ • AI Generation │
│ • Bulk Export   │
└────────────────┘
```

---

## 9. Performance Targets

| Metric | Target |
|--------|--------|
| Page Load (SSR) | < 200ms |
| Document Generation | < 2s |
| PDF Export | < 3s |
| DOCX Export | < 2s |
| API Response (P95) | < 100ms |
| Concurrent Users | 100,000+ |
| Database Queries | < 10ms (cached) |
| AI Generation | < 5s |
| File Upload | < 1s (direct S3) |

---

## 10. Database Schema Relationships

```
Organization 1──N User
Organization 1──N CompanyProfile
User 1──N Document
User 1──N Template
User 1──N Subscription
Organization 1──N Document (via tenant)

Category 1──N Document
Category 1──N Template

Document 1──N DocumentVersion
Document 1──N DocumentShare
Document 1──N AuditLog

Template 1──N TemplateVariable
Template 1──N TemplateVersion

Subscription 1──N Payment
User 1──N Payment
Organization 1──N Coupon
Organization 1──N SupportTicket
```

---

## 11. API Routes Structure

```
/api/auth/[...nextauth]     - NextAuth authentication
/api/auth/otp/send          - Send OTP
/api/auth/otp/verify        - Verify OTP
/api/auth/2fa/setup         - Setup 2FA
/api/auth/2fa/verify        - Verify 2FA

/api/documents              - CRUD documents
/api/documents/[id]         - Single document operations
/api/documents/[id]/export  - Export document
/api/documents/[id]/versions - Version history
/api/documents/[id]/share   - Share document
/api/documents/generate     - Generate from template

/api/templates              - CRUD templates
/api/templates/[id]         - Single template
/api/templates/[id]/use     - Create document from template
/api/templates/public       - Public templates
/api/templates/import       - Import template

/api/company/profile        - Company profile
/api/company/branding       - Branding settings
/api/company/team           - Team management

/api/subscriptions          - Subscription management
/api/subscriptions/renew    - Renew subscription
/api/subscriptions/cancel   - Cancel subscription

/api/payments/create-order  - Create Razorpay order
/api/payments/verify        - Verify payment
/api/payments/invoices      - Payment invoices
/api/payments/coupons       - Apply coupon

/api/admin/dashboard        - Admin dashboard stats
/api/admin/users            - User management
/api/admin/settings         - System settings
/api/admin/audit-logs       - Audit logs

/api/instant/download       - Instant download flow
/api/instant/preview        - Instant preview
/api/instant/pay            - Instant payment
```

---

## 12. Deployment Architecture

### Docker Compose (Development)

```yaml
services:
  app:        # Next.js application
  postgres:   # PostgreSQL database
  redis:      # Redis cache
  worker:     # BullMQ worker
  nginx:      # Reverse proxy
```

### Kubernetes (Production)

```
- 3+ Next.js pods (auto-scaled)
- PostgreSQL with 2 read replicas
- Redis cluster (3 nodes)
- BullMQ worker pods (auto-scaled)
- Ingress controller (Nginx/Traefik)
- Horizontal Pod Autoscaler
- Pod Disruption Budgets
- Network Policies
```

### CI/CD Pipeline

```
Git Push → GitHub Actions → Lint → Test → Build → Docker Image
  → Push to Registry → Deploy to Staging → E2E Tests → Deploy to Production
```

---

*This architecture document serves as the blueprint for the DocMint enterprise platform. All implementation should follow these principles and patterns.*
