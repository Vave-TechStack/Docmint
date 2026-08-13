import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, bcryptMocks } = vi.hoisted(() => ({
  prismaMocks: {
    verificationToken: { findUnique: vi.fn(), delete: vi.fn() },
    user: { updateMany: vi.fn() },
  },
  bcryptMocks: {
    hash: vi.fn(async () => 'hashed-password'),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('bcryptjs', () => ({ default: bcryptMocks }));

import { POST } from './route';

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
    prismaMocks.verificationToken.findUnique.mockResolvedValue({
      identifier: 'user@example.com',
      token: VALID_TOKEN,
      expires: new Date(Date.now() + 60_000),
    });
    prismaMocks.verificationToken.delete.mockResolvedValue({});
    prismaMocks.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects a verification token (wrong purpose) and short passwords', async () => {
    const wrongPurpose = await post({ token: 'v_' + 'b'.repeat(64), password: 'newpassword1' });
    expect(wrongPurpose.status).toBe(400);

    const short = await post({ token: VALID_TOKEN, password: 'short' });
    expect(short.status).toBe(400);
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('resets the password and consumes the token for a valid reset link', async () => {
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: 'Password reset successfully. You can now sign in.',
    });
    expect(bcryptMocks.hash).toHaveBeenCalledWith('newpassword1', 12);
    expect(prismaMocks.user.updateMany).toHaveBeenCalledWith({
      where: { email: 'user@example.com', deletedAt: null },
      data: { passwordHash: 'hashed-password' },
    });
    // Single-use
    expect(prismaMocks.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: VALID_TOKEN },
    });
  });

  it('rejects an unknown or already-used token', async () => {
    prismaMocks.verificationToken.findUnique.mockResolvedValue(null);
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(400);
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    prismaMocks.verificationToken.findUnique.mockResolvedValue({
      identifier: 'user@example.com',
      token: VALID_TOKEN,
      expires: new Date(Date.now() - 1000),
    });
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(410);
    expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when no account owns the reset email', async () => {
    prismaMocks.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ token: VALID_TOKEN, password: 'newpassword1' });
    expect(res.status).toBe(404);
    expect(prismaMocks.verificationToken.delete).not.toHaveBeenCalled();
  });
});
