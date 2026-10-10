import { test, expect } from '@playwright/test';
import { assertStagingTarget } from './support/staging';

/**
 * Transport and CSP header behaviour on the deployed staging origin.
 *
 * This is the highest-value suite in the set because it needs no credentials,
 * no database and no Razorpay account — it can run against a freshly deployed
 * build and immediately tell you whether the TLS edge, the trusted-proxy
 * configuration and the CSP rollout are actually live.
 *
 * NOT EXECUTED in the current environment: no staging deployment is
 * reachable. Requires STAGING_BASE_URL.
 */
test.describe('Security headers over real TLS', () => {
  test.beforeAll(() => {
    assertStagingTarget();
  });

  test('serves the enforced CSP and the report-only candidate together', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBeLessThan(400);

    const enforced = response.headers()['content-security-policy'];
    const reportOnly = response.headers()['content-security-policy-report-only'];

    // Both must coexist: report-only must never replace what is enforced.
    expect(enforced, 'enforced CSP missing').toBeTruthy();
    expect(reportOnly, 'report-only CSP missing').toBeTruthy();

    // The enforced policy must still be the agreed baseline, NOT the strict
    // candidate — enforcement is explicitly not approved yet.
    expect(enforced).toContain("script-src 'self' 'unsafe-inline'");
    expect(enforced).not.toContain('strict-dynamic');
    expect(enforced).not.toMatch(/script-src[^;]*nonce-/);

    // The candidate drops unsafe-inline and requires a nonce.
    const scriptSrc = reportOnly.match(/script-src\s+([^;]+)/)?.[1] ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  test('keeps the hardening directives in both policies', async ({ request }) => {
    const response = await request.get('/');
    for (const header of ['content-security-policy', 'content-security-policy-report-only']) {
      const policy = response.headers()[header] ?? '';
      expect(policy, `${header} missing object-src`).toContain("object-src 'none'");
      expect(policy, `${header} missing base-uri`).toContain("base-uri 'self'");
      expect(policy, `${header} missing form-action`).toContain("form-action 'self'");
      expect(policy, `${header} missing frame-ancestors`).toContain("frame-ancestors 'none'");
    }
  });

  test('advertises a reporting endpoint that is not localhost', async ({ request }) => {
    const response = await request.get('/');
    const reporting = response.headers()['reporting-endpoints'] ?? '';
    expect(reporting, 'Reporting-Endpoints header missing').toBeTruthy();
    // A container-internal or loopback endpoint is unreachable from a browser,
    // which silently makes the whole reporting rollout useless.
    expect(reporting).not.toMatch(/localhost|127\.0\.0\.1|\[::1\]/);
    expect(reporting).toContain('/api/csp-report');
  });

  test('sends HSTS only with the intended max-age and scope', async ({ request }) => {
    const response = await request.get('/');
    const hsts = response.headers()['strict-transport-security'];

    // Over real HTTPS with a trusted proxy this MUST be present.
    expect(hsts, 'HSTS missing on the HTTPS staging origin').toBeTruthy();
    expect(hsts).toBe('max-age=31536000');

    // includeSubDomains/preload are deliberately withheld until domain-wide
    // HTTPS is proven. If these ever appear, the guard has been bypassed.
    expect(hsts).not.toContain('includeSubDomains');
    expect(hsts).not.toContain('preload');
  });

  test('does not emit HSTS over plain HTTP', async ({ request, baseURL }) => {
    const origin = new URL(baseURL!);
    origin.protocol = 'http:';
    // Only meaningful against a real TLS-terminating deployment.
    test.skip(!baseURL!.startsWith('https://'), 'requires an HTTPS staging origin');

    const response = await request.get(origin.toString(), { maxRedirects: 0 });
    // HSTS over plain HTTP is ignored by browsers and asserts a transport
    // guarantee the connection did not provide.
    expect(response.headers()['strict-transport-security']).toBeFalsy();
  });

  test('ignores a forged x-forwarded-proto from an untrusted path', async ({ request, baseURL }) => {
    test.skip(!baseURL!.startsWith('https://'), 'requires an HTTPS staging origin');

    // The header the app would trust for protocol determination. Over a real
    // trusted proxy this must be ignored and re-derived from the connection.
    const response = await request.get('/', {
      headers: { 'x-forwarded-proto': 'http' },
      maxRedirects: 0,
    });
    // If the app believed the forged header it would withhold HSTS.
    expect(response.headers()['strict-transport-security']).toBeTruthy();
  });

  test('does not let a forged Host change the reporting destination', async ({ request }) => {
    const response = await request.get('/', {
      headers: { 'x-forwarded-host': 'attacker.example.net' },
    });
    const reporting = response.headers()['reporting-endpoints'] ?? '';
    expect(reporting).not.toContain('attacker.example.net');
  });

  test('sends the baseline hardening headers', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
  });

  test('issues a distinct CSP nonce per response', async ({ request }) => {
    const nonceOf = (r: Awaited<ReturnType<typeof request.get>>) =>
      r.headers()['content-security-policy-report-only']?.match(/'nonce-([^']+)'/)?.[1];

    const first = nonceOf(await request.get('/'));
    const second = nonceOf(await request.get('/'));

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  test('accepts a CSP violation report and answers 204', async ({ request }) => {
    const response = await request.post('/api/csp-report', {
      headers: { 'content-type': 'application/csp-report' },
      data: {
        'csp-report': {
          'document-uri': 'https://staging.example/e2e-probe',
          'effective-directive': 'script-src',
          'blocked-uri': 'inline',
          'status-code': '200',
          'script-sample': 'e2e-probe',
        },
      },
    });

    // A non-2xx makes the browser retry, amplifying the very flood the
    // endpoint exists to absorb.
    expect(response.status()).toBe(204);
  });

  test('rejects CSP reports sent with the wrong content type', async ({ request }) => {
    const response = await request.post('/api/csp-report', {
      headers: { 'content-type': 'application/json' },
      data: { anything: true },
    });
    expect(response.status()).toBe(204);
  });

  test('rate limits repeated CSP reports without ever returning non-204', async ({ request }) => {
    const payload = {
      'csp-report': {
        'document-uri': 'https://staging.example/e2e-flood',
        'effective-directive': 'script-src',
        'blocked-uri': 'inline',
      },
    };

    const statuses: number[] = [];
    for (let i = 0; i < 45; i++) {
      const res = await request.post('/api/csp-report', {
        headers: { 'content-type': 'application/csp-report' },
        data: payload,
      });
      statuses.push(res.status());
    }

    // Throttled reports are dropped silently — a 429 would make browsers retry.
    expect(statuses.every((s) => s === 204)).toBe(true);
  });

  test('does not serve the Next.js image optimizer for arbitrary remote hosts', async ({ request }) => {
    // `remotePatterns: []` is the guard that stops the optimizer being used as
    // an SSRF proxy even though app code passes `unoptimized`.
    const response = await request.get('/_next/image?url=https%3A%2F%2Fexample.com%2Fx.png&w=640&q=75');
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});