import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { EncryptJWT } from 'jose';
import { getTrustedProto, isVerifiedHttps } from '@/lib/security/trusted-proxy';

const AUTH_SECRET = 'test-secret-for-proxy-tests-123456';
process.env.AUTH_SECRET = AUTH_SECRET;

const { default: proxy } = await import('@/proxy');

/** Replicates @auth/core/jwt.getDerivedEncryptionKey (HKDF-SHA256). */
async function deriveKey(secret: string, salt: string, length = 64): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(salt),
      info: enc.encode(`Auth.js Generated Encryption Key (${salt})`),
    },
    keyMaterial,
    length * 8
  );
  return new Uint8Array(bits);
}

/** Signs a real Auth.js-style JWE session token (dir / A256CBC-HS512). */
async function signToken(
  payload: Record<string, unknown>,
  salt: string,
  expiresInSec = 3600
): Promise<string> {
  const key = await deriveKey(AUTH_SECRET, salt);
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT({ ...payload, iat: now, exp: now + expiresInSec })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
    .encrypt(key);
}

function makeRequest(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers['cookie'] = cookie;
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

const SALT = 'authjs.session-token';
const SECURE_SALT = '__Secure-authjs.session-token';

describe('proxy auth gate', () => {
  it('redirects unauthenticated visitors away from protected pages', async () => {
    const res = await proxy(makeRequest('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects for /documents and /admin subpaths too', async () => {
    expect((await proxy(makeRequest('/documents/abc'))).status).toBe(307);
    expect((await proxy(makeRequest('/admin/users'))).status).toBe(307);
    expect((await proxy(makeRequest('/templates/new'))).status).toBe(307);
    expect((await proxy(makeRequest('/templates/xyz/edit'))).status).toBe(307);
  });

  it('does not redirect public pages or API routes', async () => {
    const publicPaths = [
      '/',
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/pricing',
      '/instant/offer-letter',
      '/templates',
      '/templates/xyz',
      '/share/token123',
      '/api/documents',
    ];
    for (const path of publicPaths) {
      const res = await proxy(makeRequest(path));
      expect(res.status, path).toBe(200);
    }
  });

  it('FAILS CLOSED when AUTH_SECRET is missing', async () => {
    // Regression: the session check used to `return true` when AUTH_SECRET was
    // unset, so a deploy that lost the secret handed every protected page to
    // anyone who sent an arbitrary cookie. The proxy captures AUTH_SECRET at
    // module load, so the module has to be re-imported to change it.
    const savedSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    vi.resetModules();
    try {
      const { default: unconfiguredProxy } = await import('@/proxy');
      const res = await unconfiguredProxy(makeRequest('/dashboard', `${SALT}=not-a-real-token`));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    } finally {
      process.env.AUTH_SECRET = savedSecret;
      vi.resetModules();
    }
  });

  it('still serves public pages when AUTH_SECRET is missing', async () => {
    const savedSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    vi.resetModules();
    try {
      const { default: unconfiguredProxy } = await import('@/proxy');
      // A missing secret locks down protected pages; it must not take the
      // marketing site offline with it.
      expect((await unconfiguredProxy(makeRequest('/'))).status).toBe(200);
      expect((await unconfiguredProxy(makeRequest('/login'))).status).toBe(200);
    } finally {
      process.env.AUTH_SECRET = savedSecret;
      vi.resetModules();
    }
  });

  it('lets a real Auth.js JWE session token through', async () => {
    const token = await signToken({ sub: 'user_1', role: 'USER' }, SALT);
    const res = await proxy(makeRequest('/dashboard', `authjs.session-token=${token}`));
    expect(res.status).toBe(200);
  });

  it('accepts the __Secure- cookie name (production https) with its own salt', async () => {
    const token = await signToken({ sub: 'user_1' }, SECURE_SALT);
    const res = await proxy(makeRequest('/settings', `__Secure-authjs.session-token=${token}`));
    expect(res.status).toBe(200);
  });

  it('rejects a token derived from the wrong secret', async () => {
    const wrongKey = await deriveKey('wrong-secret', SALT);
    const now = Math.floor(Date.now() / 1000);
    const token = await new EncryptJWT({ sub: 'user_1', iat: now, exp: now + 3600 })
      .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
      .encrypt(wrongKey);
    const res = await proxy(makeRequest('/dashboard', `authjs.session-token=${token}`));
    expect(res.status).toBe(307);
  });

  it('rejects an expired token', async () => {
    // Expired beyond jose's 15s clock tolerance (mirrors Auth.js decode).
    const token = await signToken({ sub: 'user_1' }, SALT, -120);
    const res = await proxy(makeRequest('/dashboard', `authjs.session-token=${token}`));
    expect(res.status).toBe(307);
  });

  it('rejects a plain 3-part JWS (non-Auth.js token)', async () => {
    const res = await proxy(
      makeRequest('/dashboard', 'authjs.session-token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalidsig')
    );
    expect(res.status).toBe(307);
  });

  it('still sets security headers on responses', async () => {
    const res = await proxy(makeRequest('/'));
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});

describe('CSP Header Completeness', () => {
  it('includes script-src with Razorpay and unsafe-inline for Next.js', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com");
  });

  it('includes style-src with Razorpay and unsafe-inline', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://*.razorpay.com");
  });

  it('includes img-src with data:, blob:, https:, and Razorpay', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain("img-src 'self' data: blob: https: https://*.razorpay.com");
  });

  it('includes font-src with data: for web fonts', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain("font-src 'self' data:");
  });

  it('includes connect-src for Razorpay, OpenAI, and self', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain("connect-src 'self' https://api.razorpay.com https://*.razorpay.com https://api.openai.com");
  });

  it('includes frame-src for Razorpay checkout iframe', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain("frame-src 'self' https://*.razorpay.com");
  });

  it('does NOT include unsafe-inline in default-src (defense in depth)', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('content-security-policy') || '';
    // default-src should only be 'self' — unsafe-inline only in script-src/style-src
    const defaultSrcMatch = csp.match(/default-src\s+([^;]+)/);
    expect(defaultSrcMatch).toBeTruthy();
    expect(defaultSrcMatch![1].trim()).toBe("'self'");
  });

  it('sets Permissions-Policy to disable camera, microphone, geolocation, payment, usb', async () => {
    const res = await proxy(makeRequest('/'));
    expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });

  it('omits HSTS on a plain HTTP request', async () => {
    // Previously emitted unconditionally. Browsers ignore HSTS on http:// but a
    // downgrade to HTTP should not leave a stale pinning claim behind, and the
    // edge terminates TLS — so the header is gated on the forwarded proto.
    const res = await proxy(makeRequest('/'));
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('sends HSTS on an HTTPS-terminated request', async () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const req = new NextRequest('http://localhost:3000/', { headers: { 'x-forwarded-proto': 'https' } });
      const res = await proxy(req);
      expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000');
      vi.unstubAllEnvs();
    });

    describe('HSTS is only asserted for verified HTTPS', () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('ignores a forged x-forwarded-proto when the proxy is untrusted', () => {
        vi.stubEnv('TRUST_PROXY', 'false');
        const req = new NextRequest('http://localhost:3000/', {
          headers: { 'x-forwarded-proto': 'https' },
        });
        // A client can send this header itself, so it must not be believed
        // unless a trusted proxy is known to overwrite it.
        expect(getTrustedProto(req)).toBeNull();
        expect(isVerifiedHttps(req)).toBe(false);
      });

      it('honours x-forwarded-proto when the proxy is trusted', () => {
        vi.stubEnv('TRUST_PROXY', 'true');
        const req = new NextRequest('http://localhost:3000/', {
          headers: { 'x-forwarded-proto': 'https' },
        });
        expect(isVerifiedHttps(req)).toBe(true);
      });

      it('does not claim HTTPS when the trusted proxy reports http', () => {
        vi.stubEnv('TRUST_PROXY', 'true');
        const req = new NextRequest('http://localhost:3000/', {
          headers: { 'x-forwarded-proto': 'http' },
        });
        expect(isVerifiedHttps(req)).toBe(false);
      });

      it('reads the first proxy-asserted hop, not a client-prepended one', () => {
        vi.stubEnv('TRUST_PROXY', 'true');
        const req = new NextRequest('http://localhost:3000/', {
          headers: { 'x-forwarded-proto': 'https, http' },
        });
        expect(getTrustedProto(req)).toBe('https');
      });

      it('rejects an unrecognised protocol value instead of guessing', () => {
        vi.stubEnv('TRUST_PROXY', 'true');
        const req = new NextRequest('http://localhost:3000/', {
          headers: { 'x-forwarded-proto': 'gopher' },
        });
        expect(getTrustedProto(req)).toBeNull();
      });

      it('omits includeSubDomains and preload pending domain-wide verification', async () => {
        vi.stubEnv('TRUST_PROXY', 'true');
        vi.stubEnv('CSP_REPORT_ONLY', 'true');
        const res = await proxy(
          new NextRequest('http://localhost:3000/', { headers: { 'x-forwarded-proto': 'https' } })
        );
        const hsts = res.headers.get('strict-transport-security') || '';
        expect(hsts).toBe('max-age=31536000');
        expect(hsts).not.toContain('includeSubDomains');
        expect(hsts).not.toContain('preload');
      });
    });

  it('sets the previously missing hardening directives', async () => {
    const csp = (await proxy(makeRequest('/'))).headers.get('content-security-policy') || '';
    // Each of these was absent, so the policy silently inherited default-src.
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('omits unsafe-eval outside development', async () => {
    // Tests run with NODE_ENV=test, i.e. the production shape.
    const csp = (await proxy(makeRequest('/'))).headers.get('content-security-policy') || '';
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  describe('report-only rollout', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('is absent by default outside production', async () => {
      const res = await proxy(makeRequest('/'));
      expect(res.headers.get('content-security-policy-report-only')).toBeNull();
      expect(res.headers.get('reporting-endpoints')).toBeNull();
    });

    it('is present in production alongside the enforced policy', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const res = await proxy(makeRequest('/'));

      // Both headers coexist: report-only never replaces the enforced policy.
      expect(res.headers.get('content-security-policy')).toBeTruthy();
      const reportOnly = res.headers.get('content-security-policy-report-only') || '';
      expect(reportOnly).toContain('report-uri /api/csp-report');
      expect(reportOnly).toContain('report-to csp-endpoint');
    });

    it('advertises the collector via Reporting-Endpoints', async () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      vi.stubEnv('CSP_REPORT_ONLY', 'true');
      const req = new NextRequest('http://nextjs:3000/', {
        headers: { 'x-forwarded-host': 'app.example.com', 'x-forwarded-proto': 'https' },
      });
      const res = await proxy(req);
      expect(res.headers.get('reporting-endpoints')).toBe(
        'csp-endpoint="https://app.example.com/api/csp-report"'
      );
    });

    it('omits Reporting-Endpoints rather than advertising localhost', async () => {
      vi.stubEnv('TRUST_PROXY', 'false');
      vi.stubEnv('CSP_REPORT_ONLY', 'true');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      const res = await proxy(makeRequest('/'));
      expect(res.headers.get('content-security-policy-report-only')).toBeTruthy();
      expect(res.headers.get('reporting-endpoints')).toBeNull();
    });

    it('keeps unsafe-inline in the ENFORCED script-src while the candidate drops it', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const res = await proxy(makeRequest('/'));
      const enforced = res.headers.get('content-security-policy') || '';
      const reportOnly = res.headers.get('content-security-policy-report-only') || '';
      const scriptSrc = (policy: string) => policy.match(/script-src\s+([^;]+)/)?.[1] ?? '';

      expect(scriptSrc(enforced)).toContain("'unsafe-inline'");
      expect(scriptSrc(reportOnly)).not.toContain("'unsafe-inline'");
      // style-src keeps it in BOTH — a nonce does not cover React inline styles.
      expect(reportOnly).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('issues a fresh nonce per response', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const first = (await proxy(makeRequest('/'))).headers.get('content-security-policy-report-only') || '';
      const second = (await proxy(makeRequest('/'))).headers.get('content-security-policy-report-only') || '';
      const nonceOf = (policy: string) => policy.match(/'nonce-([^']+)'/)?.[1];
      expect(nonceOf(first)).toBeTruthy();
      expect(nonceOf(first)).not.toBe(nonceOf(second));
    });

    it('does not leak the nonce into the request headers, which would force dynamic rendering', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      // The proxy cannot expose request headers on a NextResponse, so assert
      // the invariant that matters: nothing in the response advertises that
      // nonce propagation is active.
      const res = await proxy(makeRequest('/'));
      const enforced = res.headers.get('content-security-policy') || '';
      expect(enforced).not.toContain('nonce-');
      expect(enforced).not.toContain('strict-dynamic');
    });

    it('can be force-disabled in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('CSP_REPORT_ONLY', 'false');
      const res = await proxy(makeRequest('/'));
      expect(res.headers.get('content-security-policy-report-only')).toBeNull();
    });
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await proxy(makeRequest('/'));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await proxy(makeRequest('/'));
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets X-Frame-Options: DENY on all responses', async () => {
    // Public paths that don't redirect
    const paths = ['/', '/login', '/pricing', '/templates', '/share/token123'];
    for (const path of paths) {
      const res = await proxy(makeRequest(path));
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    }
  });
});
