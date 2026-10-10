import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getTrustedOrigin,
  getTrustedProto,
  isValidAuthority,
  isVerifiedHttps,
  trustProxyEnabled,
} from '@/lib/security/trusted-proxy';

/**
 * The proxy reads client-supplied forwarding headers for two security
 * decisions: whether to assert HSTS, and which origin to advertise for CSP
 * reporting. If those headers are believed without a declared trusted proxy,
 * a client can forge both. These tests pin the trust boundary.
 */
describe('trusted proxy resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('trustProxyEnabled', () => {
    it('defaults to disabled', () => {
      vi.stubEnv('TRUST_PROXY', '');
      expect(trustProxyEnabled()).toBe(false);
    });

    it('is enabled only by the exact string "true"', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      expect(trustProxyEnabled()).toBe(true);
      vi.stubEnv('TRUST_PROXY', 'TRUE');
      expect(trustProxyEnabled()).toBe(false);
      vi.stubEnv('TRUST_PROXY', '1');
      expect(trustProxyEnabled()).toBe(false);
    });
  });

  describe('getTrustedProto', () => {
    it('returns null when the proxy is untrusted, even with a valid header', () => {
      vi.stubEnv('TRUST_PROXY', 'false');
      const req = new Request('https://x.test/', { headers: { 'x-forwarded-proto': 'https' } });
      expect(getTrustedProto(req)).toBeNull();
    });

    it('reads the header when the proxy is trusted', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      expect(getTrustedProto(new Request('http://a/', { headers: { 'x-forwarded-proto': 'https' } }))).toBe('https');
      expect(getTrustedProto(new Request('https://a/', { headers: { 'x-forwarded-proto': 'http' } }))).toBe('http');
    });

    it('reads the FIRST hop, which the trusted proxy asserted', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const req = new Request('http://a/', { headers: { 'x-forwarded-proto': 'https, http' } });
      expect(getTrustedProto(req)).toBe('https');
    });

    it('tolerates surrounding whitespace and casing', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const req = new Request('http://a/', { headers: { 'x-forwarded-proto': '  HTTPS  ' } });
      expect(getTrustedProto(req)).toBe('https');
    });

    it('refuses an unrecognised protocol rather than guessing', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      for (const value of ['gopher', 'ftp', 'javascript', '', 'ht tp']) {
        const req = new Request('http://a/', { headers: { 'x-forwarded-proto': value } });
        expect(getTrustedProto(req)).toBeNull();
      }
    });

    it('returns null when the header is absent', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      expect(getTrustedProto(new Request('https://a/'))).toBeNull();
    });
  });

  describe('isVerifiedHttps', () => {
    it('is false for a forged header on an untrusted deployment', () => {
      vi.stubEnv('TRUST_PROXY', 'false');
      const req = new Request('http://a/', { headers: { 'x-forwarded-proto': 'https' } });
      expect(isVerifiedHttps(req)).toBe(false);
    });

    it('is true only for a trusted, verified https hop', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      expect(isVerifiedHttps(new Request('http://a/', { headers: { 'x-forwarded-proto': 'https' } }))).toBe(true);
      expect(isVerifiedHttps(new Request('https://a/', { headers: { 'x-forwarded-proto': 'http' } }))).toBe(false);
      expect(isVerifiedHttps(new Request('https://a/'))).toBe(false);
    });
  });

  describe('getTrustedOrigin', () => {
    it('is null when the proxy is untrusted', () => {
      vi.stubEnv('TRUST_PROXY', 'false');
      const req = new Request('https://x.test/', {
        headers: { 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'https' },
      });
      expect(getTrustedOrigin(req)).toBeNull();
    });

    it('combines the trusted proto and host', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const req = new Request('http://nextjs:3000/', {
        headers: { 'x-forwarded-host': 'app.example.com', 'x-forwarded-proto': 'https' },
      });
      expect(getTrustedOrigin(req)).toBe('https://app.example.com');
    });

    it('preserves an explicit port', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const req = new Request('http://nextjs:3000/', {
        headers: { 'x-forwarded-host': 'app.example.com:8443', 'x-forwarded-proto': 'https' },
      });
      expect(getTrustedOrigin(req)).toBe('https://app.example.com:8443');
    });

    it('is null when the proto cannot be established', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const req = new Request('http://nextjs:3000/', { headers: { 'x-forwarded-host': 'app.example.com' } });
      expect(getTrustedOrigin(req)).toBeNull();
    });

    it('is null for a header-injection attempt', () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const req = new Request('http://nextjs:3000/', {
        headers: { 'x-forwarded-host': 'evil.test"; report-to x', 'x-forwarded-proto': 'https' },
      });
      expect(getTrustedOrigin(req)).toBeNull();
    });
  });

  describe('isValidAuthority', () => {
    it('accepts ordinary hostnames, subdomains and ports', () => {
      for (const host of ['example.com', 'app.example.com', 'localhost:3000', 'a-b.example.com:8080', '127.0.0.1']) {
        expect(isValidAuthority(host), host).toBe(true);
      }
    });

    it('accepts IPv6 literals', () => {
      expect(isValidAuthority('[::1]')).toBe(true);
      expect(isValidAuthority('[2001:db8::1]:8443')).toBe(true);
    });

    it('rejects characters that could terminate or inject a header value', () => {
      for (const host of [
        'evil.test"; report-to x',
        'evil.test;x=1',
        'evil.test\r\nX-Injected: 1',
        'evil test',
        'evil.test/path',
        'evil.test?a=1',
        'evil.test#f',
        '',
      ]) {
        expect(isValidAuthority(host), host).toBe(false);
      }
    });

    it('rejects an over-long authority', () => {
      expect(isValidAuthority(`${'a'.repeat(300)}.com`)).toBe(false);
    });
  });
});