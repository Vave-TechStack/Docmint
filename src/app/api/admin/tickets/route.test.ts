import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    supportTicket: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    supportTicketReply: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET, PATCH } from './route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const USER_SESSION = { user: { id: 'user_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } };

function patch(body: unknown, origin = 'http://localhost:3000'): Promise<Response> {
  return PATCH(
    new NextRequest('http://localhost:3000/api/admin/tickets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    })
  );
}

function get(query = ''): Promise<Response> {
  return GET(new NextRequest(`http://localhost:3000/api/admin/tickets${query}`));
}

describe('/api/admin/tickets', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.supportTicket.findMany.mockResolvedValue([]);
    prismaMocks.supportTicket.count.mockResolvedValue(0);
    prismaMocks.supportTicket.findFirst.mockResolvedValue({ id: 'tkt_1', organizationId: 'org_A' });
    prismaMocks.supportTicket.update.mockResolvedValue({});
    prismaMocks.supportTicketReply.create.mockResolvedValue({});
  });

  // ─── GET ───────────────────────────────────────────────────

  describe('GET authorization', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      const res = await get();
      expect(res.status).toBe(401);
      expect(prismaMocks.supportTicket.findMany).not.toHaveBeenCalled();
    });

    it('rejects a non-admin', async () => {
      authMocks.auth.mockResolvedValue(USER_SESSION);
      const res = await get();
      expect(res.status).toBe(403);
      expect(prismaMocks.supportTicket.findMany).not.toHaveBeenCalled();
    });
  });

  describe('GET tenant scoping', () => {
    it('scopes the ticket list to the caller organization', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await get();
      const where = prismaMocks.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org_A');
    });

    it('lets a super admin list platform-wide', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      await get();
      const where = prismaMocks.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBeUndefined();
    });

    it('clamps an oversized pageSize', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await get('?pageSize=99999');
      expect(prismaMocks.supportTicket.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
    });

    it('drops an unknown status filter rather than querying it', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await get('?status=NOPE');
      const where = prismaMocks.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.status).toBeUndefined();
    });
  });

  // ─── PATCH ─────────────────────────────────────────────────

  describe('PATCH authorization', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      const res = await patch({ ticketId: 'tkt_1', status: 'CLOSED' });
      expect(res.status).toBe(401);
      expect(prismaMocks.supportTicket.update).not.toHaveBeenCalled();
    });

    it('rejects a cross-origin request (CSRF)', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ ticketId: 'tkt_1', status: 'CLOSED' }, 'https://evil.example');
      expect(res.status).toBe(403);
      expect(prismaMocks.supportTicket.update).not.toHaveBeenCalled();
    });
  });

  describe('PATCH cross-tenant IDOR', () => {
    it('resolves the ticket within the caller scope', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await patch({ ticketId: 'tkt_1', status: 'CLOSED' });
      const where = prismaMocks.supportTicket.findFirst.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org_A');
      expect(where.id).toBe('tkt_1');
    });

    it('404s instead of updating a ticket in another tenant', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.supportTicket.findFirst.mockResolvedValue(null); // not visible in org_A

      const res = await patch({ ticketId: 'tkt_other', status: 'CLOSED' });

      expect(res.status).toBe(404);
      expect(prismaMocks.supportTicket.update).not.toHaveBeenCalled();
    });

    it('404s instead of replying to a ticket in another tenant', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.supportTicket.findFirst.mockResolvedValue(null);

      const res = await patch({ ticketId: 'tkt_other', reply: 'sneaky' });

      expect(res.status).toBe(404);
      expect(prismaMocks.supportTicketReply.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH validation', () => {
    it('rejects an unknown status enum', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ ticketId: 'tkt_1', status: 'DESTROYED' });
      expect(res.status).toBe(400);
      expect(prismaMocks.supportTicket.update).not.toHaveBeenCalled();
    });

    it('rejects a request with nothing to change', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ ticketId: 'tkt_1' });
      expect(res.status).toBe(400);
      expect(prismaMocks.supportTicket.update).not.toHaveBeenCalled();
    });

    it('rejects a missing ticketId with 400, not 500', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ status: 'CLOSED' });
      expect(res.status).toBe(400);
    });

    it('sets resolvedAt when the status becomes RESOLVED', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await patch({ ticketId: 'tkt_1', status: 'RESOLVED' });
      const data = prismaMocks.supportTicket.update.mock.calls[0][0].data;
      expect(data.status).toBe('RESOLVED');
      expect(data.resolvedAt).toBeInstanceOf(Date);
    });
  });
});
