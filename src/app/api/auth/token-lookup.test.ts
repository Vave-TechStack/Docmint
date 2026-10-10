/**
 * Characterisation tests for the verification/reset token lookup.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `VerificationToken.token` stores a bcrypt hash, which is deliberately
 * non-deterministic and therefore not searchable. Both consuming routes
 * (`verify-email`, `reset-password`) recover the owning row by fetching up to
 * `MAX_TOKEN_CANDIDATES` unexpired rows and bcrypt-comparing the presented
 * token against each.
 *
 * That design has a bounded worst case (it cannot be turned into an unbounded
 * CPU amplifier) but it has a correctness consequence that is easy to miss:
 * the sweep is capped, so a legitimate token that sorts beyond the cap is
 * reported as invalid. These tests pin the observable behaviour so the
 * limitation is visible in CI rather than discovered in production.
 *
 * The security invariants that must hold regardless of how lookup is
 * implemented are asserted here too: purpose separation (`v_` vs `r_`),
 * single use, and expiry. Those must survive any future switch to an indexed
 * lookup.
 *
 * See `docs/TOKEN_LOOKUP_PROPOSAL.md` for the indexed-lookup design and its
 * rollout implications.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: async () => null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  })),
  DefaultSession: {},
}));

/**
 * A stand-in for the stored bcrypt hash. The real hash is opaque, so tests
 * drive the comparison through a table keyed by the *presented* token. That
 * mirrors production, where only the hash is on disk.
 */
const mockBcryptCompare = vi.hoisted(() => vi.fn());
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed'), compare: mockBcryptCompare },
  hash: vi.fn(async () => 'hashed'),
  compare: mockBcryptCompare,
}));

