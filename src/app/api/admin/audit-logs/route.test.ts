import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET } from './route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const USER_SESSION = { user: { id: 'user_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } };

function get(query = ''): Promise<Response> {
  return GET(new NextRequest(`http://localhost:3000/api/admin/audit-logs${query}`));
}

describe('GET /api/admin/audit-logs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.auditLog.findMany.mockResolvedValue([]);
    prismaMocks.auditLog.count.mockResolvedValue(0);
  });

  it('rejects unauthenticated requests', async () => {
    authMocks.auth.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(prismaMocks.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('rejects a non-admin', async () => {
    authMocks.auth.mockResolvedValue(USER_SESSION);
    expect((await get()).status).toBe(403);
  });

  // Audit rows embed the acting user's email and org name, so an unscoped list
  // leaked another tenant's staff directory through the audit trail.
  it('scopes the audit trail to the caller organization', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get();
    expect(prismaMocks.auditLog.findMany.mock.calls[0][0].where.organizationId).toBe('org_A');
  });

  it('keeps the platform-wide view for a super admin', async () => {
    authMocks.auth.mockResolvedValue(SUPER_SESSION);
    await get();
    expect(prismaMocks.auditLog.findMany.mock.calls[0][0].where.organizationId).toBeUndefined();
  });

  it('clamps an oversized pageSize', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get('?pageSize=100000');
    expect(prismaMocks.auditLog.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
  });

  it('falls back to page 1 for a non-numeric page', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get('?page=abc');
    const skip = prismaMocks.auditLog.findMany.mock.calls[0][0].skip;
    expect(Number.isNaN(skip)).toBe(false);
    expect(skip).toBe(0);
  });

  it('keeps the org scope when an action filter is applied', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get('?action=USER_SUSPENDED');
    const where = prismaMocks.auditLog.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org_A');
    expect(where.action).toBe('USER_SUSPENDED');
  });
});
