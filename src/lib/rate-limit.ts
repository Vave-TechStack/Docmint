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

// Probabilistic cleanup on access — never run a global timer.
function cleanup(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, record] of buckets) {
    if (now > record.resetAt) buckets.delete(key);
  }
}

/** Best-effort client IP: first x-forwarded-for hop, else x-real-ip. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
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
