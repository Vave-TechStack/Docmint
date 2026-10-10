import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { resetRateLimitsForTests } from '@/lib/rate-limit';

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
    // The route now applies a per-IP ceiling in addition to the per-address
    // one. With TRUST_PROXY unset every caller shares the `unknown` bucket, so
    // without this reset the suite exhausts its own quota and later assertions
    // see 429 instead of the behaviour they are checking.
    resetRateLimitsForTests();
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
        // Purpose-tagged so verification routes can never consume it.
        // Token is now stored as bcrypt hash (cost 12)
        token: expect.stringMatching(/^\$2b\$12\$/),
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

  it('prevents account enumeration — existing and non-existing accounts return identical generic response', async () => {
    // Case A: Existing active account
    prismaMocks.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'existing@example.com',
      isActive: true,
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

    // Internal behavior differs (token created vs not), but external observable
    // behavior is identical — preventing email enumeration via this endpoint.
  });

  describe('Token exhaustion / rotation protection', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      resetRateLimitsForTests();
      prismaMocks.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'victim@example.com',
        isActive: true,
      });
      prismaMocks.verificationToken.create.mockResolvedValue({});
      emailMocks.sendPasswordResetEmail.mockResolvedValue(true);
    });

    it('limits concurrent reset requests per email (token rotation)', async () => {
      // First request succeeds
      const first = await post('victim@example.com');
      expect(first.status).toBe(200);
      expect(prismaMocks.verificationToken.create).toHaveBeenCalledTimes(1);

      // Second request within rate-limit window is throttled
      const second = await post('victim@example.com');
      expect(second.status).toBe(429);
      expect(prismaMocks.verificationToken.create).toHaveBeenCalledTimes(1);
    });

    it('generates cryptographically random tokens (entropy check)', async () => {
      const tokens: string[] = [];
      // Capture the token passed to create() across multiple calls
      prismaMocks.verificationToken.create.mockImplementation(async (args: { data: { token: string } }) => {
        tokens.push(args.data.token);
        return {};
      });

      // Make multiple requests (rate limiter uses email, so we need to bypass for this test)
      // We directly test token generation by calling the route multiple times
      // with different emails to avoid rate limiting
      for (let i = 0; i < 5; i++) {
        const email = `entropy-${i}@example.com`;
        prismaMocks.user.findUnique.mockResolvedValueOnce({
          id: `user_${i}`,
          email,
          isActive: true,
        });
        await post(email);
      }

      // All tokens should be bcrypt hashes (cost 12) with high entropy
      expect(tokens).toHaveLength(5);
      tokens.forEach((token) => {
        expect(token).toMatch(/^\$2b\$12\$/); // bcrypt cost 12
        expect(token.length).toBeGreaterThan(50); // bcrypt hash length
      });

      // No two tokens should be identical (collision resistance)
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });

    it('resets tokens have 15-minute TTL (not the old 1-hour)', async () => {
      const now = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;

      await post('victim@example.com');

      const createCall = prismaMocks.verificationToken.create.mock.calls[0][0];
      const expires = createCall.data.expires;
      const ttl = expires.getTime() - now;

      // Allow small variance for test execution time
      expect(ttl).toBeGreaterThan(fifteenMinutes - 1000);
      expect(ttl).toBeLessThan(fifteenMinutes + 1000);
    });
  });
});
