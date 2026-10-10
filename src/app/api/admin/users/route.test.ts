import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET, PATCH } from './route';

function patch(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/admin/users', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(request);
}

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_ADMIN_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };

describe('PATCH /api/admin/users', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.user.update.mockResolvedValue({});
    prismaMocks.auditLog.create.mockResolvedValue({});
  });

  it('rejects unauthenticated requests', async () => {
    authMocks.auth.mockResolvedValue(null);
    const res = await patch({ userId: 'u_1', action: 'suspend' });
    expect(res.status).toBe(401);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('blocks an ADMIN from acting on a user in another organization', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'u_1',
      organizationId: 'org_B', // different tenant
      role: 'USER',
    });

    const res = await patch({ userId: 'u_1', action: 'suspend' });
    expect(res.status).toBe(403);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('blocks an ADMIN from acting on another admin', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'u_1',
      organizationId: 'org_A',
      role: 'ADMIN',
    });

    const res = await patch({ userId: 'u_1', action: 'suspend' });
    expect(res.status).toBe(403);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('allows an ADMIN to suspend a regular user in their own org', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'u_1',
      organizationId: 'org_A',
      role: 'USER',
    });

    const res = await patch({ userId: 'u_1', action: 'suspend' });
    expect(res.status).toBe(200);
    expect(prismaMocks.user.update).toHaveBeenCalledWith({
      where: { id: 'u_1' },
      data: { isActive: false },
    });
  });

  it('restricts role changes to SUPER_ADMIN', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'u_1',
      organizationId: 'org_A',
      role: 'USER',
    });

    const res = await patch({ userId: 'u_1', action: 'make_admin' });
    expect(res.status).toBe(403);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('lets a SUPER_ADMIN promote across orgs', async () => {
    authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'u_1',
      organizationId: 'org_B',
      role: 'USER',
    });

    const res = await patch({ userId: 'u_1', action: 'make_admin' });
    expect(res.status).toBe(200);
    expect(prismaMocks.user.update).toHaveBeenCalledWith({
      where: { id: 'u_1' },
      data: { role: 'ADMIN' },
    });
  });
});

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.user.findMany.mockResolvedValue([]);
    prismaMocks.user.count.mockResolvedValue(0);
  });

  function get(query = ''): Promise<Response> {
    return GET(new NextRequest(`http://localhost:3000/api/admin/users${query}`));
  }

  it('rejects unauthenticated requests', async () => {
    authMocks.auth.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(prismaMocks.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects a non-admin with 403', async () => {
    authMocks.auth.mockResolvedValue({ user: { id: 'u_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } });
    expect((await get()).status).toBe(403);
  });

  // The user list previously never mentioned organizationId, so a tenant
  // admin's list returned every user on the platform (names, emails, mobiles,
  // org names, subscription state).
  it('pins the query to the ADMIN own organization', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get();
    expect(prismaMocks.user.findMany.mock.calls[0][0].where.organizationId).toBe('org_A');
  });

  it('lets a SUPER_ADMIN list platform-wide by default', async () => {
    authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
    await get();
    expect(prismaMocks.user.findMany.mock.calls[0][0].where.organizationId).toBeUndefined();
  });

  it('lets a SUPER_ADMIN narrow to one org', async () => {
    authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
    await get('?organizationId=org_ZZZZZZ');
    expect(prismaMocks.user.findMany.mock.calls[0][0].where.organizationId).toBe('org_ZZZZZZ');
  });

  it('ignores a malformed organizationId rather than widening scope', async () => {
    authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
    await get(`?organizationId=${encodeURIComponent("' OR 1=1--")}`);
    expect(prismaMocks.user.findMany.mock.calls[0][0].where.organizationId).toBeUndefined();
  });

  // The org scope must survive a search filter, which overwrites the same object.
  it('keeps the org restriction when a search term is supplied', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get('?search=acme');
    const where = prismaMocks.user.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org_A');
    expect(where.OR).toBeDefined();
  });

  it('clamps an oversized pageSize', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get('?pageSize=1000000');
    expect(prismaMocks.user.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
  });

  it('falls back to page 1 for a non-numeric page', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get('?page=abc');
    const skip = prismaMocks.user.findMany.mock.calls[0][0].skip;
    expect(skip).toBe(0);
    expect(Number.isNaN(skip)).toBe(false);
  });

  it('drops an unknown role filter instead of querying for it', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    await get('?role=WIZARD');
    expect(prismaMocks.user.findMany.mock.calls[0][0].where.role).toBeUndefined();
  });
});

describe('PATCH /api/admin/users CSRF', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.user.findUnique.mockResolvedValue({ id: 'u_1', organizationId: 'org_A', role: 'USER' });
    prismaMocks.user.update.mockResolvedValue({});
    prismaMocks.auditLog.create.mockResolvedValue({});
  });

  it('rejects a cross-origin suspend', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    const request = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ userId: 'u_1', action: 'suspend' }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(403);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rejects a cross-site fetch without an Origin header', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    const request = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ userId: 'u_1', action: 'suspend' }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(403);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rejects a sandboxed null Origin', async () => {
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    const request = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'null' },
      body: JSON.stringify({ userId: 'u_1', action: 'suspend' }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(403);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });
});
