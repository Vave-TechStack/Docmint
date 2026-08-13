import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, emailMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findUnique: vi.fn() },
    verificationToken: { create: vi.fn() },
  },
  emailMocks: {
    sendVerificationEmail: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/email/email-service', () => ({ EmailService: emailMocks }));

import { POST } from './route';

function post(email?: string): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(email ? { email } : {}),
  });
  return POST(request);
}

const GENERIC_MESSAGE =
  'If your email is registered and unverified, a verification link has been sent.';

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMocks.verificationToken.create.mockResolvedValue({});
    emailMocks.sendVerificationEmail.mockResolvedValue(true);
  });

  it('rejects a missing/invalid email with 400', async () => {
    const missing = await post();
    expect(missing.status).toBe(400);
    expect(prismaMocks.user.findUnique).not.toHaveBeenCalled();

    const invalid = await post('not-an-email');
    expect(invalid.status).toBe(400);
    expect(prismaMocks.user.findUnique).not.toHaveBeenCalled();
  });

  it('sends a verification link for an existing, active, unverified user', async () => {
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      isActive: true,
      emailVerified: null,
    });
    const res = await post('User@Example.com'); // lowercased before lookup
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: GENERIC_MESSAGE });
    expect(prismaMocks.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
    expect(prismaMocks.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: 'user@example.com',
        token: expect.any(String),
        expires: expect.any(Date),
      }),
    });
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String)
    );
  });

  it('does not send for an already-verified user (generic success, no email)', async () => {
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'verified@example.com',
      isActive: true,
      emailVerified: new Date(),
    });
    const res = await post('verified@example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: GENERIC_MESSAGE });
    expect(prismaMocks.verificationToken.create).not.toHaveBeenCalled();
    expect(emailMocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('does not send for an unknown email (no account enumeration)', async () => {
    prismaMocks.user.findUnique.mockResolvedValue(null);
    const res = await post('ghost@example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: GENERIC_MESSAGE });
    expect(prismaMocks.verificationToken.create).not.toHaveBeenCalled();
    expect(emailMocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('rate-limits repeated requests for the same email', async () => {
    const email = `rate-${Date.now()}@example.com`;
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email,
      isActive: true,
      emailVerified: null,
    });
    const first = await post(email);
    expect(first.status).toBe(200);
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledTimes(1);

    const second = await post(email);
    expect(second.status).toBe(429);
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});
