import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { resolveOptionalScope, __clearRevalidationCache } from '@/lib/security/authorization';
import { mockRevalidation, primeSessionUser, resetSessionUser } from '@/test/guard-harness';

/**
 * Regression tests for `resolveOptionalScope`.
 *
 * This helper was added because `/api/templates/[id]/download`,
 * `/api/templates/[id]` and `/api/templates` read `session.user.role` and
 * `session.user.organizationId` straight off the JWT. `src/lib/auth.ts` sets
 * `session: { strategy: 'jwt' }` with no `maxAge`, so the Auth.js default
 * 30-day token lifetime applies — a demoted admin kept the premium paywall
 * bypass (the admin branch skips the subscription check entirely) and a user
 * moved between organizations kept reading their previous tenant's PRIVATE
 * templates, for up to a month, with no credentials needed.
 *
 * The contract under test: role and organization come from the DATABASE, not
 * the token, and a session without an organization is treated as anonymous when
 * `requireOrganization` is set.
 */
const USER_ID = 'user-123';
const ORG_ID = 'org_A';

describe('resolveOptionalScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    __clearRevalidationCache();
    resetSessionUser();
    mockBcryptCompare.mockResolvedValue(false);
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'u@example.com', passwordVersion: 0 },
    });
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
  });

  it('returns null for an anonymous caller so the route stays public', async () => {
    authMocks.auth.mockResolvedValue(null);
    expect(await resolveOptionalScope()).toBeNull();
  });

  it('resolves a scope for a signed-in caller', async () => {
    const scope = await resolveOptionalScope();
    expect(scope).not.toBeNull();
    expect(scope!.userId).toBe(USER_ID);
    expect(scope!.organizationId).toBe(ORG_ID);
  });

  it('ignores a role claimed by the token and uses the database role', async () => {
    // Token says ADMIN; the database says the user was demoted to USER.
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'ADMIN', email: 'u@example.com', passwordVersion: 0 },
    });
    primeSessionUser({
      isActive: true,
      role: 'USER',
      organizationId: ORG_ID,
      organization: { status: 'ACTIVE' },
      passwordVersion: 0,
    });

    const scope = await resolveOptionalScope();
    // This is what closes the premium-download paywall bypass.
    expect(scope!.guard.isAdmin).toBe(false);
  });

  it('reports a database-confirmed admin as admin', async () => {
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: ORG_ID, role: 'USER', email: 'u@example.com', passwordVersion: 0 },
    });
    primeSessionUser({
      isActive: true,
      role: 'ADMIN',
      organizationId: ORG_ID,
      organization: { status: 'ACTIVE' },
      passwordVersion: 0,
    });

    expect((await resolveOptionalScope())!.guard.isAdmin).toBe(true);
  });

  it('ignores an organization claimed by the token and uses the database org', async () => {
    // Token still carries org_A after the user was moved to org_B.
    authMocks.auth.mockResolvedValue({
      user: { id: USER_ID, organizationId: 'org_STALE', role: 'USER', email: 'u@example.com', passwordVersion: 0 },
    });
    primeSessionUser({
      isActive: true,
      role: 'USER',
      organizationId: ORG_ID,
      organization: { status: 'ACTIVE' },
      passwordVersion: 0,
    });

    expect((await resolveOptionalScope())!.organizationId).toBe(ORG_ID);
  });

  it('treats a session with no organization as anonymous when requireOrganization is set', async () => {
    primeSessionUser({
      isActive: true,
      role: 'USER',
      organizationId: null,
      organization: { status: 'ACTIVE' },
      passwordVersion: 0,
    });

    // Guards against a null organizationId reaching Prisma, where it would
    // turn an equality filter into "match every tenant".
    expect(await resolveOptionalScope(undefined, { requireOrganization: true })).toBeNull();
  });

  it('still returns the scope without an org when requireOrganization is not set', async () => {
    primeSessionUser({
      isActive: true,
      role: 'USER',
      organizationId: null,
      organization: { status: 'ACTIVE' },
      passwordVersion: 0,
    });

    expect(await resolveOptionalScope()).not.toBeNull();
  });

  it('returns null for a suspended user rather than a usable scope', async () => {
    primeSessionUser(null);
    expect(await resolveOptionalScope()).toBeNull();
  });

  it('returns null for a user the database reports as inactive', async () => {
    primeSessionUser({
      isActive: false,
      role: 'USER',
      organizationId: ORG_ID,
      organization: { status: 'ACTIVE' },
      passwordVersion: 0,
    });

    expect(await resolveOptionalScope()).toBeNull();
  });

  it('denies a scope when the org is suspended', async () => {
    primeSessionUser({
      isActive: true,
      role: 'USER',
      organizationId: ORG_ID,
      organization: { status: 'SUSPENDED' },
      passwordVersion: 0,
    });

    expect(await resolveOptionalScope()).toBeNull();
  });
});