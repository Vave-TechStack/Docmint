/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Shared by the public-facing API routes (signup, login, instant flows,
 * contact, webhook, resend) so the same semantics and the same caveats apply
 * everywhere.
 *
 * CAVEATS (by design, documented once here):
 * - State is per-process/instance — on multiple instances each has its own
 *   bucket. It blunts abuse on a single Node server; it is not a distributed
 *   limiter (use Redis/Upstash for that).
 * - It keys off the client IP, which on a proxied deployment is the first
 *   `x-forwarded-for` hop — spoofable when the app is directly reachable.
 *   Treat it as abuse-blunting, not a security boundary.
 * - Cleanup is lazy (on access) so no setInterval leaks keep a serverless
 *   warm instance alive.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Hard cap on tracked buckets. Without it, an attacker cycling a fresh spoofed
 * IP per request (or simply many distinct real IPs) grows this map without
 * limit and each entry survives until its window rolls over. At the cap we
 * evict the entries closest to expiry — they are contributing the least.
 */
const MAX_BUCKETS = 20_000;

// Probabilistic cleanup on access — never run a global timer.
function cleanup(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, record] of buckets) {
    if (now > record.resetAt) buckets.delete(key);
  }
}

function enforceCap(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  // Drop expired first; only evict live entries if still over the cap.
  cleanup(now);
  if (buckets.size < MAX_BUCKETS) return;

  const entries = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  const excess = buckets.size - MAX_BUCKETS + Math.floor(MAX_BUCKETS * 0.1);
  for (let i = 0; i < excess; i++) buckets.delete(entries[i][0]);
}

/**
 * Matches a bare IPv4/IPv6 literal. Header values that are not a well-formed
 * address are discarded rather than used as a bucket key — otherwise an
 * attacker can mint unlimited distinct keys and grow the bucket map
 * unboundedly (a memory-exhaustion vector in its own right).
 */
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function normalizeIp(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const value = candidate.trim();
  if (!value || value.length > 45) return null; // 45 = max IPv6 text length
  if (IPV4.test(value)) {
    // Reject out-of-range octets that the loose pattern would accept.
    const octets = value.split('.').map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    return value;
  }
  // IPv6 (including the IPv4-mapped form).
  if (/^[0-9a-fA-F:.]+$/.test(value) && value.includes(':')) {
    return value.toLowerCase();
  }
  return null;
}

/**
 * Whether to trust forwarding headers at all.
 *
 * Defaults to DISABLED for safety. Only enable when the app runs behind a
 * trusted reverse proxy (nginx, Cloudflare, etc.) that overwrites
 * `x-real-ip` with the real client IP. Set `TRUST_PROXY=true` explicitly
 * in production deployments behind a trusted proxy.
 */
function trustProxy(): boolean {
  return process.env.TRUST_PROXY === 'true';
}

/**
 * Best-effort client IP for rate-limit bucketing.
 *
 * Previously this read the FIRST `x-forwarded-for` hop. The deployed nginx
 * config uses `proxy_add_x_forwarded_for`, which APPENDS `$remote_addr` to any
 * value the client already sent — so a request carrying
 * `X-Forwarded-For: <random>` arrives as `<random>, <real-ip>` and the first
 * hop is entirely attacker-chosen. Every request could therefore claim a
 * fresh bucket, completely defeating the limiter on login/signup/password
 * reset. (The webhook route had the same inversion, and additionally skipped
 * its allowlist entirely when the header was absent.)
 *
 * Order of trust, most trustworthy first:
 *   1. `x-real-ip` — nginx overwrites this with `$remote_addr` on every
 *      request, so a client cannot forge it.
 *   2. the LAST `x-forwarded-for` hop — appended by the trusted proxy, so it
 *      is the only entry the client did not author.
 *   3. a shared `unknown` bucket, which at worst rate-limits all callers
 *      together instead of not at all.
 */
export function getClientIp(request: Request): string {
  // With the proxy explicitly untrusted the app is assumed to be directly
  // reachable, which makes BOTH forwarding headers client-forgeable. There is
  // then no trustworthy client IP available, so callers collapse into the
  // shared `unknown` bucket — throttled together rather than not at all.
  if (!trustProxy()) return 'unknown';

  const realIp = normalizeIp(request.headers.get('x-real-ip'));
  if (realIp) return realIp;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',');
    // Walk from the right: the proxy-appended hop is the trustworthy one.
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = normalizeIp(hops[i]);
      if (hop) return hop;
    }
  }

  return 'unknown';
}

/**
 * Allow `maxRequests` in `windowMs`, then block until the window rolls over.
 * Returns true when the request is allowed.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  cleanup(now);
  const record = buckets.get(key);
  if (!record || now > record.resetAt) {
    enforceCap(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= maxRequests) return false;
  record.count++;
  return true;
}

/** Test hook — clears all buckets. Never used by app code. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
