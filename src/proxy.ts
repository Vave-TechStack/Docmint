import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtDecrypt } from 'jose';
import {
  buildEnforcedCsp,
  buildReportOnlyCsp,
  buildReportingEndpointsHeader,
  generateCspNonce,
  reportOnlyEnabled,
  resolveReportOrigin,
} from '@/lib/security/csp';
import { isVerifiedHttps } from '@/lib/security/trusted-proxy';

/**
 * DocMint Edge Proxy
 * Handles security headers, multi-tenant routing, and page-level auth gating.
 *
 * Auth model:
 * - API routes self-protect server-side (they call auth()/check roles).
 * - Pages that require a signed-in user (dashboard, documents, settings, …)
 *   previously relied only on client-side redirects. This proxy verifies the
 *   NextAuth JWT cookie on the edge and redirects to /login before the page
 *   renders — same protection as the client checks, but enforced server-side.
 *
 * Edge runtime: no Node.js modules (Prisma, bcrypt) — only Web Crypto.
 */

const AUTH_SECRET = process.env.AUTH_SECRET || '';

// NextAuth v5 session cookie. Secure-prefixed when served over HTTPS.
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];

// Pages that require a signed-in user. Everything else (/, /instant/*,
// /templates/*, /share/*, /login, /signup, /pricing, /api/*, assets, …) is
// public. Mirrors the client-side `router.push('/login')` checks already in
// each protected page.
const PROTECTED_PAGES = [
  '/dashboard',
  '/company',
  '/settings',
  '/subscription',
  '/payslip-designer',
  '/documents',
  '/admin',
  '/templates/new',
];

function isProtectedPage(pathname: string): boolean {
  // /templates/[id]/edit is the template editor — user-only. The public
  // /templates list and /templates/[id] detail pages stay open.
  if (/^\/templates\/[^/]+\/edit\/?$/.test(pathname)) return true;
  return PROTECTED_PAGES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

function base64UrlDecode(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

/**
 * Auth.js v5 sessions are ENCRYPTED JWTs (JWE), not plain HMAC JWTs:
 * alg=dir, enc=A256CBC-HS512 (or A256GCM), where the encryption key is
 * derived with HKDF-SHA256(secret, salt=cookie name, info=`Auth.js Generated
 * Encryption Key (${cookie name})`). This replicates @auth/core/jwt.decode
 * so the edge proxy can verify real session cookies.
 */
async function deriveAuthJsKey(secret: string, salt: string, length: number): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(salt),
      info: encoder.encode(`Auth.js Generated Encryption Key (${salt})`),
    },
    keyMaterial,
    length * 8
  );
  return new Uint8Array(bits);
}

/**
 * Verify a real Auth.js session cookie. `salt` must be the exact cookie name
 * the token was issued under (the token's HKDF salt). Rejects expired or
 * tampered tokens (jwtDecrypt enforces exp and MAC/AEAD integrity).
 */
async function isValidSessionToken(token: string, salt: string): Promise<boolean> {
  // Fail CLOSED. Returning `true` here granted a valid session to ANY caller
  // who merely presented a cookie whenever AUTH_SECRET was unset — an
  // authentication bypass on every protected page, triggered by a missing
  // env var rather than by any credential an attacker would have to supply.
  // A misconfigured deploy must deny access and say so, not wave it through;
  // `src/instrumentation.ts` already surfaces the missing secret loudly.
  if (!AUTH_SECRET) return false;
  try {
    const headerJson = JSON.parse(base64UrlDecode(token.split('.')[0])) as { enc?: string };
    const length = headerJson.enc === 'A256GCM' ? 32 : 64; // A256CBC-HS512 needs 64 bytes
    const key = await deriveAuthJsKey(AUTH_SECRET, salt, length);
    await jwtDecrypt(token, key, {
      clockTolerance: 15,
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256CBC-HS512', 'A256GCM'],
    });
    return true;
  } catch {
    return false;
  }
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const response = NextResponse.next();

  // Correlation id for the request. The security logger reads this header when
  // recording an event, so a log line can be tied back to a specific request.
  response.headers.set('x-request-id', crypto.randomUUID());

// ─── Security Headers ───
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy', buildEnforcedCsp());

  // Report-only candidate policy. Reported, never enforced — it may be as
  // strict as the target state because violations do not block anything. The
  // nonce it carries is intentionally not propagated to the request headers:
  // doing so is what flips routes to dynamic rendering, which is not approved
  // yet. See `src/lib/security/csp.ts` for the full rationale.
  if (reportOnlyEnabled()) {
    response.headers.set('Content-Security-Policy-Report-Only', buildReportOnlyCsp(generateCspNonce()));
    // Omitted entirely when no trustworthy public origin exists, rather than
    // advertising an unreachable loopback address.
    const reportOrigin = resolveReportOrigin(req);
    if (reportOrigin) {
      response.headers.set('Reporting-Endpoints', buildReportingEndpointsHeader(reportOrigin));
    }
  }

  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // HSTS ownership lives HERE and nowhere else. `next.config.ts` used to set
  // the same header on `/(.*)` unconditionally, which overrode this logic and
  // asserted HTTPS pinning even for plain-HTTP requests.
  //
  // It is emitted only when the request provably arrived over HTTPS. A
  // client-supplied `x-forwarded-proto: https` is not sufficient — that header
  // is forgeable whenever the app is directly reachable — so the proxy must be
  // declared trusted (`TRUST_PROXY=true`) before it is believed at all.
  // No `includeSubDomains`/`preload` until domain-wide HTTPS is verified.
  if (isVerifiedHttps(req)) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }

  // ─── Multi-tenant subdomain extraction ───
  const host = req.headers.get('host') || '';
  const subdomain = host.split('.')[0];

  if (subdomain && subdomain !== 'www' && subdomain !== 'app' && !host.includes('localhost')) {
    response.headers.set('x-tenant-slug', subdomain);
  }

  // ─── Page-level auth gate ───
  // API routes and auth endpoints self-protect; only gate user pages.
  if (
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next') &&
    isProtectedPage(pathname)
  ) {
    const sessionCookie = SESSION_COOKIES
      .map((name) => ({ name, value: req.cookies.get(name)?.value ?? '' }))
      .find((cookie) => cookie.value !== '');

    // The cookie name is the HKDF salt the token was derived with — it must
    // match the name the token was issued under.
    const valid = sessionCookie
      ? await isValidSessionToken(sessionCookie.value, sessionCookie.name)
      : false;
    if (!valid) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname + req.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
