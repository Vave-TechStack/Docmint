import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * These tests pin the DB-revalidation behaviour of the shared guards: the JWT
 * carries a role/org snapshot, and without a database read on each request a
 * suspended, deleted or demoted account keeps its privileges until the token
 * happens to expire.
 */

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    subscription: { findMany: vi.fn(), count: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { requireAdmin, requireSuperAdmin, requireAuth, __clearRevalidationCache } from '@/lib/security/authorization';
import { GET as subscriptionsGET } from './subscriptions/route';

const REQ = new NextRequest('http://localhost:3000/api/admin/subscriptions');

/** A DB row that looks healthy. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    isActive: true,
    role: 'ADMIN',
    organizationId: 'org_A',
    organization: { status: 'ACTIVE' },
    passwordVersion: 0,
    ...overrides,
  };
}

/** A JWT that still claims ADMIN/org_A after the account was revoked. */
const STALE_ADMIN_TOKEN = {
  user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 },
};

describe('authorization DB revalidation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The cache is process-wide, so it must be cleared between tests or one
    // test's result would be replayed for the next.
    __clearRevalidationCache();
    prismaMocks.subscription.findMany.mockResolvedValue([]);
    prismaMocks.subscription.count.mockResolvedValue(0);
  });

  // ── The vulnerability ──────────────────────────────────────
  describe('stale token no longer grants access', () => {
    it('rejects a suspended user even though the token says ADMIN', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ isActive: false }));

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(false);
      expect(guard.ok === false && guard.response.status).toBe(401);
    });

    it('rejects a soft-deleted user', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      // `findFirst` filters `deletedAt: null`, so a deleted row returns null.
      prismaMocks.user.findFirst.mockResolvedValue(null);

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(false);
      expect(guard.ok === false && guard.response.status).toBe(401);
    });

    it('rejects a user whose organization is suspended', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(
        row({ organization: { status: 'SUSPENDED' } })
      );

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(false);
    });

    it('rejects a user whose organization was deleted', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ organization: { status: 'DELETED' } }));

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(false);
    });

    // The point of revalidation: the DB is the authority, not the token.
    it('uses the database role, not the token role, for a demoted admin', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ role: 'USER' }));

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(false);
      expect(guard.ok === false && guard.response.status).toBe(403);
    });

    it('does not let a token claiming ADMIN reach super-admin routes after demotion', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ role: 'USER' }));

      const guard = await requireSuperAdmin(REQ);
      expect(guard.ok).toBe(false);
    });

    it('scopes to the database organization, not the stale token organization', async () => {
      // Token still says org_A; the user was actually moved to org_B.
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ organizationId: 'org_B' }));

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(true);
      expect(guard.ok === true && guard.guard.organizationId).toBe('org_B');
    });
  });

  // ── Fail closed ────────────────────────────────────────────
  describe('fails closed', () => {
    it('rejects rather than trusting the token when the DB read throws', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockRejectedValue(new Error('db down'));

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(false);
      expect(guard.ok === false && guard.response.status).toBe(403);
    });

    it('rejects when a session has no resolvable user id', async () => {
      authMocks.auth.mockResolvedValue({ user: { id: '', passwordVersion: 0 } });
      const guard = await requireAuth(REQ);
      expect(guard.ok).toBe(false);
      expect(guard.ok === false && guard.response.status).toBe(401);
    });

    it('does not query the database for an unauthenticated request', async () => {
      authMocks.auth.mockResolvedValue(null);
      await requireAdmin(REQ);
      expect(prismaMocks.user.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── Scope integrity ────────────────────────────────────────
  describe('scope integrity', () => {
    it('refuses a non-super-admin with no organization', async () => {
      authMocks.auth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', organizationId: null, passwordVersion: 0 } });
      prismaMocks.user.findFirst.mockResolvedValue(row({ organizationId: null }));

      const guard = await requireAdmin(REQ);
      expect(guard.ok).toBe(false);
      expect(guard.ok === false && guard.response.status).toBe(403);
    });

    it('keeps a super admin platform-wide', async () => {
      authMocks.auth.mockResolvedValue({ user: { id: 's1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } });
      prismaMocks.user.findFirst.mockResolvedValue(row({ role: 'SUPER_ADMIN' }));

      const guard = await requireAdmin(REQ);
      expect(guard.ok === true && guard.guard.organizationId).toBeNull();
      expect(guard.ok === true && guard.guard.isSuperAdmin).toBe(true);
    });

    it('honours ?organizationId= narrowing for a super admin only', async () => {
      authMocks.auth.mockResolvedValue({ user: { id: 's1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } });
      prismaMocks.user.findFirst.mockResolvedValue(row({ role: 'SUPER_ADMIN' }));

      const guard = await requireAdmin(
        new NextRequest('http://localhost:3000/api/admin/subscriptions?organizationId=org_ZZZZZZ')
      );
      expect(guard.ok === true && guard.guard.organizationId).toBe('org_ZZZZZZ');
    });

    it('ignores ?organizationId= from a plain ADMIN (no scope widening)', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row());

      const guard = await requireAdmin(
        new NextRequest('http://localhost:3000/api/admin/subscriptions?organizationId=org_EVIL1')
      );
      expect(guard.ok === true && guard.guard.organizationId).toBe('org_A');
    });
  });

  // ── End-to-end through a route ─────────────────────────────
  describe('through a guarded route', () => {
    it('a suspended admin gets 401 and no data', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ isActive: false }));

      const res = await subscriptionsGET(REQ);
      expect(res.status).toBe(401);
      expect(prismaMocks.subscription.findMany).not.toHaveBeenCalled();
    });

    it('a demoted admin cannot list subscriptions', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ role: 'USER' }));

      const res = await subscriptionsGET(REQ);
      expect(res.status).toBe(403);
      expect(prismaMocks.subscription.findMany).not.toHaveBeenCalled();
    });

    it('a moved admin is scoped to the new organization, not the stale token org', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row({ organizationId: 'org_B' }));

      const res = await subscriptionsGET(REQ);
      expect(res.status).toBe(200);
      expect(prismaMocks.subscription.findMany.mock.calls[0][0].where.organizationId).toBe('org_B');
    });
  });

  // ── Cache behaviour ────────────────────────────────────────
  describe('revalidation cache', () => {
    it('serves a repeat request from cache without another DB read', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row());

      await requireAdmin(REQ);
      await requireAdmin(REQ);
      await requireAdmin(REQ);

      expect(prismaMocks.user.findFirst).toHaveBeenCalledTimes(1);
    });

    it('re-reads the database after the cache is cleared', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row());

      await requireAdmin(REQ);
      expect(prismaMocks.user.findFirst).toHaveBeenCalledTimes(1);

      __clearRevalidationCache();
      await requireAdmin(REQ);
      expect(prismaMocks.user.findFirst).toHaveBeenCalledTimes(2);
    });

    it('does not cache across different users', async () => {
      authMocks.auth.mockResolvedValue(STALE_ADMIN_TOKEN);
      prismaMocks.user.findFirst.mockResolvedValue(row());
      await requireAdmin(REQ);

      authMocks.auth.mockResolvedValue({ user: { id: 'admin_2', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } });
      prismaMocks.user.findFirst.mockResolvedValue(row());
      await requireAdmin(REQ);

      expect(prismaMocks.user.findFirst).toHaveBeenCalledTimes(2);
    });
  });
});
