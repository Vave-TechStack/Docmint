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

const mockBcryptCompare = vi.hoisted(() => vi.fn());

vi.mock('bcryptjs', () => ({
  default: { compare: mockBcryptCompare },
  compare: mockBcryptCompare,
}));

import { resetRateLimitsForTests } from '@/lib/rate-limit';
import { invalidateUserCache, __clearRevalidationCache } from '@/lib/security/authorization';
import { requireAuth, requireAdmin } from '@/lib/security/authorization';
import { mockRevalidation, primeSessionUser, resetSessionUser } from '@/test/guard-harness';

const USER_ID = 'user-123';
const ORG_ID = 'org-1';

describe('Session Invalidation — Behavioral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    __clearRevalidationCache();
    resetSessionUser();
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'user@example.com', passwordVersion: 0 },
    });
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
  });

  it('rejects session after account suspension (isActive=false in DB)', async () => {
    let result = await requireAuth();
    expect(result.ok).toBe(true);

    invalidateUserCache(USER_ID);
    primeSessionUser({ isActive: false, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    result = await requireAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ success: false, error: 'Account is inactive or no longer exists' });
    }
  });

  it('rejects session after account deletion (findFirst returns null due to deletedAt)', async () => {
    let result = await requireAuth();
    expect(result.ok).toBe(true);

    invalidateUserCache(USER_ID);
    primeSessionUser(null);

    result = await requireAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ success: false, error: 'Account is inactive or no longer exists' });
    }
  });

  it('rejects session after role demotion ADMIN→USER (role from DB, not token)', async () => {
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'ADMIN', email: 'admin@example.com', passwordVersion: 0 },
    });

    let result = await requireAdmin();
    expect(result.ok).toBe(true);

    invalidateUserCache(USER_ID);
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ success: false, error: 'Insufficient permissions' });
    }
  });

  it('accepts session after role promotion USER→ADMIN (new permissions take effect immediately)', async () => {
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'user@example.com', passwordVersion: 0 },
    });

    let result = await requireAdmin();
    expect(result.ok).toBe(false);

    invalidateUserCache(USER_ID);
    primeSessionUser({ isActive: true, role: 'ADMIN', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    result = await requireAdmin();
    expect(result.ok).toBe(true);
  });

  it('rejects session when organization is suspended', async () => {
    let result = await requireAuth();
    expect(result.ok).toBe(true);

    invalidateUserCache(USER_ID);
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'SUSPENDED' }, passwordVersion: 0 });

    result = await requireAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ success: false, error: 'Account is inactive or no longer exists' });
    }
  });
});

describe('Session Invalidation — Password Version Revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    __clearRevalidationCache();
    resetSessionUser();
  });

  it('rejects old JWT after password reset (passwordVersion incremented)', async () => {
    // Initial session with passwordVersion 0
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'user@example.com', passwordVersion: 0 },
    });
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    // First access succeeds
    let result = await requireAuth();
    expect(result.ok).toBe(true);

    // Simulate password reset: DB passwordVersion becomes 1, cache invalidated
    invalidateUserCache(USER_ID);
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 1 });

    // Old JWT (passwordVersion 0) should now be rejected
    result = await requireAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ success: false, error: 'Session revoked: password changed' });
    }
  });

  it('accepts new JWT after password reset (passwordVersion matches)', async () => {
    // New session after password reset with passwordVersion 1
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'user@example.com', passwordVersion: 1 },
    });
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 1 });

    const result = await requireAuth();
    expect(result.ok).toBe(true);
  });

  it('rejects legacy JWT without passwordVersion claim (fail-closed)', async () => {
    // Legacy JWT without passwordVersion (simulated by undefined)
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'user@example.com' }, // no passwordVersion
    });
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    const result = await requireAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ success: false, error: 'Session revoked: password changed' });
    }
  });

  it('does not revoke session on failed reset attempt (passwordVersion unchanged)', async () => {
    // Initial session with passwordVersion 0
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'user@example.com', passwordVersion: 0 },
    });
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    // First access succeeds
    let result = await requireAuth();
    expect(result.ok).toBe(true);

    // Simulate failed reset: DB passwordVersion stays 0, cache invalidated (but version same)
    invalidateUserCache(USER_ID);
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    // Old JWT (passwordVersion 0) should still work because version didn't change
    result = await requireAuth();
    expect(result.ok).toBe(true);
  });

  it('verifies cache invalidation forces revalidation with new passwordVersion', async () => {
    // Initial session with passwordVersion 0
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'user@example.com', passwordVersion: 0 },
    });
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    // First access - cached
    let result = await requireAuth();
    expect(result.ok).toBe(true);
    expect(prismaMocks.user.findFirst).toHaveBeenCalledTimes(1);

    // Second access within TTL - should use cache
    result = await requireAuth();
    expect(result.ok).toBe(true);
    expect(prismaMocks.user.findFirst).toHaveBeenCalledTimes(1); // still 1, cached

    // Password reset: version becomes 1, cache invalidated
    invalidateUserCache(USER_ID);
    primeSessionUser({ isActive: true, role: 'USER', organizationId: ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 1 });

    // Next access - should revalidate and reject old JWT
    result = await requireAuth();
    expect(result.ok).toBe(false);
    expect(prismaMocks.user.findFirst).toHaveBeenCalledTimes(2); // revalidated
  });
});