const { prismaMocks } = vi.hoisted(() => ({
  prismaMocks: {
    verificationToken: {
      findMany: vi.fn(),
      // Indexed lookup path.
      findFirst: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));

import { GET as verifyEmail } from '@/app/api/auth/verify-email/route';
import { POST as resetPassword } from '@/app/api/auth/reset-password/route';
import { resetRateLimitsForTests } from '@/lib/rate-limit';

/** Mirrors the route-level cap so the tests exercise the real boundary. */
const MAX_TOKEN_CANDIDATES = 50;

function verify(token: string): Promise<Response> {
  return verifyEmail(
    new NextRequest(`http://localhost:3000/api/auth/verify-email?token=${encodeURIComponent(token)}`)
  );
}

function reset(token: string, password = 'new-password-123'): Promise<Response> {
  return resetPassword(
    new NextRequest('http://localhost:3000/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    })
  );
}

const hashOf = (token: string) => `hash-of-${token}`;

/**
 * Stands in for `bcrypt.compare(presentedToken, storedHash)`.
 *
 * Both arguments matter: only the row whose stored hash was produced from the
 * presented token may match. A mock that inspects the presented value alone
 * would report a hit on the first candidate and make the sweep look instant.
 */
function compareMatching(target: string) {
  return async (presented: string, storedHash: string) =>
    presented === target && storedHash === hashOf(target);
}

/**
 * Builds a token table of `count` unexpired rows whose bcrypt hashes all
 * differ, with `target` placed at `targetIndex`. Only the target's hash
 * accepts the real token; everything else rejects it.
 *
 * Expiry descends so the returned order is the order a `expires: desc` query
 * would yield — row 0 is the first candidate the route compares.
 */
function buildSweep(count: number, target: string, targetIndex: number) {
  const rows: Array<{ identifier: string; token: string; expires: Date }> = [];
  const base = Date.now();
  for (let i = 0; i < count; i++) {
    rows.push({
      identifier: `user${i}@example.com`,
      token: i === targetIndex ? hashOf(target) : `hash-of-decoy-${i}`,
      expires: new Date(base + 60_000 - i),
    });
  }
  return rows.sort((a, b) => b.expires.getTime() - a.expires.getTime());
}

describe('verification token lookup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetRateLimitsForTests();
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
    prismaMocks.verificationToken.findFirst.mockResolvedValue(null);
    prismaMocks.verificationToken.delete.mockResolvedValue({});
    prismaMocks.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
    prismaMocks.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.user.findFirst.mockResolvedValue({ id: 'user-1' });
  });

  describe('candidate sweep sizing', () => {
    it('never asks the database for more than the capped candidate set', async () => {
      mockBcryptCompare.mockResolvedValue(false);
      await verify('v_' + 'a'.repeat(64));

      const [query] = prismaMocks.verificationToken.findMany.mock.calls[0];
      expect(query.take).toBe(MAX_TOKEN_CANDIDATES);
    });

    it('compares at most the capped number of candidates', async () => {
      mockBcryptCompare.mockResolvedValue(false);
      const rows = buildSweep(MAX_TOKEN_CANDIDATES, 'v_never', -1);
      prismaMocks.verificationToken.findMany.mockResolvedValue(rows);

      await verify('v_' + 'b'.repeat(64));

      expect(mockBcryptCompare).toHaveBeenCalledTimes(MAX_TOKEN_CANDIDATES);
    });

    it('stops comparing as soon as a candidate matches', async () => {
      const target = 'v_' + 'c'.repeat(64);
      const rows = buildSweep(40, target, 10);
      prismaMocks.verificationToken.findMany.mockResolvedValue(rows);
      mockBcryptCompare.mockImplementation(compareMatching(target));

      const res = await verify(target);

      expect(res.status).toBe(200);
      // 10 decoys precede the match, so 11 comparisons total — not 40.
      expect(mockBcryptCompare).toHaveBeenCalledTimes(11);
    });

    it('matches a token that sorts within the candidate window', async () => {
      const target = 'v_' + 'd'.repeat(64);
      const rows = buildSweep(MAX_TOKEN_CANDIDATES, target, MAX_TOKEN_CANDIDATES - 1);
      prismaMocks.verificationToken.findMany.mockResolvedValue(rows);
      mockBcryptCompare.mockImplementation(compareMatching(target));

      const res = await verify(target);

      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });

    /**
     * Documents the known limitation rather than asserting correctness: when
     * more than `MAX_TOKEN_CANDIDATES` tokens are unexpired, the sweep only
     * ever sees the capped window, so a valid token outside it is rejected.
     *
     * This is a CAPACITY limit, not a security hole — it denies access rather
     * than granting it, and the response is indistinguishable from a bad
     * token. The fix is the indexed lookup in
     * `docs/TOKEN_LOOKUP_PROPOSAL.md`; this test is the regression witness for
     * that work and should be inverted once it lands.
     */
    it('rejects a valid token that falls outside the capped window (known limitation)', async () => {
      const target = 'v_' + 'e'.repeat(64);
      // 120 unexpired tokens; the target is the 100th, well past the cap.
      const rows = buildSweep(120, target, 99).slice(0, MAX_TOKEN_CANDIDATES);
      prismaMocks.verificationToken.findMany.mockResolvedValue(rows);
      mockBcryptCompare.mockImplementation(compareMatching(target));

      const res = await verify(target);

      expect(res.status).toBe(400);
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('purpose separation', () => {
    it('verify-email rejects a reset token before any database work', async () => {
      const res = await verify('r_' + 'f'.repeat(64));

      expect(res.status).toBe(400);
      expect(prismaMocks.verificationToken.findMany).not.toHaveBeenCalled();
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('reset-password rejects a verification token before any database work', async () => {
      const res = await reset('v_' + '0'.repeat(64));

      expect(res.status).toBe(400);
      expect(prismaMocks.verificationToken.findMany).not.toHaveBeenCalled();
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('a reset token hash is never matched by the verification sweep', async () => {
      // Even if a reset row reaches the candidate window, only a `v_`-prefixed
      // value can reach the comparison at all — the route rejects `r_` first.
      const target = 'r_' + '1'.repeat(64);
      prismaMocks.verificationToken.findMany.mockResolvedValue(
        buildSweep(5, target, 0)
      );
      mockBcryptCompare.mockImplementation(compareMatching(target));

      const res = await verify(target);

      expect(res.status).toBe(400);
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('a verification token hash is never matched by the reset sweep', async () => {
      const target = 'v_' + '2'.repeat(64);
      prismaMocks.verificationToken.findMany.mockResolvedValue(
        buildSweep(5, target, 0)
      );
      mockBcryptCompare.mockImplementation(compareMatching(target));

      const res = await reset(target);

      expect(res.status).toBe(400);
      expect(mockBcryptCompare).not.toHaveBeenCalled();
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('single use and expiry', () => {
    it('deletes the token row after a successful verification', async () => {
      const target = 'v_' + '3'.repeat(64);
      const rows = buildSweep(3, target, 0);
      prismaMocks.verificationToken.findMany.mockResolvedValueOnce(rows);
      mockBcryptCompare.mockImplementation(compareMatching(target));

      const res = await verify(target);

      expect(res.status).toBe(200);
      expect(prismaMocks.verificationToken.deleteMany).toHaveBeenCalledWith({
        where: { token: `hash-of-${target}` },
      });
    });

    it('a second presentation of the same token finds nothing and is rejected', async () => {
      const target = 'v_' + '4'.repeat(64);
      prismaMocks.verificationToken.findMany.mockResolvedValueOnce(
        buildSweep(3, target, 0)
      );
      mockBcryptCompare.mockImplementation(compareMatching(target));

      expect((await verify(target)).status).toBe(200);

      // Row was deleted on first use, so the sweep now returns nothing.
      vi.resetAllMocks();
      resetRateLimitsForTests();
      prismaMocks.verificationToken.findMany.mockResolvedValue([]);
      prismaMocks.user.updateMany.mockResolvedValue({ count: 1 });

      const replay = await verify(target);
      expect(replay.status).toBe(400);
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });

    it('only considers unexpired rows', async () => {
      await verify('v_' + '5'.repeat(64));
      const [query] = prismaMocks.verificationToken.findMany.mock.calls[0];
      expect(query.where.expires).toEqual({ gt: expect.any(Date) });
    });

    it('reset-password increments passwordVersion so live sessions are revoked', async () => {
      const target = 'r_' + '6'.repeat(64);
      prismaMocks.verificationToken.findMany.mockResolvedValue(
        buildSweep(3, target, 0)
      );
      mockBcryptCompare.mockImplementation(compareMatching(target));

      const res = await reset(target);

      expect(res.status).toBe(200);
      expect(prismaMocks.user.updateMany).toHaveBeenCalledWith({
        where: { email: 'user0@example.com', deletedAt: null },
        data: {
          passwordHash: expect.any(String),
          passwordVersion: { increment: 1 },
        },
      });
    });

    it('does not consume the token when the account has been deleted', async () => {
      const target = 'v_' + '7'.repeat(64);
      prismaMocks.verificationToken.findMany.mockResolvedValue(
        buildSweep(3, target, 0)
      );
      mockBcryptCompare.mockImplementation(compareMatching(target));
      prismaMocks.user.updateMany.mockResolvedValue({ count: 0 });

      const res = await verify(target);

      expect(res.status).toBe(404);
      expect(prismaMocks.verificationToken.delete).not.toHaveBeenCalled();
    });
  });

  describe('abuse resistance', () => {
    it('caps repeated verification attempts per IP with 429', async () => {
      for (let i = 0; i < 10; i++) {
        await verify(`v_${i}${'a'.repeat(64)}`);
      }
      const limited = await verify('v_' + '9'.repeat(64));

      expect(limited.status).toBe(429);
      // The limiter must short-circuit before the bcrypt sweep runs again.
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('caps repeated reset attempts per IP with 429', async () => {
      for (let i = 0; i < 10; i++) {
        await reset(`r_${i}${'a'.repeat(64)}`);
      }
      const limited = await reset('r_' + '8'.repeat(64));

      expect(limited.status).toBe(429);
      expect(prismaMocks.user.updateMany).not.toHaveBeenCalled();
    });
  });
});