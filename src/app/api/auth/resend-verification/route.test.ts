import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { resetRateLimitsForTests } from '@/lib/rate-limit';

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
    // The limiter is a module-level singleton keyed by email, so state leaks
    // between tests that reuse a fixture address (1 request/minute/email). Clear
    // it per test to keep the suite order-independent.
    resetRateLimitsForTests();
    prismaMocks.verificationToken.create.mockResolvedValue({});
    emailMocks.sendVerificationEmail.mockResolvedValue(true);
  });

  it('rejects a missing/invalid email with 400', async () => {
    const missing = await post();
    expect(missing.status).toBe(400);
    expect(prismaMocks.user.findUnique).not.toHaveBeenCalled();

    const invalid = await post('not-an-email');
    expect(invalid.status).toBe(400);
  });

  it('creates a verification token and emails the link for an existing active unverified user', async () => {
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      isActive: true,
      emailVerified: null,
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
        token: expect.stringMatching(/^\$2b\$12\$/),
        expires: expect.any(Date),
      }),
    });
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/^v_[a-f0-9]{64}$/),
    );
  });

  it('does not create a token for an unknown email (no enumeration)', async () => {
    prismaMocks.user.findUnique.mockResolvedValue(null);
    const res = await post('ghost@example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: GENERIC_MESSAGE });
    expect(prismaMocks.verificationToken.create).not.toHaveBeenCalled();
    expect(emailMocks.sendVerificationEmail).not.toHaveBeenCalled();
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

  it('does not send for an already verified account', async () => {
    prismaMocks.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'verified@example.com',
      isActive: true,
      emailVerified: new Date('2024-01-01'),
    });
    const res = await post('verified@example.com');
    expect(res.status).toBe(200);
    expect(prismaMocks.verificationToken.create).not.toHaveBeenCalled();
  });

  it('rate-limits repeated requests for the same email', async () => {
    const email = `resend-${Date.now()}@example.com`;
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

  it('prevents account enumeration — existing and non-existing accounts return identical generic response', async () => {
    // Case A: Existing active unverified account
    prismaMocks.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'existing@example.com',
      isActive: true,
      emailVerified: null,
    });
    const resExisting = await post('existing@example.com');

    // Case B: Non-existent account
    prismaMocks.user.findUnique.mockResolvedValueOnce(null);
    const resNonExisting = await post('nonexistent@example.com');

    // Both must return identical observable response
    expect(resExisting.status).toBe(200);
    expect(resNonExisting.status).toBe(200);
    expect(await resExisting.json()).toEqual({ success: true, message: GENERIC_MESSAGE });
    expect(await resNonExisting.json()).toEqual({ success: true, message: GENERIC_MESSAGE });

    // Internal behavior differs (token created + email sent vs no-op), but external
    // observable behavior is identical — preventing email enumeration via this endpoint.
  });
});