describe('Session Invalidation — Integration via Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    __clearRevalidationCache();
    resetSessionUser();
    prismaMocks.user.update.mockResolvedValue({});
    prismaMocks.auditLog.create.mockResolvedValue({});
  });

  const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
  const SUPER_ADMIN_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
  const TARGET_USER_ID = 'user_target';
  const TARGET_ORG_ID = 'org_A';

  it('suspended user cannot access protected resources with old session', async () => {
    const { PATCH } = await import('@/app/api/admin/users/route');
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: TARGET_USER_ID,
      organizationId: TARGET_ORG_ID,
      role: 'USER',
    });

    const request = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ userId: TARGET_USER_ID, action: 'suspend' }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(200);

    authMocks.auth.mockResolvedValue({
      user: { id: TARGET_USER_ID, organizationId: TARGET_ORG_ID, role: 'USER', email: 'target@example.com', passwordVersion: 0 },
    });
    primeSessionUser({ isActive: false, role: 'USER', organizationId: TARGET_ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    const { requireAuth: requireAuth2 } = await import('@/lib/security/authorization');
    const result = await requireAuth2();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it('deleted user cannot access protected resources with old session', async () => {
    const { PATCH } = await import('@/app/api/admin/users/route');
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    authMocks.auth.mockResolvedValue(ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: TARGET_USER_ID,
      organizationId: TARGET_ORG_ID,
      role: 'USER',
    });

    const request = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ userId: TARGET_USER_ID, action: 'delete' }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(200);

    authMocks.auth.mockResolvedValue({
      user: { id: TARGET_USER_ID, organizationId: TARGET_ORG_ID, role: 'USER', email: 'target@example.com', passwordVersion: 0 },
    });
    primeSessionUser(null);

    const { requireAuth: requireAuth2 } = await import('@/lib/security/authorization');
    const result = await requireAuth2();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it('demoted admin loses admin access immediately with old session', async () => {
    const { PATCH } = await import('@/app/api/admin/users/route');
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: TARGET_USER_ID,
      organizationId: TARGET_ORG_ID,
      role: 'ADMIN',
    });

    const request = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ userId: TARGET_USER_ID, action: 'make_user' }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(200);

    authMocks.auth.mockResolvedValue({
      user: { id: TARGET_USER_ID, organizationId: TARGET_ORG_ID, role: 'ADMIN', email: 'target@example.com', passwordVersion: 0 },
    });
    primeSessionUser({ isActive: true, role: 'USER', organizationId: TARGET_ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    const { requireAdmin: requireAdmin2 } = await import('@/lib/security/authorization');
    const result = await requireAdmin2();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it('promoted user gains admin access immediately with old session', async () => {
    const { PATCH } = await import('@/app/api/admin/users/route');
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
    prismaMocks.user.findUnique.mockResolvedValue({
      id: TARGET_USER_ID,
      organizationId: TARGET_ORG_ID,
      role: 'USER',
    });

    const request = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ userId: TARGET_USER_ID, action: 'make_admin' }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(200);

    authMocks.auth.mockResolvedValue({
      user: { id: TARGET_USER_ID, organizationId: TARGET_ORG_ID, role: 'USER', email: 'target@example.com', passwordVersion: 0 },
    });
    primeSessionUser({ isActive: true, role: 'ADMIN', organizationId: TARGET_ORG_ID, organization: { status: 'ACTIVE' }, passwordVersion: 0 });

    const { requireAdmin: requireAdmin2 } = await import('@/lib/security/authorization');
    const result = await requireAdmin2();
    expect(result.ok).toBe(true);
  });
});