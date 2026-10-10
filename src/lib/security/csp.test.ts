import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  buildEnforcedCsp,
  buildReportOnlyCsp,
  buildReportingEndpointsHeader,
  generateCspNonce,
  reportOnlyEnabled,
  resolveReportOrigin,
} from '@/lib/security/csp';

/** Pulls a single directive's value out of a policy string. */
function directive(policy: string, name: string): string {
  const match = policy.match(new RegExp(`(?:^|;|\\s)${name}\\s+([^;]+)`));
  return match ? match[1].trim() : '';
}

describe('CSP construction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('generateCspNonce', () => {
    it('produces a base64 nonce of at least 128 bits', () => {
      const nonce = generateCspNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(atob(nonce).length).toBeGreaterThanOrEqual(16);
    });

    it('is unique per call', () => {
      const nonces = new Set(Array.from({ length: 500 }, () => generateCspNonce()));
      expect(nonces.size).toBe(500);
    });

    it('does not embed characters that would break out of the header', () => {
      for (let i = 0; i < 50; i++) {
        expect(generateCspNonce()).not.toMatch(/[\s;,'"\\]/);
      }
    });
  });

  describe('buildEnforcedCsp', () => {
    const policy = buildEnforcedCsp();

    it('keeps unsafe-inline — Phase 1 must not tighten what is enforced', () => {
      expect(directive(policy, 'script-src')).toContain("'unsafe-inline'");
    });

    it('keeps api.openai.com, which the enforced policy still allows', () => {
      // The candidate drops it; enforcing that drop is an enforcement-phase
      // change, not a measurement change.
      expect(directive(policy, 'connect-src')).toContain('https://api.openai.com');
    });

    it('keeps the wildcard image source required by tenant-supplied thumbnails', () => {
      expect(directive(policy, 'img-src')).toContain('https:');
    });

    it('keeps the enforced img-src byte-identical to the pre-audit baseline', () => {
      // Four user-facing fields accept arbitrary remote image URLs and bypass
      // `images.remotePatterns` via `unoptimized`, so the enforced policy must
      // keep the wildcard until those write paths are closed.
      expect(directive(policy, 'img-src')).toBe(
        "'self' data: blob: https: https://*.razorpay.com"
      );
    });

    it('allows the Razorpay script origins', () => {
      expect(directive(policy, 'script-src')).toContain('https://checkout.razorpay.com');
      expect(directive(policy, 'script-src')).toContain('https://*.razorpay.com');
    });

    it('retains the hardening directives', () => {
      expect(directive(policy, 'object-src')).toBe("'none'");
      expect(directive(policy, 'base-uri')).toBe("'self'");
      expect(directive(policy, 'form-action')).toBe("'self'");
      expect(directive(policy, 'frame-ancestors')).toBe("'none'");
    });

    it('does not emit reporting directives on the enforced policy', () => {
      expect(policy).not.toContain('report-uri');
      expect(policy).not.toContain('report-to');
    });

    it('is byte-identical to the pre-report-only baseline', () => {
      // Phase 1 measures; it must not tighten or loosen what is enforced.
      // Pinning the whole string makes any accidental drift fail loudly rather
      // than shipping silently inside a "measurement only" change.
      expect(policy).toBe(
        "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com; " +
          "style-src 'self' 'unsafe-inline' https://*.razorpay.com; " +
          "img-src 'self' data: blob: https: https://*.razorpay.com; " +
          "font-src 'self' data:; " +
          "connect-src 'self' https://api.razorpay.com https://*.razorpay.com https://api.openai.com; " +
          "frame-src 'self' https://*.razorpay.com; " +
          "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
      );
    });

    it('does not widen style-src or frame-src to the checkout script host', async () => {
      // The checkout host serves JS only. Allowing it for styles/frames would
      // be a silent widening introduced by the refactor.
      expect(directive(policy, 'style-src')).toBe("'self' 'unsafe-inline' https://*.razorpay.com");
      expect(directive(policy, 'frame-src')).toBe("'self' https://*.razorpay.com");
    });
  });

  describe('buildReportOnlyCsp', () => {
    const nonce = 'TESTNONCE123';
    const policy = buildReportOnlyCsp(nonce);

    it('drops unsafe-inline from script-src', () => {
      expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    });

    it('carries the per-request nonce', () => {
      expect(directive(policy, 'script-src')).toContain(`'nonce-${nonce}'`);
    });

    it('enables strict-dynamic so nonced scripts may load further scripts', () => {
      expect(directive(policy, 'script-src')).toContain("'strict-dynamic'");
    });

    it('still lists the Razorpay hosts for non-CSP3 browsers', () => {
      // strict-dynamic makes host allowlists irrelevant in CSP3 browsers, but
      // Safari and others still fall back to the list.
      expect(directive(policy, 'script-src')).toContain('https://checkout.razorpay.com');
    });

    it('keeps unsafe-inline on style-src — nonces do not cover React style props', () => {
      expect(directive(policy, 'style-src')).toContain("'unsafe-inline'");
    });

    it('drops the server-side-only OpenAI origin from connect-src', () => {
      expect(directive(policy, 'connect-src')).not.toContain('api.openai.com');
      expect(directive(policy, 'connect-src')).toContain('https://api.razorpay.com');
    });

    it('drops the https: wildcard from img-src, naming placehold.co instead', () => {
      const imgSrc = directive(policy, 'img-src');
      expect(imgSrc).not.toMatch(/\bhttps:\s/);
      expect(imgSrc).not.toMatch(/(^|\s)https:(\s|$)/);
      expect(imgSrc).toContain('https://placehold.co');
      expect(imgSrc).toContain('data:');
      expect(imgSrc).toContain('blob:');
    });

    it('wires both report-uri and report-to', () => {
      expect(directive(policy, 'report-uri')).toBe(CSP_REPORT_PATH);
      expect(directive(policy, 'report-to')).toBe(CSP_REPORT_GROUP);
    });

    it('omits upgrade-insecure-requests while TLS is not live', () => {
      // Adding it now would report every plain-HTTP subresource and would
      // break ACME issuance if ever promoted before the redirect exists.
      expect(policy).not.toContain('upgrade-insecure-requests');
    });

    it('retains the hardening directives', () => {
      expect(directive(policy, 'object-src')).toBe("'none'");
      expect(directive(policy, 'frame-ancestors')).toBe("'none'");
    });
  });

  describe('buildReportingEndpointsHeader', () => {
    it('points the group at the same-origin collector', () => {
      expect(buildReportingEndpointsHeader('https://app.example.com')).toBe(
        `csp-endpoint="https://app.example.com${CSP_REPORT_PATH}"`
      );
    });
  });

  describe('resolveReportOrigin', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('uses the forwarded host and proto when the proxy is trusted', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const request = new Request('http://nextjs:3000/x', {
        headers: { 'x-forwarded-host': 'app.example.com', 'x-forwarded-proto': 'https' },
      });
      expect(resolveReportOrigin(request)).toBe('https://app.example.com');
    });

    it('takes the first host when a chain is forwarded', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const request = new Request('http://nextjs:3000/x', {
        headers: { 'x-forwarded-host': 'app.example.com, internal:3000', 'x-forwarded-proto': 'https, http' },
      });
      expect(resolveReportOrigin(request)).toBe('https://app.example.com');
    });

    it('IGNORES forwarded host when the proxy is untrusted', () => {
      // Regression: the header used to be trusted unconditionally, letting any
      // client aim the reporting destination at a host it controls.
      vi.stubEnv('TRUST_PROXY', 'false');
      const request = new Request('https://app.example.com/x', {
        headers: { 'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'https' },
      });
      expect(resolveReportOrigin(request)).toBe('https://app.example.com');
    });

    it('rejects a header-injected origin even when the proxy is trusted', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const request = new Request('https://app.example.com/x', {
        headers: { 'x-forwarded-host': 'evil.com"; report-to other', 'x-forwarded-proto': 'https' },
      });
      expect(resolveReportOrigin(request)).toBe('https://app.example.com');
    });

    it('falls back to the request URL when forwarded headers are absent', () => {
      expect(resolveReportOrigin(new Request('https://app.example.com/x'))).toBe(
        'https://app.example.com'
      );
    });

    it('returns null for a loopback origin so no unreachable URL is advertised', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      expect(resolveReportOrigin(new Request('http://localhost:3000/x'))).toBeNull();
      expect(resolveReportOrigin(new Request('http://127.0.0.1:3000/x'))).toBeNull();
      expect(resolveReportOrigin(new Request('http://[::1]:3000/x'))).toBeNull();
    });

    it('prefers an explicit NEXT_PUBLIC_APP_URL over a loopback request origin', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
      expect(resolveReportOrigin(new Request('http://localhost:3000/x'))).toBe(
        'https://app.example.com'
      );
    });

    it('ignores a malformed NEXT_PUBLIC_APP_URL', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not a url');
      expect(resolveReportOrigin(new Request('https://app.example.com/x'))).toBe(
        'https://app.example.com'
      );
    });
  });

  describe('reportOnlyEnabled', () => {
    it('is on in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(reportOnlyEnabled()).toBe(true);
    });

    it('can be force-disabled', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('CSP_REPORT_ONLY', 'false');
      expect(reportOnlyEnabled()).toBe(false);
    });

    it('is opt-in outside production', () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('CSP_REPORT_ONLY', 'false');
      expect(reportOnlyEnabled()).toBe(false);
    });
  });
});