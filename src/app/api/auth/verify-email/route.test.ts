import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks } = vi.hoisted(() => ({
  prismaMocks: {
    verificationToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));

import { GET } from './route';

function get(token?: string): Promise<Response> {
  const url = token
    ? `http://localhost:3000/api/auth/verify-email?token=${encodeURIComponent(token)}`
    : 'http://localhost:3000/api/auth/verify-email';
  return GET(new NextRequest(url));
}

describe('GET /api/auth/verify-email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    prismaMocks.verificationToken.findUnique.mockResolvedValue(null);
    const res = await get('unknown-token');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invalid or already-used verification link',
    });
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired token with 410', async () => {
    prismaMocks.verificationToken.findUnique.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'expired-token',
      expires: new Date(Date.now() - 1000),
    });
    const res = await get('expired-token');
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Verification link has expired',
    });
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('verifies the email, marks the user verified, and deletes the single-use token', async () => {
    prismaMocks.verificationToken.findUnique.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'valid-token',
      expires: new Date(Date.now() + 60_000),
    });
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
    prismaMocks.verificationToken.findUnique.mockResolvedValue({
      identifier: 'ghost@example.com',
      token: 'ghost-token',
      expires: new Date(Date.now() + 60_000),
    });
    prismaMocks.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await get('ghost-token');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Account not found for this verification link',
    });
    expect(prismaMocks.verificationToken.delete).not.toHaveBeenCalled();
  });
});
