import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    systemSetting: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET, PUT, DELETE } from './route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };

function req(method: string, body?: unknown, query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/admin/settings${query}`, {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/admin/settings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.systemSetting.findMany.mockResolvedValue([]);
    prismaMocks.systemSetting.upsert.mockResolvedValue({});
    prismaMocks.systemSetting.deleteMany.mockResolvedValue({ count: 1 });
    prismaMocks.auditLog.create.mockResolvedValue({});
  });

  // SystemSetting is a GLOBAL table (no organizationId), so every verb is
  // platform-level. Tenant ADMINs were previously allowed to read and write it.
  describe('privilege boundary', () => {
    it('GET denies a tenant ADMIN', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await GET(req('GET'));
      expect(res.status).toBe(403);
      expect(prismaMocks.systemSetting.findMany).not.toHaveBeenCalled();
    });

    it('PUT denies a tenant ADMIN', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await PUT(req('PUT', { key: 'smtp_password', value: 'pwned' }));
      expect(res.status).toBe(403);
      expect(prismaMocks.systemSetting.upsert).not.toHaveBeenCalled();
    });

    it('DELETE denies a tenant ADMIN', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await DELETE(req('DELETE', undefined, '?key=x'));
      expect(res.status).toBe(403);
      expect(prismaMocks.systemSetting.deleteMany).not.toHaveBeenCalled();
    });

    it('GET allows a SUPER_ADMIN', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      const res = await GET(req('GET'));
      expect(res.status).toBe(200);
      expect(prismaMocks.systemSetting.findMany).toHaveBeenCalled();
    });
  });

  describe('unauthenticated', () => {
    it('returns 401 for GET', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await GET(req('GET'))).status).toBe(401);
    });

    it('returns 401 for PUT', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await PUT(req('PUT', { key: 'a', value: 1 }))).status).toBe(401);
    });
  });

  describe('PUT validation', () => {
    it('rejects a cross-origin write (CSRF)', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      const request = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ key: 'k', value: 1 }),
      });
      const res = await PUT(request);
      expect(res.status).toBe(403);
      expect(prismaMocks.systemSetting.upsert).not.toHaveBeenCalled();
    });

    it('rejects a missing key', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      const res = await PUT(req('PUT', { value: 1 }));
      expect(res.status).toBe(400);
      expect(prismaMocks.systemSetting.upsert).not.toHaveBeenCalled();
    });

    it('rejects a missing value', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      const res = await PUT(req('PUT', { key: 'k' }));
      expect(res.status).toBe(400);
    });

    it('stores a valid setting and audits it', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      const res = await PUT(req('PUT', { key: 'site_name', value: 'DocMint' }));
      expect(res.status).toBe(200);
      expect(prismaMocks.systemSetting.upsert).toHaveBeenCalled();
      expect(prismaMocks.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('404s when the key does not exist instead of throwing', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      prismaMocks.systemSetting.deleteMany.mockResolvedValue({ count: 0 });
      const res = await DELETE(req('DELETE', undefined, '?key=missing'));
      expect(res.status).toBe(404);
    });

    it('requires a key', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      const res = await DELETE(req('DELETE'));
      expect(res.status).toBe(400);
    });
  });
});
