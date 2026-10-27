# Rate Limiting — Multi-Replica Design

**Status:** Design documented. **No infrastructure provisioned.**
**Date:** 2026-10-10
**Applies to:** `src/lib/rate-limit.ts`

---

## Current state

An in-memory sliding-window limiter: a `process` `Map` keyed by
`bucket:key`, capped at 20,000 entries with least-soon-to-expire eviction, and
probabilistic cleanup on access (no `setInterval`, so a warm serverless instance
never holds a timer open).

The file documents its own limits honestly: it "blunts abuse on a single Node
server; it is not a distributed limiter".

## Why this is a production-readiness blocker

Every limit in the product is enforced by this function:

| Endpoint | Limit | Protects |
|---|---|---|
| `/api/auth/signup` | 5 / min per IP | account creation, mail cost |
| `/api/auth/forgot-password` | 1 / min per address, 5 / hr per IP | mail cost, account enumeration |
| `/api/auth/resend-verification` | per address + per IP | mail cost |
| `/api/auth/verify-email` | 10 / min per IP | bcrypt token lookup |
| `/api/auth/reset-password` | 10 / min per IP | password reset |
| `/api/instant/download` | 10 / min per IP | paid generation |
| `/api/webhooks/razorpay` | 10 / s per IP | signature-verification flooding |

With N replicas behind a load balancer, the effective limit is **N × the
configured value**, and it resets to full on every deploy, restart or crash.
Under a rolling deploy the limiter is effectively off.

**This is a hard blocker for a multi-replica deployment.** It is not a
hardening item.

## What is already correct and must be preserved

1. **Header trust order.** `x-real-ip` first, then the **last**
   `x-forwarded-for` hop, then a shared `unknown` bucket. Reading the first
   hop was a real bypass — nginx's `proxy_add_x_forwarded_for` appends the real
   IP after whatever the client sent, so the first entry is entirely
   attacker-chosen and each request could mint a fresh bucket.
2. **Key hygiene.** Non-IP-shaped header values are discarded rather than used
   as a bucket key, otherwise an attacker can grow the map without bound.
3. **Bounded map.** The 20,000-entry cap prevents memory exhaustion.
4. **Fail-safe posture.** `checkRateLimit` returns `true` when the key cannot
   be derived, so an unknown IP rate-limits everyone together rather than
   nobody.

## Target design

Replace the process-local `Map` with a shared store behind the **same
function signature**, so no call site changes:

```ts
checkRateLimit(key: string, limit: number, windowMs: number): boolean
```

### Algorithm

Sliding window via a sorted set per bucket:

```
ZREMRANGEBYSCORE  ratelimit:{key}  0        {now - windowMs}   # drop expired
ZCARD             ratelimit:{key}                           # current count
if count < limit:
    ZADD          ratelimit:{key}  {now}  {now}
    PEXPIRE       ratelimit:{key}  {windowMs}
    return true
return false
```

This preserves the existing semantics exactly, including the sliding (not
fixed) window. A fixed-window counter is cheaper but lets a caller send 2× the
limit across a window boundary — not acceptable on login or payment routes.

### Why not a token bucket

A token bucket would be a behaviour change: callers currently express
"10 per 1000 ms" and expect that many in any sliding second. Switching would
require re-tuning every call site and re-deriving the limits.

### Provider decision — still open

| Option | Verdict |
|---|---|
| Redis (`RATE_LIMIT_REDIS_URL`) via `ioredis` | Recommended. Matches docker-compose, which already runs Redis for dev. |
| Upstash REST | Works serverlessly, no connection pool. Adds a vendor dependency. |
| Postgres advisory-lock counter | No new dependency, but adds write load to the primary database on every request. Poor fit. |

**Decision required before implementation.** No provider is chosen and
nothing has been provisioned.

### Rollout

Implement `checkRateLimit` with a two-tier strategy:

```ts
// Shared store when configured; process-local otherwise.
```

This keeps single-instance deployments (and the entire unit-test suite)
working unchanged, and means a missing or unreachable store degrades to today's
behaviour rather than failing open silently.

### Required decisions before implementation

1. Which provider.
2. Fail-open or fail-closed when the store is unreachable. **Recommendation:
   fail closed for auth and payment routes, fail open for the rest** — an
   outage should not lock every customer out of signing in, but it also must
   not remove the only brake on credential stuffing.
3. Key namespacing and TTL, so a runaway bucket cannot pin memory in Redis.
4. Whether the webhook's 10/s limit should additionally be enforced at the
   nginx layer (defence in depth at the edge, before the app is reached).

## Interim mitigations (no infrastructure required)

Until a shared store exists:

1. **Deploy a single replica** for auth-adjacent workloads, or accept N × the
   configured limit. This must be stated in the deployment runbook rather than
   discovered.
2. **Add nginx-level limits** in `deploy/nginx/` for `/api/auth/*` and
   `/api/webhooks/`. This works today, needs no new dependency, and holds
   across replicas because it is upstream of the balancer. It is a partial
   mitigation, not a replacement: it cannot key per account, only per IP.
3. Keep `TRUST_PROXY=true` set in production. Without it every caller lands in
   the shared `unknown` bucket and one abusive client throttles everyone.

## Testing

The store is injected, so the same table of tests runs against the in-memory
and shared implementations:

- allow up to the limit, reject the next
- window slides (a request at `t + windowMs` is allowed again)
- keys are independent
- store unavailable → documented fallback behaviour
- `resetRateLimitsForTests()` still works in the in-memory mode the unit
  tests depend on

Existing coverage: `src/lib/rate-limit.test.ts` (15 tests).

## What is NOT claimed

No multi-replica rate limiting exists today. Unit tests pass because they
exercise a single process; that is not evidence the limit holds under load or
across replicas. The Playwright staging suite does not cover rate-limit
distribution either, and it remains unexecuted.