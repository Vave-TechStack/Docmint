import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    coupon: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET, POST, PATCH, DELETE } from './route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const USER_SESSION = { user: { id: 'user_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } };

const VALID = { code: 'SAVE10', discountType: 'PERCENTAGE', discountValue: 10, appliesTo: 'ALL' };

function post(body: unknown, origin = 'http://localhost:3000'): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    })
  );
}

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new NextRequest('http://localhost:3000/api/admin/coupons', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    })
  );
}

function del(query: string): Promise<Response> {
  return DELETE(
    new NextRequest(`http://localhost:3000/api/admin/coupons${query}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost:3000' },
    })
  );
}

describe('/api/admin/coupons', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.coupon.findMany.mockResolvedValue([]);
    prismaMocks.coupon.findUnique.mockResolvedValue(null);
    prismaMocks.coupon.findFirst.mockResolvedValue({ id: 'cpn_1', organizationId: 'org_A' });
    prismaMocks.coupon.create.mockResolvedValue({ id: 'cpn_1' });
    prismaMocks.coupon.update.mockResolvedValue({ id: 'cpn_1' });
  });

  describe('GET scoping', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await GET(new NextRequest('http://localhost:3000/api/admin/coupons'))).status).toBe(401);
    });

    it('rejects a non-admin', async () => {
      authMocks.auth.mockResolvedValue(USER_SESSION);
      expect((await GET(new NextRequest('http://localhost:3000/api/admin/coupons'))).status).toBe(403);
    });

    it('scopes the list to the caller org', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await GET(new NextRequest('http://localhost:3000/api/admin/coupons'));
      expect(prismaMocks.coupon.findMany.mock.calls[0][0].where.organizationId).toBe('org_A');
    });

    it('lets a super admin list platform-wide', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      await GET(new NextRequest('http://localhost:3000/api/admin/coupons'));
      expect(prismaMocks.coupon.findMany.mock.calls[0][0].where.organizationId).toBeUndefined();
    });
  });

  describe('POST coupon minting', () => {
    it('rejects a cross-origin create (CSRF)', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await post(VALID, 'https://evil.example');
      expect(res.status).toBe(403);
      expect(prismaMocks.coupon.create).not.toHaveBeenCalled();
    });

    // A tenant admin must not be able to mint unlimited, all-purchase-type
    // discounts that would apply platform-wide.
    it('forbids a tenant admin from creating a global coupon', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await post({ ...VALID, isGlobal: true });
      expect(res.status).toBe(403);
      expect(prismaMocks.coupon.create).not.toHaveBeenCalled();
    });

    it('ignores a spoofed organizationId in the body and pins it to the guard', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await post({ ...VALID, organizationId: 'org_ATTACKER' });
      const data = prismaMocks.coupon.create.mock.calls[0][0].data;
      expect(data.organizationId).toBe('org_A');
    });

    it('lets a super admin create a global coupon', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      await post({ ...VALID, isGlobal: true });
      expect(prismaMocks.coupon.create.mock.calls[0][0].data.organizationId).toBeNull();
    });
  });

  describe('POST validation', () => {
    beforeEach(() => authMocks.auth.mockResolvedValue(ADMIN_SESSION));

    it('rejects a percentage over 100', async () => {
      const res = await post({ ...VALID, discountValue: 500 });
      expect(res.status).toBe(400);
      expect(prismaMocks.coupon.create).not.toHaveBeenCalled();
    });

    it('rejects a zero discount', async () => {
      expect((await post({ ...VALID, discountValue: 0 })).status).toBe(400);
    });

    it('rejects a negative discount', async () => {
      expect((await post({ ...VALID, discountValue: -50 })).status).toBe(400);
    });

    it('rejects a non-integer discount', async () => {
      expect((await post({ ...VALID, discountValue: 10.5 })).status).toBe(400);
    });

    it('rejects an unknown discountType', async () => {
      expect((await post({ ...VALID, discountType: 'CRYPTO' })).status).toBe(400);
    });

    it('rejects an unknown appliesTo', async () => {
      expect((await post({ ...VALID, appliesTo: 'EVERYTHING' })).status).toBe(400);
    });

    it('rejects a malformed coupon code', async () => {
      expect((await post({ ...VALID, code: "a'; DROP TABLE--" })).status).toBe(400);
    });

    it('rejects expiresAt before startsAt', async () => {
      const res = await post({
        ...VALID,
        startsAt: '2026-02-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
    });

    it('returns 409 for a duplicate code rather than a 500', async () => {
      prismaMocks.coupon.findUnique.mockResolvedValue({ id: 'cpn_existing' });
      const res = await post(VALID);
      expect(res.status).toBe(409);
      expect(prismaMocks.coupon.create).not.toHaveBeenCalled();
    });

    it('accepts a valid coupon', async () => {
      const res = await post(VALID);
      expect(res.status).toBe(200);
      expect(prismaMocks.coupon.create).toHaveBeenCalled();
    });
  });

  describe('PATCH cross-tenant IDOR', () => {
    it('resolves the coupon within the caller scope', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await patch({ id: 'cpn_1', isActive: false });
      const where = prismaMocks.coupon.findFirst.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org_A');
    });

    it('404s instead of toggling another tenant coupon', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.coupon.findFirst.mockResolvedValue(null);
      const res = await patch({ id: 'cpn_other', isActive: false });
      expect(res.status).toBe(404);
      expect(prismaMocks.coupon.update).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean isActive', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ id: 'cpn_1', isActive: 'nope' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('deactivates rather than hard-deletes, and is tenant scoped', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await del('?id=cpn_1');
      expect(res.status).toBe(200);
      expect(prismaMocks.coupon.update).toHaveBeenCalledWith({
        where: { id: 'cpn_1' },
        data: { isActive: false },
      });
    });

    it('404s for another tenant coupon', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.coupon.findFirst.mockResolvedValue(null);
      const res = await del('?id=cpn_other');
      expect(res.status).toBe(404);
      expect(prismaMocks.coupon.update).not.toHaveBeenCalled();
    });

    it('rejects a cross-origin delete (CSRF)', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await DELETE(
        new NextRequest('http://localhost:3000/api/admin/coupons?id=cpn_1', {
          method: 'DELETE',
          headers: { origin: 'https://evil.example' },
        })
      );
      expect(res.status).toBe(403);
    });
  });
});
