import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    template: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET } from './route';
import { PATCH, DELETE } from './[id]/route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const USER_SESSION = { user: { id: 'user_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } };

const OWN_TEMPLATE = { id: 'tpl_1', organizationId: 'org_A', name: 'Mine', isPremium: false, visibility: 'PRIVATE' };
const OTHER_TEMPLATE = { id: 'tpl_2', organizationId: 'org_B', name: 'Theirs', isPremium: false, visibility: 'PRIVATE' };
const PLATFORM_TEMPLATE = { id: 'tpl_3', organizationId: null, name: 'Seeded', isPremium: false, visibility: 'PUBLIC' };

function get(query = ''): Promise<Response> {
  return GET(new NextRequest(`http://localhost:3000/api/admin/templates${query}`));
}

function req(method: string, body?: unknown, origin = 'http://localhost:3000'): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/templates/tpl_1', {
    method,
    headers: { 'content-type': 'application/json', origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'tpl_1' });

describe('/api/admin/templates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.template.findMany.mockResolvedValue([]);
    prismaMocks.template.count.mockResolvedValue(0);
    prismaMocks.template.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.template.findUnique.mockResolvedValue(OWN_TEMPLATE);
    prismaMocks.auditLog.create.mockResolvedValue({});
  });

  describe('GET scoping', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await get()).status).toBe(401);
    });

    it('rejects a non-admin', async () => {
      authMocks.auth.mockResolvedValue(USER_SESSION);
      expect((await get()).status).toBe(403);
    });

    // Template.organizationId is nullable; a tenant admin must see own-org plus
    // platform rows, never another tenant's PRIVATE templates.
    it('restricts a tenant admin to own-org and platform templates', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await get();
      const where = prismaMocks.template.findMany.mock.calls[0][0].where as { OR: unknown[] };
      expect(where.OR).toEqual([{ organizationId: 'org_A' }, { organizationId: null }]);
    });

    it('keeps the platform-wide view for a super admin', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      await get();
      const where = prismaMocks.template.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where.OR).toBeUndefined();
    });

    it('preserves the org restriction when combined with a search', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await get('?search=payslip');
      const where = prismaMocks.template.findMany.mock.calls[0][0].where as { AND: unknown[] };
      expect(where.AND).toBeDefined();
      expect(JSON.stringify(where.AND[0])).toContain('org_A');
    });

    it('drops an unknown visibility filter', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await get('?visibility=NOPE');
      const where = prismaMocks.template.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where.visibility).toBeUndefined();
    });

    it('clamps an oversized pageSize', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await get('?pageSize=100000');
      expect(prismaMocks.template.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
    });
  });

  describe('PATCH', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await PATCH(req('PATCH', { isActive: false }), { params })).status).toBe(401);
    });

    it('rejects a cross-origin request (CSRF)', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await PATCH(req('PATCH', { isActive: false }, 'https://evil.example'), { params });
      expect(res.status).toBe(403);
      expect(prismaMocks.template.updateMany).not.toHaveBeenCalled();
    });

    it('forbids a tenant admin from editing another tenant template', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.template.findUnique.mockResolvedValue(OTHER_TEMPLATE);
      const res = await PATCH(req('PATCH', { isActive: false }), { params });
      expect(res.status).toBe(403);
      expect(prismaMocks.template.updateMany).not.toHaveBeenCalled();
    });

    // Publishing a platform template exposes it to every tenant.
    it('forbids a tenant admin from flipping a platform template', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.template.findUnique.mockResolvedValue(PLATFORM_TEMPLATE);
      const res = await PATCH(req('PATCH', { mode: 'premium' }), { params });
      expect(res.status).toBe(403);
      expect(prismaMocks.template.updateMany).not.toHaveBeenCalled();
    });

    it('allows a super admin to edit a platform template', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      prismaMocks.template.findUnique.mockResolvedValue(PLATFORM_TEMPLATE);
      const res = await PATCH(req('PATCH', { mode: 'premium' }), { params });
      expect(res.status).toBe(200);
    });

    it('404s for a missing template', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.template.findUnique.mockResolvedValue(null);
      expect((await PATCH(req('PATCH', { isActive: false }), { params })).status).toBe(404);
    });

    it('rejects an arbitrary visibility string instead of writing it to the enum', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await PATCH(req('PATCH', { visibility: { $ne: null } }), { params });
      expect(res.status).toBe(400);
      expect(prismaMocks.template.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean isPremium', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      expect((await PATCH(req('PATCH', { isPremium: 'yes' }), { params })).status).toBe(400);
    });

    it('rejects a body with no recognised fields', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      expect((await PATCH(req('PATCH', { junk: 1 }), { params })).status).toBe(400);
    });

    it('keeps a premium template PUBLIC', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await PATCH(req('PATCH', { isPremium: true, visibility: 'PRIVATE' }), { params });
      const data = prismaMocks.template.updateMany.mock.calls[0][0].data;
      expect(data.visibility).toBe('PUBLIC');
    });
  });

  describe('DELETE', () => {
    it('deactivates rather than hard-deleting', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await DELETE(req('DELETE'), { params });
      expect(prismaMocks.template.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } })
      );
    });

    it('forbids a tenant admin from deactivating a platform template', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.template.findUnique.mockResolvedValue(PLATFORM_TEMPLATE);
      const res = await DELETE(req('DELETE'), { params });
      expect(res.status).toBe(403);
      expect(prismaMocks.template.updateMany).not.toHaveBeenCalled();
    });

    it('forbids a tenant admin from deactivating another tenant template', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.template.findUnique.mockResolvedValue(OTHER_TEMPLATE);
      expect((await DELETE(req('DELETE'), { params })).status).toBe(403);
    });
  });
});
