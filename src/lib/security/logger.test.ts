import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression tests for the security logger.
 *
 * These cover two defects found in review:
 *  1. The audit-table write spread the RAW context metadata, so secrets that
 *     `sanitizeMetadata` redacted for the console line were persisted in
 *     plaintext to a durable store.
 *  2. The same write persisted the unmasked email address even though the
 *     console output masked it.
 *
 * Plus the trust-order guarantees the logger depends on: the request id must
 * come from the trusted `x-request-id` header (not a client-controlled query
 * param), and the client IP must follow the shared extractor.
 */

const prismaMocks = vi.hoisted(() => ({
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMocks,
}));

const { logSecurityEvent, createSecurityContext, maskEmail } = await import('@/lib/security/logger');
const { SecurityEventCategory, SecurityEventAction } = await import('@/lib/security/logger');

const ORIGINAL_ENV = { ...process.env };

/** Parses the JSON payload the logger hands to console.* */
/**
 * Module-scoped so the module-level `lastLoggedPayload` helper can read it.
 * Reassigned in `beforeEach`.
 */
let stderrSpy: { mock: { calls: unknown[][] } };

/**
 * Captures the JSON line for a given severity.
 *
 * `info` no longer routes through `console.log`: that call is stripped from
 * production builds by `compiler.removeConsole`, so the logger writes info
 * lines straight to stderr. Reading them from `console.log` here would have
 * kept passing while production stayed silent.
 */
function lastLoggedPayload(sink: 'info' | 'warn' | 'error'): Record<string, unknown> {
  const raw =
    sink === 'info'
      ? stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1]?.[0]
      : (
          (sink === 'warn' ? console.warn : console.error) as unknown as {
            mock: { calls: unknown[][] };
          }
        ).mock.calls.slice(-1)[0]?.[0];
  return JSON.parse(String(raw).trim()) as Record<string, unknown>;
}

/** Narrows one level of an unknown JSON payload for assertions. */
function meta(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.context as Record<string, unknown>;
}

/** Reads a nested metadata value as an unknown record. */
function metadata(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.metadata as Record<string, unknown>;
}

