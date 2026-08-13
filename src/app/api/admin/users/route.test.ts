import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { PATCH } from './route';

function patch(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/admin/users', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(request);
}

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A' } };
const SUPER_ADMIN_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A' } };

describe('PATCH /api/admin/users', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
