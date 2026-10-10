import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    document: { count: vi.fn(), groupBy: vi.fn() },
    payment: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    subscription: { count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET as dashboardGET } from './dashboard/route';
import { GET as revenueGET } from './revenue/route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const USER_SESSION = { user: { id: 'user_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } };

function req(path: string, query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/admin/${path}${query}`);
}

function whereOf(mock: { mock: { calls: unknown[][] } }, index = 0): Record<string, unknown> {
  return (mock.mock.calls[index]?.[0] as { where: Record<string, unknown> }).where;
}

describe('admin analytics tenant scoping', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.user.count.mockResolvedValue(0);
    prismaMocks.user.findMany.mockResolvedValue([]);
    prismaMocks.document.count.mockResolvedValue(0);
    prismaMocks.document.groupBy.mockResolvedValue([]);
    prismaMocks.payment.aggregate.mockResolvedValue({ _sum: { amount: 0, refundAmount: 0 }, _count: 0 });
    prismaMocks.payment.findMany.mockResolvedValue([]);
    prismaMocks.payment.groupBy.mockResolvedValue([]);
    prismaMocks.payment.count.mockResolvedValue(0);
    prismaMocks.subscription.count.mockResolvedValue(0);
    prismaMocks.subscription.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMocks.subscription.groupBy.mockResolvedValue([]);
  });

  // The dashboard previously ran every count platform-wide and returned a live
  // feed of the newest signups platform-wide (name/email/role).
  describe('GET /api/admin/dashboard', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await dashboardGET(req('dashboard'))).status).toBe(401);
    });

    it('rejects a non-admin', async () => {
      authMocks.auth.mockResolvedValue(USER_SESSION);
      expect((await dashboardGET(req('dashboard'))).status).toBe(403);
      expect(prismaMocks.user.findMany).not.toHaveBeenCalled();
    });

    it('scopes the recentUsers feed to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await dashboardGET(req('dashboard'));
      expect(whereOf(prismaMocks.user.findMany).organizationId).toBe('org_A');
    });

    it('scopes user, document and revenue counts to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await dashboardGET(req('dashboard'));
      expect(whereOf(prismaMocks.user.count).organizationId).toBe('org_A');
      expect(whereOf(prismaMocks.document.count).organizationId).toBe('org_A');
      expect(whereOf(prismaMocks.payment.aggregate).organizationId).toBe('org_A');
    });

    it('scopes the document category breakdown', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await dashboardGET(req('dashboard'));
      expect(whereOf(prismaMocks.document.groupBy).organizationId).toBe('org_A');
    });

    it('keeps the platform-wide view for a super admin', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      await dashboardGET(req('dashboard'));
      expect(whereOf(prismaMocks.user.findMany).organizationId).toBeUndefined();
    });
  });

  // Revenue exposes every competing tenant's earnings; all aggregates are scoped.
  describe('GET /api/admin/revenue', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await revenueGET(req('revenue'))).status).toBe(401);
    });

    it('rejects a non-admin', async () => {
      authMocks.auth.mockResolvedValue(USER_SESSION);
      expect((await revenueGET(req('revenue'))).status).toBe(403);
    });

    it('scopes the total-revenue aggregate to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await revenueGET(req('revenue'));
      expect(whereOf(prismaMocks.payment.aggregate, 0).organizationId).toBe('org_A');
    });

    it('scopes the period-revenue aggregate to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await revenueGET(req('revenue'));
      expect(whereOf(prismaMocks.payment.aggregate, 1).organizationId).toBe('org_A');
    });

    it('scopes the revenue-by-type groupBy to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await revenueGET(req('revenue'));
      expect(whereOf(prismaMocks.payment.groupBy, 0).organizationId).toBe('org_A');
    });

    it('scopes the paying-user conversion groupBy to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await revenueGET(req('revenue'));
      expect(whereOf(prismaMocks.payment.groupBy, 2).organizationId).toBe('org_A');
    });

    it('scopes subscription counts to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await revenueGET(req('revenue'));
      expect(whereOf(prismaMocks.subscription.count, 0).organizationId).toBe('org_A');
    });

    it('keeps the platform-wide view for a super admin', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      await revenueGET(req('revenue'));
      expect(whereOf(prismaMocks.payment.aggregate, 0).organizationId).toBeUndefined();
    });

    it('rejects an unparseable from/to range with 400', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await revenueGET(req('revenue', '?from=not-a-date&to=also-not'));
      expect(res.status).toBe(400);
    });

    it('rejects an inverted from/to range with 400', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await revenueGET(
        req('revenue', '?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z')
      );
      expect(res.status).toBe(400);
    });
  });
});
