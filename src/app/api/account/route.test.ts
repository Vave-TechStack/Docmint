/**
 * Regression tests for the account endpoints.
 *
 * These did not exist: the settings page showed "Profile updated
 * successfully" and "Password updated (API coming soon)" without calling any
 * API, so every edit a user made on that page was silently discarded. The
 * password control in particular was dangerous — a user believed their
 * password had changed when it had not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: async () => null })),
  DefaultSession: {},
}));

const mockBcryptCompare = vi.hoisted(() => vi.fn());
const mockBcryptHash = vi.hoisted(() => vi.fn(async () => 'new-hash'));
vi.mock('bcryptjs', () => ({
  default: { hash: mockBcryptHash, compare: mockBcryptCompare },
  hash: mockBcryptHash,
  compare: mockBcryptCompare,
}));

const { prismaMocks, authMock } = vi.hoisted(() => ({
  prismaMocks: {
    user: {
      // The guard re-reads this on every request; the route reads it too, so
      // the implementation is installed once below via mockRevalidation.
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  authMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMock }));

import { POST, PATCH } from './route';
import { mockRevalidation } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';
import { resetRateLimitsForTests } from '@/lib/rate-limit';

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    })
  );
}

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new NextRequest('http://localhost:3000/api/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/account — password change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearRevalidationCache();
    resetRateLimitsForTests();
    authMock.mockResolvedValue({
      user: { id: 'user-1', organizationId: 'org-1', role: 'USER', email: 'u@example.com', passwordVersion: 0 },
    });
    // The guard re-reads the user with a `select` of
    // {isActive, role, organizationId, organization, passwordVersion}; the
    // route re-reads with a `select` of {id, passwordHash, …}. Keying off
    // `select.passwordHash` distinguishes them unambiguously.
    prismaMocks.user.findFirst.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
      args?.select?.passwordHash
        ? { id: 'user-1', passwordHash: 'old-hash', organizationId: 'org-1', email: 'u@example.com' }
        : { isActive: true, role: 'USER', organizationId: 'org-1', organization: { status: 'ACTIVE' }, passwordVersion: 0 }
    );
    prismaMocks.user.update.mockResolvedValue({});
    prismaMocks.auditLog.create.mockResolvedValue({});
    mockBcryptCompare.mockResolvedValue(true);
    mockBcryptHash.mockResolvedValue('new-hash');
  });

  it('changes the password and revokes other sessions', async () => {
    const res = await post({ currentPassword: 'old-pass-1', newPassword: 'new-pass-22' });

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    // passwordVersion increment is what revokes live JWT sessions.
    expect(prismaMocks.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash', passwordVersion: { increment: 1 } },
    });
    expect(prismaMocks.auditLog.create).toHaveBeenCalled();
  });

  it('requires the current password to be correct', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    const res = await post({ currentPassword: 'wrong-pass', newPassword: 'new-pass-22' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/current password is incorrect/i);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rejects a missing current password', async () => {
    const res = await post({ newPassword: 'new-pass-22' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rejects a too-short new password', async () => {
    const res = await post({ currentPassword: 'old-pass-1', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rejects a new password identical to the current one', async () => {
    const res = await post({ currentPassword: 'same-pass-1', newPassword: 'same-pass-1' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('refuses a password-only takeover of a social-login account', async () => {
    // Only the password-hash read changes; the guard's revalidation row must
    // stay valid or the request is rejected before reaching the route.
    prismaMocks.user.findFirst.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
      args?.select?.passwordHash
        ? { id: 'user-1', passwordHash: null, organizationId: 'org-1', email: 'u@example.com' }
        : { isActive: true, role: 'USER', organizationId: 'org-1', organization: { status: 'ACTIVE' }, passwordVersion: 0 }
    );
    const res = await post({ currentPassword: 'anything', newPassword: 'new-pass-22' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/social provider/i);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rate limits repeated attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await post({ currentPassword: 'old-pass-1', newPassword: 'new-pass-22' });
    }
    const limited = await post({ currentPassword: 'old-pass-1', newPassword: 'new-pass-33' });
    expect(limited.status).toBe(429);
  });
});

describe('PATCH /api/account — profile update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearRevalidationCache();
    resetRateLimitsForTests();
    authMock.mockResolvedValue({
      user: { id: 'user-1', organizationId: 'org-1', role: 'USER', email: 'u@example.com', passwordVersion: 0 },
    });
    prismaMocks.user.findFirst.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
      args?.select?.passwordHash
        ? { id: 'user-1', passwordHash: 'old-hash', organizationId: 'org-1', email: 'u@example.com' }
        : { isActive: true, role: 'USER', organizationId: 'org-1', organization: { status: 'ACTIVE' }, passwordVersion: 0 }
    );
    prismaMocks.user.update.mockResolvedValue({
      id: 'user-1', name: 'New Name', email: 'u@example.com', mobile: '+91 9000000000',
    });
  });

  it('persists name and mobile', async () => {
    const res = await patch({ name: 'New Name', mobile: '+91 9000000000' });
    expect(res.status).toBe(200);
    expect(prismaMocks.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'New Name', mobile: '+91 9000000000' },
      select: { id: true, name: true, email: true, mobile: true },
    });
  });

  it('does not allow changing the email address', async () => {
    // Changing email would invalidate emailVerified with no re-verification
    // flow, so it is not an updatable field.
    const res = await patch({ email: 'attacker@example.com' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed mobile number', async () => {
    const res = await patch({ mobile: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('rejects an empty payload', async () => {
    const res = await patch({});
    expect(res.status).toBe(400);
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it('returns the stored values so the UI can reflect them', async () => {
    const res = await patch({ name: 'New Name' });
    const body = await res.json();
    expect(body.data.name).toBe('New Name');
    expect(body.data.email).toBe('u@example.com');
  });
});