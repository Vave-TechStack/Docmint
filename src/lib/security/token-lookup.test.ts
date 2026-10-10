/**
 * Regression tests for the indexed verification-token lookup.
 *
 * Background: tokens are stored as bcrypt hashes, which are salted and
 * therefore not searchable. The previous resolver fetched up to 50 unexpired
 * rows and bcrypt-compared against each, which bounds the worst case but
 * rejects any legitimate token sorting beyond that window. These tests pin
 * the indexed path, the legacy fallback, and the security properties that
 * must hold in both.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBcryptCompare = vi.hoisted(() => vi.fn());
const mockHash = vi.hoisted(() => vi.fn(async (v: string) => `hashed:${v}`));

vi.mock('bcryptjs', () => ({
  default: { hash: mockHash, compare: mockBcryptCompare },
  hash: mockHash,
  compare: mockBcryptCompare,
}));

const { prismaMocks } = vi.hoisted(() => ({
  prismaMocks: {
    verificationToken: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));

import { resolveVerificationToken, consumeVerificationToken, safeTokenIndex } from './token-lookup';
import { tokenIndex, isTokenIndexAvailable } from './crypto';

const SECRET = 'test-auth-secret-long-enough-for-hkdf';

describe('tokenIndex', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it('is deterministic for the same token', () => {
    expect(tokenIndex('v_abc')).toBe(tokenIndex('v_abc'));
  });

  it('differs for different tokens', () => {
    expect(tokenIndex('v_abc')).not.toBe(tokenIndex('v_abd'));
  });

  it('differs for different tokens under different secrets', () => {
    const a = tokenIndex('v_abc');
    process.env.AUTH_SECRET = 'a-completely-different-secret-value';
    expect(tokenIndex('v_abc')).not.toBe(a);
  });

  it('produces a hex digest of the expected width', () => {
    expect(tokenIndex('v_abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed rather than producing an unkeyed digest', () => {
    // An unkeyed digest would let an attacker who obtains the table confirm
    // a guessed token with one indexed lookup and no bcrypt work.
    delete process.env.AUTH_SECRET;
    expect(isTokenIndexAvailable()).toBe(false);
    expect(() => tokenIndex('v_abc')).toThrow(/AUTH_SECRET/);
  });

  it('treats a too-short secret as unavailable', () => {
    process.env.AUTH_SECRET = 'short';
    expect(isTokenIndexAvailable()).toBe(false);
    expect(() => tokenIndex('v_abc')).toThrow(/AUTH_SECRET/);
  });

  it('safeTokenIndex returns null instead of throwing when unavailable', () => {
    delete process.env.AUTH_SECRET;
    expect(safeTokenIndex('v_abc')).toBeNull();
    process.env.AUTH_SECRET = SECRET;
    expect(safeTokenIndex('v_abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('resolveVerificationToken — indexed path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = SECRET;
    prismaMocks.verificationToken.findFirst.mockResolvedValue(null);
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it('resolves a token with one indexed read and no sweep', async () => {
    const presented = 'v_presented';
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findFirst.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'hashed-row',
      tokenIndex: tokenIndex(presented),
      purpose: 'verify',
      expires: new Date(Date.now() + 60_000),
    });

    const found = await resolveVerificationToken(presented, { purpose: 'verify' });

    expect(found).not.toBeNull();
    expect(found!.identifier).toBe('user@example.com');
    expect(prismaMocks.verificationToken.findFirst).toHaveBeenCalledWith({
      where: { tokenIndex: tokenIndex(presented) },
    });
    // The whole point: no O(n) sweep on the happy path.
    expect(prismaMocks.verificationToken.findMany).not.toHaveBeenCalled();
  });

  it('resolves a token that sorts beyond the old 50-row window', async () => {
    // This is the correctness bug the index removes: 500 unexpired rows exist,
    // but the indexed lookup never enumerates them.
    const presented = 'v_beyond_window';
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findFirst.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'hashed-row',
      tokenIndex: tokenIndex(presented),
      purpose: 'verify',
      expires: new Date(Date.now() + 60_000),
    });

    const found = await resolveVerificationToken(presented);
    expect(found).not.toBeNull();
    expect(prismaMocks.verificationToken.findMany).not.toHaveBeenCalled();
  });

  it('still performs the bcrypt check, which stays authoritative', async () => {
    const presented = 'v_presented';
    prismaMocks.verificationToken.findFirst.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'hashed-row',
      tokenIndex: tokenIndex(presented),
      purpose: 'verify',
      expires: new Date(Date.now() + 60_000),
    });
    // Digest matches but bcrypt does not: the row must be rejected.
    mockBcryptCompare.mockResolvedValue(false);

    expect(await resolveVerificationToken(presented)).toBeNull();
    expect(mockBcryptCompare).toHaveBeenCalledWith(presented, 'hashed-row');
  });

  it('rejects an expired row found by index', async () => {
    const presented = 'v_expired';
    prismaMocks.verificationToken.findFirst.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'hashed-row',
      tokenIndex: tokenIndex(presented),
      purpose: 'verify',
      expires: new Date(Date.now() - 60_000),
    });

    expect(await resolveVerificationToken(presented)).toBeNull();
  });

  it('rejects a purpose mismatch on an indexed row', async () => {
    const presented = 'v_presented';
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findFirst.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'hashed-row',
      tokenIndex: tokenIndex(presented),
      purpose: 'reset', // consumed by the wrong route
      expires: new Date(Date.now() + 60_000),
    });

    expect(await resolveVerificationToken(presented, { purpose: 'verify' })).toBeNull();
  });

  it('accepts a legacy row (null purpose) from either route', async () => {
    const presented = 'v_legacy';
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findFirst.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'hashed-row',
      tokenIndex: tokenIndex(presented),
      purpose: null, // legacy row written before purpose was recorded
      expires: new Date(Date.now() + 60_000),
    });

    expect(await resolveVerificationToken(presented, { purpose: 'verify' })).not.toBeNull();
    expect(await resolveVerificationToken(presented, { purpose: 'reset' })).not.toBeNull();
  });
});

describe('resolveVerificationToken — legacy fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = SECRET;
    prismaMocks.verificationToken.findFirst.mockResolvedValue(null);
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it('falls back to a bounded sweep for rows with no index', async () => {
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findMany.mockResolvedValue([
      { identifier: 'legacy@example.com', token: 'hashed-row', tokenIndex: null, purpose: null, expires: new Date(Date.now() + 60_000) },
    ]);

    const found = await resolveVerificationToken('v_legacy');

    expect(found!.identifier).toBe('legacy@example.com');
    // The fallback must be bounded so it cannot become a DoS amplifier.
    const [query] = prismaMocks.verificationToken.findMany.mock.calls[0];
    expect(query.take).toBe(50);
    expect(query.where.tokenIndex).toBeNull();
    expect(query.where.expires).toEqual({ gt: expect.any(Date) });
  });

  it('caps the sweep at 50 candidates', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    prismaMocks.verificationToken.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        identifier: `u${i}@example.com`, token: `h${i}`, tokenIndex: null, purpose: null, expires: new Date(),
      }))
    );

    expect(await resolveVerificationToken('v_missing')).toBeNull();
    expect(mockBcryptCompare).toHaveBeenCalledTimes(50);
  });

  it('does not sweep when the index is configured and no row matched', async () => {
    // An unknown token must not fall through to the sweep: that would restore
    // the unbounded-cost behaviour for every failed guess.
    prismaMocks.verificationToken.findFirst.mockResolvedValue(null);
    prismaMocks.verificationToken.findMany.mockResolvedValue([]);

    expect(await resolveVerificationToken('v_unknown')).toBeNull();
    expect(prismaMocks.verificationToken.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMocks.verificationToken.findMany.mock.calls[0][0].where.tokenIndex).toBeNull();
  });

  it('works with no AUTH_SECRET at all (index unavailable)', async () => {
    delete process.env.AUTH_SECRET;
    mockBcryptCompare.mockResolvedValue(true);
    prismaMocks.verificationToken.findMany.mockResolvedValue([
      { identifier: 'u@example.com', token: 'hashed', tokenIndex: null, purpose: null, expires: new Date(Date.now() + 60_000) },
    ]);

    const found = await resolveVerificationToken('v_legacy');
    expect(found!.identifier).toBe('u@example.com');
    // Without an index the sweep must not filter on tokenIndex, which does not
    // necessarily exist in the deployed schema yet.
    expect(prismaMocks.verificationToken.findMany.mock.calls[0][0].where.tokenIndex).toBeUndefined();
  });

  it('rejects empty and non-string tokens without touching the database', async () => {
    expect(await resolveVerificationToken('')).toBeNull();
    expect(await resolveVerificationToken(undefined as unknown as string)).toBeNull();
    expect(prismaMocks.verificationToken.findFirst).not.toHaveBeenCalled();
    expect(prismaMocks.verificationToken.findMany).not.toHaveBeenCalled();
  });
});

describe('consumeVerificationToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('deletes by stored hash', async () => {
    await consumeVerificationToken('hashed-row');
    expect(prismaMocks.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'hashed-row' } });
  });

  it('never throws when the row is already gone', async () => {
    prismaMocks.verificationToken.deleteMany.mockRejectedValue(new Error('record not found'));
    await expect(consumeVerificationToken('gone')).resolves.toBeUndefined();
  });
});