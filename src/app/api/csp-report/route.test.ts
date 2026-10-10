import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for the first-party CSP violation collector.
 *
 * The endpoint is public and unauthenticated by necessity, so these tests
 * target abuse resistance rather than happy-path shape: log injection,
 * query-string leakage, size and rate caps, and the always-204 contract that
 * stops it becoming a parsing oracle.
 */

const logged: Array<Record<string, unknown>> = [];

vi.mock('@/lib/security/logger', () => ({
  SecurityEventCategory: { SYSTEM: 'system' },
  SecurityEventAction: { CSP_VIOLATION: 'csp_violation' },
  logSecurityEvent: vi.fn(async (entry: Record<string, unknown>) => {
    logged.push(entry);
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { create: vi.fn() }, $queryRaw: vi.fn() },
}));

const { POST, GET, resetDropNoticeForTests } = await import('@/app/api/csp-report/route');
const { resetRateLimitsForTests } = await import('@/lib/rate-limit');

function report(body: unknown, contentType = 'application/csp-report', extraHeaders: Record<string, string> = {}) {
  return new NextRequest('https://app.example.com/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': contentType, ...extraHeaders },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const legacyReport = (overrides: Record<string, unknown> = {}) => ({
  'csp-report': {
    'document-uri': 'https://app.example.com/dashboard',
    referrer: '',
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src',
    'blocked-uri': 'inline',
    'status-code': '200',
    'script-sample': 'self.__next_f.push([1,"..."])',
    ...overrides,
  },
});

describe('POST /api/csp-report', () => {
  beforeEach(() => {
    logged.length = 0;
    resetRateLimitsForTests();
    resetDropNoticeForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('response contract', () => {
    it('answers 204 with an empty body', async () => {
      const res = await POST(report(legacyReport()));
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('never echoes attacker input back', async () => {
      const res = await POST(report(legacyReport({ 'blocked-uri': 'https://evil.test/x.js' })));
      const body = await res.text();
      expect(body).not.toContain('evil.test');
    });

    it('rejects non-report content types but still answers 204', async () => {
      const res = await POST(report(legacyReport(), 'application/json'));
      expect(res.status).toBe(204);
      expect(logged).toHaveLength(0);
    });

    it('survives malformed JSON without throwing', async () => {
      const res = await POST(report('{not json'));
      expect(res.status).toBe(204);
      expect(logged).toHaveLength(0);
    });

    it('survives an empty body', async () => {
      expect((await POST(report(''))).status).toBe(204);
    });

    it('answers 405 to GET so it is not a JSON echo endpoint', async () => {
      const res = await GET();
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    });
  });

  describe('normalization', () => {
    it('records a legacy report', async () => {
      await POST(report(legacyReport()));
      expect(logged).toHaveLength(1);
      expect(logged[0].message).toContain('script-src');
      const metadata = (logged[0].context as { metadata: Record<string, unknown> }).metadata;
      expect(metadata.effectiveDirective).toBe('script-src');
      expect(metadata.blockedUri).toBe('inline');
    });

    it('records a Reporting API envelope', async () => {
      await POST(
        report(
          {
            type: 'csp-violation',
            body: {
              documentURL: 'https://app.example.com/subscription',
              effectiveDirective: 'script-src',
              blockedURL: 'inline',
              originalPolicy: "script-src 'self'",
              statusCode: 200,
            },
          },
          'application/reports+json'
        )
      );

      expect(logged).toHaveLength(1);
      const metadata = (logged[0].context as { metadata: Record<string, unknown> }).metadata;
      // Path only — the origin is dropped as well, so a violation record never
      // reveals which host (or tenant subdomain) a visitor was on.
      expect(metadata.documentUri).toBe('/subscription');
    });

    it('processes a Reporting API batch', async () => {
      await POST(
        report(
          [
            { type: 'csp-violation', body: { documentURL: 'https://a.example.com/', effectiveDirective: 'script-src' } },
            { type: 'csp-violation', body: { documentURL: 'https://b.example.com/', effectiveDirective: 'img-src' } },
          ],
          'application/reports+json'
        )
      );

      expect(logged).toHaveLength(2);
    });

    it('ignores entries that are not violations', async () => {
      await POST(report([{ type: 'network-error' }, 'nope', null], 'application/reports+json'));
      expect(logged).toHaveLength(0);
    });
  });

  describe('sensitive data handling', () => {
    it('strips the query string so tokens never reach the log', async () => {
      await POST(
        report(
          legacyReport({
            'document-uri': 'https://app.example.com/share/abc123?token=secret-token-value',
            referrer: 'https://app.example.com/login?callbackUrl=%2Fadmin',
          })
        )
      );

      const metadata = (logged[0].context as { metadata: Record<string, unknown> }).metadata;
      const serialized = JSON.stringify(metadata);
      expect(serialized).not.toContain('secret-token-value');
      expect(serialized).not.toContain('callbackUrl');
      expect(metadata.documentUri).toBe('/share/abc123');
      expect(metadata.referrer).toBe('/login');
    });

    it('strips newlines from fields to prevent log forging', async () => {
      await POST(
        report(
          legacyReport({
            'blocked-uri': 'inline\n[ERROR] forged admin login attempt for victim@x.test',
          })
        )
      );

      const metadata = (logged[0].context as { metadata: Record<string, unknown> }).metadata;
      expect(String(metadata.blockedUri)).not.toContain('\n');
    });

    it('caps the script sample length', async () => {
      await POST(report(legacyReport({ 'script-sample': 'x'.repeat(5000) })));
      const metadata = (logged[0].context as { metadata: Record<string, unknown> }).metadata;
      expect(String(metadata.scriptSample).length).toBeLessThanOrEqual(200);
    });

    it('omits a Reporting API code sample instead of storing page content', async () => {
      await POST(
        report(
          {
            type: 'csp-violation',
            body: {
              documentURL: 'https://app.example.com/dashboard',
              sample: 'const token = "sk_live_secret"',
            },
          },
          'application/reports+json'
        )
      );

      const metadata = (logged[0].context as { metadata: Record<string, unknown> }).metadata;
      expect(JSON.stringify(metadata)).not.toContain('sk_live_secret');
      expect(metadata.scriptSample).toBe('[sample omitted]');
    });
  });

  describe('abuse resistance', () => {
    it('rate limits repeated reports from one client', async () => {
      const requests = Array.from({ length: 40 }, () => POST(report(legacyReport())));
      await Promise.all(requests);

      const accepted = logged.length;
      expect(accepted).toBeGreaterThan(0);
      expect(accepted).toBeLessThanOrEqual(30);
    });

    it('rejects an oversized declared body before reading it', async () => {
      const res = await POST(
        report(legacyReport(), 'application/csp-report', { 'content-length': String(1024 * 1024) })
      );
      expect(res.status).toBe(204);
      expect(logged).toHaveLength(0);
    });

    it('rejects an oversized body even when content-length lies', async () => {
      const res = await POST(report(JSON.stringify(legacyReport({ 'script-sample': 'x'.repeat(40_000) }))));
      expect(res.status).toBe(204);
      expect(logged).toHaveLength(0);
    });

    it('caps how many entries a single batch can log', async () => {
      const batch = Array.from({ length: 200 }, (_, i) => ({
        type: 'csp-violation',
        body: { documentURL: `https://app.example.com/p${i}`, effectiveDirective: 'script-src' },
      }));
      await POST(report(batch, 'application/reports+json'));
      expect(logged.length).toBeLessThanOrEqual(20);
    });

    it('summarises dropped reports instead of logging one line per drop', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // 60 posts against a 30/min budget: ~30 are dropped.
      await Promise.all(Array.from({ length: 60 }, () => POST(report(legacyReport()))));

      // Report loss must be visible, but a flood must not become a log flood.
      const notices = warnSpy.mock.calls.filter((call) =>
        String(call[0]).includes('rate limit')
      );
      expect(notices.length).toBeGreaterThanOrEqual(1);
      expect(notices.length).toBeLessThanOrEqual(2);
      expect(String(notices[0][0])).toContain('dropped');
    });

    it('never echoes the dropped client identity beyond a bounded, sanitized form', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await Promise.all(Array.from({ length: 60 }, () => POST(report(legacyReport()))));
      const notice = String(warnSpy.mock.calls.find((c) => String(c[0]).includes('rate limit'))?.[0] ?? '');
      expect(notice.length).toBeLessThan(300);
      expect(notice).not.toContain('\n');
    });
  });
});