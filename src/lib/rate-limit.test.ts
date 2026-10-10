import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getClientIp, checkRateLimit, resetRateLimitsForTests } from './rate-limit';

/**
 * The nginx config shipped in `deploy/nginx/nginx.conf` uses
 * `proxy_add_x_forwarded_for`, which APPENDS `$remote_addr` to whatever the
 * client already sent, and sets `X-Real-IP` to `$remote_addr` unconditionally.
 *
 * That makes the FIRST `x-forwarded-for` hop entirely attacker-controlled: a
 * request arriving with `X-Forwarded-For: 1.2.3.4` reaches the app as
 * `1.2.3.4, <real-ip>`. Reading hop 0 let an attacker mint a fresh rate-limit
 * bucket per request, defeating the limiter on login/signup/reset entirely.
 */
function req(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/test', { headers });
}

describe('getClientIp', () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    // These tests require trusted proxy headers to be honored
    process.env.TRUST_PROXY = 'true';
  });

  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  it('prefers x-real-ip, which nginx overwrites with $remote_addr', () => {
    const r = req({
      'x-real-ip': '203.0.113.9',
      // Spoofed first hop must be ignored entirely.
      'x-forwarded-for': '1.2.3.4',
    });
    expect(getClientIp(r)).toBe('203.0.113.9');
  });

  it('reads the LAST x-forwarded-for hop, not the first', () => {
    const r = req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.9' });
    // The rightmost entry is the one appended by the trusted proxy.
    expect(getClientIp(r)).toBe('203.0.113.9');
  });

  it('is not fooled by a spoofed leading hop', () => {
    const attacker = req({ 'x-forwarded-for': '10.0.0.1' });
    expect(getClientIp(attacker)).toBe('10.0.0.1');
  });

  it('normalises IPv6 and strips whitespace', () => {
    const r = req({ 'x-real-ip': '  2001:DB8::1  ' });
    expect(getClientIp(r)).toBe('2001:db8::1');
  });

  it('rejects non-IP header junk rather than using it as a bucket key', () => {
    const r = req({ 'x-real-ip': 'not-an-ip', 'x-forwarded-for': 'also-junk' });
    // Unusable values must collapse to the shared bucket; accepting arbitrary
    // strings would let an attacker grow the bucket map without limit.
    expect(getClientIp(r)).toBe('unknown');
  });

  it('rejects out-of-range IPv4 octets', () => {
    const r = req({ 'x-real-ip': '999.1.1.1' });
    expect(getClientIp(r)).toBe('unknown');
  });

  it('falls back to unknown when no forwarding headers are present', () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });

  it('ignores proxy headers entirely when TRUST_PROXY=false', () => {
    const previous = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = 'false';
    try {
      const r = req({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' });
      expect(getClientIp(r)).toBe('unknown');
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previous;
    }
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it('shares one bucket across distinct spoofed IPs when no real IP is resolvable', () => {
    // With no trustworthy header every caller lands in the same bucket, which
    // throttles together rather than not at all.
    const a = checkRateLimit(`key:${getClientIp(req({}))}`, 3, 60_000);
    const b = checkRateLimit(`key:${getClientIp(req({}))}`, 3, 60_000);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it('allows up to the limit then blocks', () => {
    expect(checkRateLimit('k', 3, 60_000)).toBe(true);
    expect(checkRateLimit('k', 3, 60_000)).toBe(true);
    expect(checkRateLimit('k', 3, 60_000)).toBe(true);
    expect(checkRateLimit('k', 3, 60_000)).toBe(false);
  });

  it('resets once the window has elapsed', () => {
    expect(checkRateLimit('w', 1, 1)).toBe(true);
    expect(checkRateLimit('w', 1, 1)).toBe(false);
    // Busy-wait past the 1ms window.
    const until = Date.now() + 5;
    while (Date.now() < until) { /* spin */ }
    expect(checkRateLimit('w', 1, 1)).toBe(true);
  });

  describe('TRUST_PROXY default false — production safety', () => {
    beforeEach(() => {
      resetRateLimitsForTests();
      // Ensure TRUST_PROXY is NOT set (defaults to false in prod)
      delete process.env.TRUST_PROXY;
    });

    it('ignores x-forwarded-for when TRUST_PROXY is not set', () => {
      const r = req({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' });
      // Without TRUST_PROXY=true, all proxy headers are ignored
      expect(getClientIp(r)).toBe('unknown');
    });

    it('ignores x-real-ip when TRUST_PROXY is not set', () => {
      const r = req({ 'x-real-ip': '203.0.113.9' });
      expect(getClientIp(r)).toBe('unknown');
    });

    it('explicitly TRUST_PROXY=false ignores all proxy headers', () => {
      process.env.TRUST_PROXY = 'false';
      const r = req({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' });
      expect(getClientIp(r)).toBe('unknown');
      delete process.env.TRUST_PROXY;
    });

    it('TRUST_PROXY=true honors proxy headers (test mode)', () => {
      process.env.TRUST_PROXY = 'true';
      const r = req({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4' });
      expect(getClientIp(r)).toBe('203.0.113.9');
      delete process.env.TRUST_PROXY;
    });
  });
});