describe('security logger', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env.ENABLE_AUDIT_LOG;
    prismaMocks.auditLog.create.mockResolvedValue({});
    prismaMocks.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    // Info events must be observable on a channel that survives the production
    // compiler transform, so that is what the suite asserts against.
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
  });

  describe('maskEmail', () => {
    it('keeps two leading characters and the domain, hides the rest', () => {
      expect(maskEmail('user@example.com')).toBe('us***@example.com');
    });

    it('does not leak a short local part', () => {
      expect(maskEmail('ab@example.com')).toBe('a***@example.com');
      expect(maskEmail('a@example.com')).toBe('a***@example.com');
    });

    it('returns a bare mask for a malformed address', () => {
      expect(maskEmail('not-an-email')).toBe('***');
    });
  });

  describe('createSecurityContext', () => {
    it('takes the request id from the trusted header, not the query string', () => {
      const req = new Request('https://example.com/x?x-request-id=attacker-supplied', {
        headers: { 'x-request-id': 'trusted-id' },
      });
      const ctx = createSecurityContext(req);
      expect(ctx.requestId).toBe('trusted-id');
    });

    it('generates a request id when the header is absent', () => {
      const ctx = createSecurityContext(new Request('https://example.com/x'));
      expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('reads the client IP from the trusted x-real-ip header', () => {
      // `getClientIp` returns the shared 'unknown' bucket unless TRUST_PROXY is
      // explicitly enabled, which is the safe default. Enable it here so the
      // assertion exercises the trusted-hop order rather than the fallback.
      const previous = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = 'true';
      try {
        const req = new Request('https://example.com/x', {
          headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1, 203.0.113.9' },
        });
        expect(createSecurityContext(req).ipAddress).toBe('203.0.113.9');

        // With only x-forwarded-for present, the LAST hop is the one the trusted
        // proxy appended — not the attacker-controlled first hop.
        const forwardedOnly = new Request('https://example.com/x', {
          headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' },
        });
        expect(createSecurityContext(forwardedOnly).ipAddress).toBe('203.0.113.9');
      } finally {
        if (previous === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = previous;
      }
    });

    it('collapses to the shared unknown bucket when the proxy is untrusted', () => {
      const previous = process.env.TRUST_PROXY;
      delete process.env.TRUST_PROXY;
      try {
        const req = new Request('https://example.com/x', {
          headers: { 'x-forwarded-for': '1.1.1.1' },
        });
        expect(createSecurityContext(req).ipAddress).toBe('unknown');
      } finally {
        if (previous !== undefined) process.env.TRUST_PROXY = previous;
      }
    });

    it('tolerates a null email on the identity shape', () => {
      const ctx = createSecurityContext(undefined, { user: { id: 'u1', email: null } });
      expect(ctx.email).toBeUndefined();
      expect(ctx.userId).toBe('u1');
    });
  });

  describe('secret redaction', () => {
    it('redacts sensitive metadata keys on the console line', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_FAILURE,
        success: false,
        message: 'login failed',
        context: { metadata: { password: 'hunter2', token: 'abc123' } },
      });

      const payload = lastLoggedPayload('error');
      const loggedMeta = metadata(meta(payload));
      expect(loggedMeta.password).toBe('[REDACTED]');
      expect(loggedMeta.token).toBe('[REDACTED]');
    });

    it('redacts nested metadata objects', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.PAYMENT,
        action: SecurityEventAction.WEBHOOK_RECEIVED,
        success: true,
        message: 'webhook',
        context: { metadata: { outer: { apiKey: 'sk_live_x', safe: 'ok' } } },
      });

      const outer = metadata(meta(lastLoggedPayload('info'))).outer as Record<string, unknown>;
      expect(outer.apiKey).toBe('[REDACTED]');
      expect(outer.safe).toBe('ok');
    });

    it('masks the email on the console line', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_SUCCESS,
        success: true,
        message: 'ok',
        context: { email: 'victim@example.com' },
      });

      expect(meta(lastLoggedPayload('info')).email).toBe('vi***@example.com');
    });
  });

  describe('severity routing', () => {
    it('sends a cross-tenant block to console.error as critical', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTHZ,
        action: SecurityEventAction.CROSS_TENANT_BLOCKED,
        success: false,
        message: 'blocked',
        context: {},
      });

      expect(lastLoggedPayload('error').level).toBe('critical');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('sends a successful login to console.log as info', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_SUCCESS,
        success: true,
        message: 'ok',
        context: {},
      });

      expect(lastLoggedPayload('info').level).toBe('info');
    });

    it('sends a webhook signature failure to console.error', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.PAYMENT,
        action: SecurityEventAction.WEBHOOK_SIGNATURE_INVALID,
        success: false,
        message: 'bad signature',
        context: {},
      });

      expect(lastLoggedPayload('error').level).toBe('critical');
    });

    it('keeps info events off console.log, which production builds strip', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_SUCCESS,
        success: true,
        message: 'ok',
        context: {},
      });

      // `compiler.removeConsole` in next.config.ts deletes `console.log` from
      // production bundles. Routing info here would make LOGIN_SUCCESS,
      // PAYMENT_CAPTURED and every SUBSCRIPTION_* event invisible in prod.
      expect(console.log).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(lastLoggedPayload('info').level).toBe('info');
    });

    it('emits exactly one line per event', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.PAYMENT,
        action: SecurityEventAction.PAYMENT_CAPTURED,
        success: true,
        message: 'captured',
        context: {},
      });
      // No duplicate on stdout/stderr — a doubled audit line misleads counting.
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('terminates the stderr line with a newline so entries stay parseable', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.PAYMENT,
        action: SecurityEventAction.PAYMENT_CAPTURED,
        success: true,
        message: 'captured',
        context: {},
      });
      expect(String(stderrSpy.mock.calls[0][0])).toMatch(/\n$/);
    });

    it('keeps redaction and masking on the stderr channel', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_SUCCESS,
        success: true,
        message: 'ok',
        context: { email: 'victim@example.com', metadata: { password: 'hunter2' } },
      });

      const line = String(stderrSpy.mock.calls[0][0]);
      expect(line).not.toContain('hunter2');
      expect(line).not.toContain('victim@example.com');
      expect(line).toContain('[REDACTED]');
      expect(line).toContain('vi***@example.com');
    });
  });

  describe('audit persistence', () => {
    beforeEach(() => {
      process.env.ENABLE_AUDIT_LOG = 'true';
    });

    it('does not persist raw secrets — the stored metadata is redacted', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_FAILURE,
        success: false,
        message: 'login failed',
        context: { metadata: { password: 'hunter2', attempt: 2 } },
      });

      expect(prismaMocks.auditLog.create).toHaveBeenCalledTimes(1);
      const stored = prismaMocks.auditLog.create.mock.calls[0][0].data;

      // The durable store must not be the one place a plaintext password survives.
      expect(JSON.stringify(stored.metadata)).not.toContain('hunter2');
      expect(stored.metadata.password).toBe('[REDACTED]');
      // Non-sensitive metadata is still preserved for investigation.
      expect(stored.metadata.attempt).toBe(2);
    });

    it('stores a masked email, not the raw address', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_SUCCESS,
        success: true,
        message: 'ok',
        context: { email: 'victim@example.com', organizationId: 'org_1' },
      });

      const stored = prismaMocks.auditLog.create.mock.calls[0][0].data;
      expect(stored.metadata.email).toBe('vi***@example.com');
      expect(JSON.stringify(stored.metadata)).not.toContain('victim@example.com');
    });

    it('omits undefined members so Prisma does not reject the row', async () => {
      await logSecurityEvent({
        category: SecurityEventCategory.SYSTEM,
        action: SecurityEventAction.CONFIG_ERROR,
        success: false,
        message: 'bad config',
        context: {},
      });

      const stored = prismaMocks.auditLog.create.mock.calls[0][0].data;
      for (const [key, value] of Object.entries(stored.metadata)) {
        expect(value).not.toBeUndefined();
        expect(key).not.toContain('undefined');
      }
    });

    it('does not write an audit row when auditing is disabled', async () => {
      vi.stubEnv('ENABLE_AUDIT_LOG', '');
      vi.stubEnv('NODE_ENV', 'test');

      await logSecurityEvent({
        category: SecurityEventCategory.AUTH,
        action: SecurityEventAction.LOGIN_SUCCESS,
        success: true,
        message: 'ok',
        context: {},
      });

      expect(prismaMocks.auditLog.create).not.toHaveBeenCalled();
    });

    it('still emits a console line when the audit write fails', async () => {
      prismaMocks.auditLog.create.mockRejectedValue(new Error('db down'));

      await expect(
        logSecurityEvent({
          category: SecurityEventCategory.AUTH,
          action: SecurityEventAction.LOGIN_SUCCESS,
          success: true,
          message: 'ok',
          context: {},
        })
      ).resolves.toBeUndefined();

      // A failing audit sink must not swallow the event itself.
      expect(stderrSpy).toHaveBeenCalled();
    });
  });
});