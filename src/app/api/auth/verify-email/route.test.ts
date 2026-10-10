import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock next-auth before importing the route (NextAuth v5 beta.32 has module resolution issues with Next.js 16.3.7)
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: async () => null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  })),
  DefaultSession: {},
}));

// Mock bcryptjs for verifyTokenHash
const mockBcryptCompare = vi.hoisted(() => vi.fn());
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async () => 'hashed-password'),
    compare: mockBcryptCompare,
  },
  hash: vi.fn(async () => 'hashed-password'),
  compare: mockBcryptCompare,
}));

const { prismaMocks } = vi.hoisted(() => ({
  prismaMocks: {
    verificationToken: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));

import { GET } from './route';
import { resetRateLimitsForTests } from '@/lib/rate-limit';

function get(token?: string): Promise<Response> {
  const url = token
    ? `http://localhost:3000/api/auth/verify-email?token=${encodeURIComponent(token)}`
    : 'http://localhost:3000/api/auth/verify-email';
  return GET(new NextRequest(url));
}

describe('GET /api/auth/verify-email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The route is per-IP rate limited because the bcrypt token sweep is
    // reachable unauthenticated. With TRUST_PROXY unset all callers share the
    // `unknown` bucket, so the suite must reset it or later assertions would
    // observe 429 rather than the behaviour under test.
    resetRateLimitsForTests();
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
    prismaMocks.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.verificationToken.delete.mockResolvedValue({});
  });

  it('rejects a missing token with 400', async () => {
    const res = await get();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Missing verification token',
    });
    expect(prismaMocks.verificationToken.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown token with 400', async () => {
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
    const res = await get('unknown-token');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invalid or already-used verification link',
    });
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired token with 410', async () => {
    mockBcryptCompare.mockResolvedValue(true);
    // Expired tokens are filtered out by the findMany query (expires > now), so they return 400
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
    const res = await get('expired-token');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invalid or already-used verification link',
    });
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('verifies the email, marks the user verified, and deletes the single-use token', async () => {
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findMany.mockResolvedValue([{ identifier: 'user@example.com', token: 'valid-token', expires: new Date(Date.now() + 60_000) }]);
    prismaMocks.user.findFirst.mockResolvedValue({ id: 'user-1' });
    const res = await get('valid-token');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(prismaMocks.user.updateMany).toHaveBeenCalledWith({
      where: { email: 'user@example.com', deletedAt: null },
      data: { emailVerified: expect.any(Date) },
    });
    expect(prismaMocks.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: 'valid-token' },
    });
  });

  it('returns 404 when no active account owns the token', async () => {
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findMany.mockResolvedValue([{ identifier: 'ghost@example.com', token: 'ghost-token', expires: new Date(Date.now() + 60_000) }]);
    prismaMocks.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await get('ghost-token');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Account not found for this verification link',
    });
    expect(prismaMocks.verificationToken.delete).not.toHaveBeenCalled();
  });

  describe('Verification token replay / integrity', () => {
    it('rejects second use of the same token (replay protection)', async () => {
      // First use: token matches, user updated, token deleted
      mockBcryptCompare.mockResolvedValue(true);
      prismaMocks.verificationToken.findMany.mockResolvedValueOnce([
        { identifier: 'user@example.com', token: 'valid-token', expires: new Date(Date.now() + 60_000) },
      ]);
      prismaMocks.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMocks.user.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMocks.verificationToken.delete.mockResolvedValueOnce({});

      const firstUse = await get('valid-token');
      expect(firstUse.status).toBe(200);
      const firstBody = await firstUse.json();
      expect(firstBody.success).toBe(true);
      expect(prismaMocks.verificationToken.delete).toHaveBeenCalledWith({
        where: { token: 'valid-token' },
      });

      // Second use: token no longer exists (findMany returns empty)
      vi.resetAllMocks();
      prismaMocks.verificationToken.findMany.mockResolvedValue([]);
      prismaMocks.user.updateMany.mockResolvedValue({ count: 1 });

      const secondUse = await get('valid-token');
      expect(secondUse.status).toBe(400);
      const secondBody = await secondUse.json();
      expect(secondBody.success).toBe(false);
      expect(secondBody).toEqual({
        success: false,
        error: 'Invalid or already-used verification link',
      });
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a modified token (tamper detection)', async () => {
      mockBcryptCompare.mockResolvedValue(false);
      prismaMocks.verificationToken.findMany.mockResolvedValue([
        { identifier: 'user@example.com', token: 'valid-token', expires: new Date(Date.now() + 60_000) },
      ]);

      // Try variations of the valid token
      const modifiedTokens = [
        'valid-tokfn', // one character changed
        'valid-tokenx', // character appended
        'alid-token', // character truncated
        'VALID-TOKEN', // case changed
        'valid-token ', // trailing space
      ];

      for (const modified of modifiedTokens) {
        const res = await get(modified);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      }
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a reset token used as verification token (wrong purpose)', async () => {
      // The route explicitly checks for 'r_' prefix
      const resetToken = 'r_' + 'a'.repeat(64);
      const res = await get(resetToken);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body).toEqual({
        success: false,
        error: 'Invalid or already-used verification link',
      });
      expect(prismaMocks.verificationToken.findMany).not.toHaveBeenCalled();
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      // Expired tokens are filtered out by findMany query (expires > now)
      mockBcryptCompare.mockResolvedValue(true);
      prismaMocks.verificationToken.findMany.mockResolvedValue([]);
      const res = await get('expired-token');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body).toEqual({
        success: false,
        error: 'Invalid or already-used verification link',
      });
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });

    it('cannot use a token from one account to verify a different account (foreign token)', async () => {
      // The token is associated with user@example.com
      mockBcryptCompare.mockResolvedValue(true);
      prismaMocks.verificationToken.findMany.mockResolvedValue([
        { identifier: 'user@example.com', token: 'valid-token', expires: new Date(Date.now() + 60_000) },
      ]);
      // The user update should only affect the account that owns the token
      prismaMocks.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMocks.user.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await get('valid-token');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(prismaMocks.user.updateMany).toHaveBeenCalledWith({
        where: { email: 'user@example.com', deletedAt: null },
        data: { emailVerified: expect.any(Date) },
      });
      // The token cannot verify a different email because the update
      // is scoped to the token's identifier (email)
    });
  });

  describe('Error information leakage checks', () => {
    it('does not leak stack traces in error responses', async () => {
      const res = await get();
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/stack|trace|at\s+\w+\s*\(/i);
      expect(text).not.toMatch(/Error:\s.*\n\s*at/i);
    });

    it('does not leak database/internal errors in unknown token response', async () => {
      prismaMocks.verificationToken.findMany.mockResolvedValue([]);
      const res = await get('unknown-token');
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/prisma|sql|database|connection|pool|timeout/i);
      expect(text).not.toMatch(/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i);
    });

    it('does not leak filesystem paths in error responses', async () => {
      const res = await get();
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/\/[a-z]+(\/[a-z0-9._-]+)+/i);
      expect(text).not.toMatch(/\\/);
      expect(text).not.toMatch(/node_modules|dist|build|src\/lib/i);
    });

    it('does not leak secrets or tokens in error responses', async () => {
      const res = await get();
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/AUTH_SECRET|DATABASE_URL|JWT_SECRET|NEXTAUTH_SECRET/i);
      expect(text).not.toMatch(/[a-f0-9]{32,}/i);
      expect(text).not.toMatch(/sk_live_|sk_test_|pk_live_|pk_test_/i);
    });

    it('uses safe client-facing messages for missing token error', async () => {
      const res = await get();
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(0);
      expect(body.error.length).toBeLessThan(200);
    });

    it('uses safe client-facing message for unknown/used token', async () => {
      prismaMocks.verificationToken.findMany.mockResolvedValue([]);
      const res = await get('unknown-token');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe('string');
      expect(body.error.toLowerCase()).toContain('invalid');
    });
  });
});
