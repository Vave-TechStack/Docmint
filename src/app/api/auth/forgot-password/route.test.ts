import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, emailMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findUnique: vi.fn() },
    verificationToken: { create: vi.fn() },
  },
  emailMocks: {
    sendPasswordResetEmail: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/email/email-service', () => ({ EmailService: emailMocks }));

import { POST } from './route';

function post(email?: string): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(email ? { email } : {}),
  });
  return POST(request);
}

const GENERIC_MESSAGE =
  'If your email is registered, a password reset link has been sent.';

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMocks.verificationToken.create.mockResolvedValue({});
    emailMocks.sendPasswordResetEmail.mockResolvedValue(true);
  });

  it('rejects a missing/invalid email with 400', async () => {
    const missing = await post();
    expect(missing.status).toBe(400);
    expect(prismaMocks.user.findUnique).not.toHaveBeenCalled();

    const invalid = await post('not-an-email');
    expect(invalid.status).toBe(400);
  });

  it('creates a reset token and emails the link for an existing active user', async () => {
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      isActive: true,
    });
    const res = await post('User@Example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: GENERIC_MESSAGE });
    expect(prismaMocks.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
    expect(prismaMocks.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: 'user@example.com',
        // Purpose-tagged so verification routes can never consume it
        token: expect.stringMatching(/^r_[a-f0-9]{64}$/),
        expires: expect.any(Date),
      }),
    });
    expect(emailMocks.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringContaining('/reset-password?token=r_')
    );
  });

  it('does not create a token for an unknown email (no enumeration)', async () => {
    prismaMocks.user.findUnique.mockResolvedValue(null);
    const res = await post('ghost@example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: GENERIC_MESSAGE });
    expect(prismaMocks.verificationToken.create).not.toHaveBeenCalled();
    expect(emailMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('does not send for an inactive account', async () => {
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'suspended@example.com',
      isActive: false,
    });
    const res = await post('suspended@example.com');
    expect(res.status).toBe(200);
    expect(prismaMocks.verificationToken.create).not.toHaveBeenCalled();
  });

  it('rate-limits repeated requests for the same email', async () => {
    const email = `reset-${Date.now()}@example.com`;
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email,
      isActive: true,
    });
    const first = await post(email);
    expect(first.status).toBe(200);
    expect(emailMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    const second = await post(email);
    expect(second.status).toBe(429);
    expect(emailMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});
