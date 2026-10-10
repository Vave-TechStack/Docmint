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
      delete: vi.fn() 
    },
    user: { 
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));

import { POST } from './route';
import { resetRateLimitsForTests } from '@/lib/rate-limit';

function post(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request);
}

const VALID_TOKEN = 'r_' + 'a'.repeat(64);

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Per-IP rate limited because the bcrypt token sweep is reachable
    // unauthenticated; see the note in verify-email's test setup.
    resetRateLimitsForTests();
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
    prismaMocks.verificationToken.findUnique.mockResolvedValue({
      identifier: 'user@example.com',
      token: VALID_TOKEN,
      expires: new Date(Date.now() + 60_000),
    });
    prismaMocks.verificationToken.delete.mockResolvedValue({});
    prismaMocks.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects a verification token (wrong purpose) and short passwords', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    prismaMocks.verificationToken.findMany.mockResolvedValue([{ identifier: 'user@example.com', token: 'v_' + 'b'.repeat(64), expires: new Date(Date.now() + 60_000) }]);
    const wrongPurpose = await post({ token: 'v_' + 'b'.repeat(64), password: 'newpassword1' });
    expect(wrongPurpose.status).toBe(400);

    const short = await post({ token: VALID_TOKEN, password: 'short' });
    expect(short.status).toBe(400);
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('resets the password and consumes the token for a valid reset link', async () => {
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findMany.mockResolvedValue([{ identifier: 'user@example.com', token: VALID_TOKEN, expires: new Date(Date.now() + 60_000) }]);
    prismaMocks.user.findFirst.mockResolvedValue({ id: 'user-1' });
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: 'Password reset successfully. You can now sign in.',
    });
    expect(prismaMocks.user.updateMany).toHaveBeenCalledWith({
      where: { email: 'user@example.com', deletedAt: null },
      data: { passwordHash: 'hashed-password', passwordVersion: { increment: 1 } },
    });
    // Single-use
    expect(prismaMocks.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: VALID_TOKEN },
    });
  });

  it('rejects an unknown or already-used token', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    mockBcryptCompare.mockResolvedValue(true);
    // Expired tokens are filtered out by the findMany query (expires > now), so they return 400
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when no account owns the reset email', async () => {
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findMany.mockResolvedValue([{ identifier: 'user@example.com', token: VALID_TOKEN, expires: new Date(Date.now() + 60_000) }]);
    prismaMocks.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(404);
    expect(prismaMocks.verificationToken.delete).not.toHaveBeenCalled();
  });

  describe('Error information leakage checks', () => {
    it('does not leak stack traces in error responses', async () => {
      const res = await post({ token: VALID_TOKEN, password: 'short' });
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/stack|trace|at\s+\w+\s*\(/i);
      expect(text).not.toMatch(/Error:\s.*\n\s*at/i);
    });

    it('does not leak database/internal errors in wrong-purpose token response', async () => {
      mockBcryptCompare.mockResolvedValue(false);
      prismaMocks.verificationToken.findMany.mockResolvedValue([{ identifier: 'user@example.com', token: 'v_' + 'b'.repeat(64), expires: new Date(Date.now() + 60_000) }]);
      const res = await post({ token: 'v_' + 'b'.repeat(64), password: 'newpassword1' });
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/prisma|sql|database|connection|pool|timeout/i);
      expect(text).not.toMatch(/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i);
    });

    it('does not leak filesystem paths in error responses', async () => {
      const res = await post({ token: VALID_TOKEN, password: 'short' });
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/\/[a-z]+(\/[a-z0-9._-]+)+/i);
      expect(text).not.toMatch(/\\/);
      expect(text).not.toMatch(/node_modules|dist|build|src\/lib/i);
    });

    it('does not leak secrets or tokens in error responses', async () => {
      const res = await post({ token: VALID_TOKEN, password: 'short' });
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/AUTH_SECRET|DATABASE_URL|JWT_SECRET|NEXTAUTH_SECRET/i);
      expect(text).not.toMatch(/[a-f0-9]{32,}/i);
      expect(text).not.toMatch(/sk_live_|sk_test_|pk_live_|pk_test_/i);
    });

    it('uses safe client-facing messages for validation errors', async () => {
      const short = await post({ token: VALID_TOKEN, password: 'short' });
      expect(short.status).toBe(400);
      const body = await short.json();
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(0);
      expect(body.error.length).toBeLessThan(200);
    });

    it('uses safe client-facing message for invalid/used token', async () => {
      mockBcryptCompare.mockResolvedValue(false);
      prismaMocks.verificationToken.findMany.mockResolvedValue([]);
      const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe('string');
      expect(body.error.toLowerCase()).toContain('invalid');
    });
  });
});
