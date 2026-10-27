/**
 * Content Security Policy construction.
 *
 * Two policies are produced from one place so they cannot drift:
 *
 *  - `buildEnforcedCsp()` — the policy the browser actually blocks on. This is
 *    the CURRENT, deliberately unchanged policy. Do not tighten it here without
 *    the migration sign-off described in the enforcement plan; the whole point
 *    of the report-only header is to measure first.
 *  - `buildReportOnlyCsp()` — the CANDIDATE strict policy. It is reported, not
 *    enforced, so it can be as tight as the target state without breaking
 *    production. This is the policy we expect to promote once the violation
 *    data supports it.
 *
 * Why report-only carries a nonce it cannot yet satisfy
 * ------------------------------------------------------
 * Next.js propagates a nonce by parsing the CSP header off the REQUEST and
 * matching `'nonce-{value}'`; it then stamps that nonce onto its own inline
 * scripts during SSR. That only works for dynamically rendered pages.
 *
 * This module deliberately does NOT put a nonce-bearing CSP on the request
 * headers. Doing so is what makes Next.js switch a route to dynamic rendering,
 * and flipping ~33 prerendered routes to on-demand is an architectural change
 * that has not been approved. So until the nonce pilot is enabled, the
 * report-only policy contains a freshly generated nonce that nothing matches.
 *
 * That is intentional, and it is the measurement we actually want: every
 * framework inline script is reported as a violation, which quantifies exactly
 * which routes would break under nonce CSP and therefore how large the
 * static -> dynamic migration is. A quiet report log before the migration
 * would mean the policy was too loose to be informative, not that the app is
 * ready.
 */

import { getTrustedOrigin } from '@/lib/security/trusted-proxy';

/** Reporting group name. Must match the `Reporting-Endpoints` header below. */
export const CSP_REPORT_GROUP = 'csp-endpoint';

/** Path of the first-party violation collector. */
export const CSP_REPORT_PATH = '/api/csp-report';

/**
 * Third-party script origins.
 *
 * `checkout.razorpay.com` serves the Checkout JS injected at
 * `src/components/razorpay-checkout.tsx:98`. `*.razorpay.com` covers its
 * sub-resources (frames, images, styles).
 */
const RAZORPAY_SCRIPT_HOSTS = ['https://checkout.razorpay.com', 'https://*.razorpay.com'];

/**
 * Origins allowed for styles and frames.
 *
 * Deliberately narrower than `RAZORPAY_SCRIPT_HOSTS`: the checkout script host
 * serves JS, not styles or frames, and the pre-existing enforced policy only
 * listed the wildcard here. Kept as-is so this refactor does not silently
 * widen what is enforced.
 */
const RAZORPAY_RESOURCE_HOSTS = ['https://*.razorpay.com'];

/**
 * Browser-initiated API/XHR destinations, as currently ENFORCED.
 *
 * `api.openai.com` is here today and stays in the enforced policy: Phase 1
 * measures, it does not tighten. `src/lib/ai/ai-engine.ts` calls OpenAI and
 * Gemini from the server with `process.env` credentials, so this origin is
 * not actually needed by the browser and is a pure exfiltration channel if
 * script execution is ever achieved. It is removed in the candidate policy
 * below and promoted only at enforcement time.
 */
const ENFORCED_CONNECT_HOSTS = [
  'https://api.razorpay.com',
  'https://*.razorpay.com',
  'https://api.openai.com',
];

/** Candidate `connect-src`: same list minus the server-side-only OpenAI host. */
const CANDIDATE_CONNECT_HOSTS = ['https://api.razorpay.com', 'https://*.razorpay.com'];

/**
 * Image origins, unchanged from the pre-refactor enforced policy.
 *
 * `https:` is retained in the ENFORCED policy because four user-facing fields
 * accept an arbitrary remote image URL and reach the browser unfiltered:
 *
 *  - `Template.thumbnail`      `src/app/api/templates/[id]/route.ts` (any
 *                              signed-in org member — `requireUserScope`, no
 *                              admin role check; stored verbatim)
 *  - `Company.companyLogo` /
 *    `Company.companySeal`    `src/app/api/company/profile/route.ts`
 *  - template variable images `src/app/templates/[id]/page.tsx`
 *  - payslip `element.imageSrc` `src/components/payslip-designer/canvas.tsx`
 *
 * `images.remotePatterns` does NOT constrain any of them: every `<Image>` call
 * site passes `unoptimized`, which skips the optimizer entirely, so the
 * `/_next/image` handler that enforces `remotePatterns` is never reached.
 *
 * The only external host the codebase itself ever produces is `placehold.co`
 * (`src/components/payslip-designer/preview-overlay.tsx`); every stored value
 * the app generates is a `data:image/svg+xml` URI. `https:` therefore buys
 * nothing for legitimate content and permits user-directed requests to any
 * host — a tracking-pixel and visitor-IP-exfiltration channel.
 *
 * Narrowing this is safe to *attempt* in the report-only policy below, which
 * measures exactly how many tenants would break, but the enforced policy must
 * not be tightened until the write paths reject non-`data:` URLs.
 */
const IMG_HOSTS = ['data:', 'blob:', 'https:', 'https://*.razorpay.com'];

/**
 * Candidate `img-src`: the same list without the `https:` wildcard, with the
 * one real third-party host named explicitly.
 *
 * Report-only, so any tenant currently pointing a logo at a remote host shows
 * up as a violation instead of a broken page — which is precisely the
 * compatibility evidence needed before this can be promoted.
 */
const CANDIDATE_IMG_HOSTS = ['data:', 'blob:', 'https://placehold.co', 'https://*.razorpay.com'];

const isDev = process.env.NODE_ENV === 'development';

/** `'unsafe-eval'` is a React/Next dev-only requirement (dev error stacks). */
const unsafeEval = isDev ? ["'unsafe-eval'"] : [];

/**
 * Generates a per-request nonce using Web Crypto only.
 *
 * The proxy runs on the edge runtime, where `Buffer` and Node's `crypto` are
 * unavailable, so this uses `crypto.getRandomValues` + `btoa` rather than the
 * `Buffer.from(crypto.randomUUID()).toString('base64')` form used in the
 * Next.js docs (that snippet is Pages/Node-flavoured).
 *
 * 128 bits from `crypto.getRandomValues` is the CSP-recommended width; a UUIDv4
 * would also be 122 bits of randomness but derives it through a PRNG whose
 * guarantees are not part of this function's contract.
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The enforced policy. Unchanged from the pre-report-only baseline.
 *
 * `script-src` keeps `'unsafe-inline'` — this is the gap the report-only
 * policy exists to measure, and it is not removed until sign-off.
 */
export function buildEnforcedCsp(): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...unsafeEval, ...RAZORPAY_SCRIPT_HOSTS].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' ${RAZORPAY_RESOURCE_HOSTS.join(' ')}`,
    `img-src 'self' ${IMG_HOSTS.join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self' ${ENFORCED_CONNECT_HOSTS.join(' ')}`,
    `frame-src 'self' ${RAZORPAY_RESOURCE_HOSTS.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The candidate strict policy, reported but not enforced.
 *
 * Differences from `buildEnforcedCsp()`:
 *  - `script-src` drops `'unsafe-inline'` and requires a per-request nonce,
 *    with `'strict-dynamic'` so scripts loaded by a nonced script are trusted
 *    transitively without enumerating every Razorpay sub-resource.
 *  - `connect-src` drops `api.openai.com` (server-side only).
 *
 * Deliberate non-changes:
 *  - `style-src` KEEPS `'unsafe-inline'`. A nonce does not cover React's inline
 *    `style={{...}}` attributes — those need `'unsafe-inline'` or
 *    `'unsafe-hashes'` with per-value hashes, which is not tractable for
 *    computed layout values. So the nonce migration fixes `script-src` only;
 *    `style-src` retains `'unsafe-inline'` afterwards.
 *  - No `upgrade-insecure-requests`. TLS is not live yet (HTTP still serves
 *    both the app and the ACME challenge), so it would report every plain-HTTP
 *    subresource and tempt an enforcement that would break certificate
 *    issuance. Add it at enforcement time, after the redirect exists.
 *
 * `report-uri` is included alongside `report-to` because `report-uri` is
 * supported by every browser that enforces CSP at all, whereas the Reporting
 * API (`report-to`) is still not universal.
 */
export function buildReportOnlyCsp(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...unsafeEval,
    ...RAZORPAY_SCRIPT_HOSTS,
  ].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' ${RAZORPAY_RESOURCE_HOSTS.join(' ')}`,
    `img-src 'self' ${CANDIDATE_IMG_HOSTS.join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self' ${CANDIDATE_CONNECT_HOSTS.join(' ')}`,
    `frame-src 'self' ${RAZORPAY_RESOURCE_HOSTS.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ');
}

/** `Reporting-Endpoints` header that gives `report-to` a destination. */
export function buildReportingEndpointsHeader(origin: string): string {
  return `${CSP_REPORT_GROUP}="${origin}${CSP_REPORT_PATH}"`;
}

/**
 * Absolute origin for the report endpoint, or `null` when no trustworthy
 * public origin can be established.
 *
 * Resolution order:
 *  1. Trusted-proxy origin — the real public origin when `TRUST_PROXY=true`.
 *  2. `NEXT_PUBLIC_APP_URL` — an explicit operator-supplied canonical origin.
 *  3. The request's own origin — always same-origin, so it cannot redirect a
 *     report at an attacker's host.
 *
 * Returns `null` for a loopback origin so `Reporting-Endpoints` is omitted
 * entirely rather than advertising `http://localhost:3000`, which is
 * unreachable from a browser on another machine and produces a silently dead
 * reporting configuration.
 *
 * A forwarded Host is only honoured when `TRUST_PROXY=true` AND it passes
 * strict authority validation. The previous version read `x-forwarded-host`
 * unconditionally, which let any client redirect the reporting destination.
 */
export function resolveReportOrigin(request: Request): string | null {
  const trusted = getTrustedOrigin(request);
  if (trusted) return trusted;

  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.origin;
    } catch {
      // Malformed value — fall through to the request origin.
    }
  }

  const url = new URL(request.url);
  if (isLoopbackHost(url.hostname)) return null;
  return url.origin;
}

/** Bare `localhost`, the IPv4/IPv6 loopback literals, and `.localhost`. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1';
}

/**
 * Whether to emit the report-only headers.
 *
 * On by default in production, opt-in elsewhere, and force-disabled with
 * `CSP_REPORT_ONLY=false` so a staging or local run can compare policies
 * without collecting noise.
 */
export function reportOnlyEnabled(): boolean {
  if (process.env.CSP_REPORT_ONLY === 'false') return false;
  return process.env.NODE_ENV === 'production' || process.env.CSP_REPORT_ONLY === 'true';
}