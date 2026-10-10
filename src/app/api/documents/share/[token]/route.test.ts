import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, engineMocks } = vi.hoisted(() => ({
  prismaMocks: {
    documentShare: { findUnique: vi.fn() },
  },
  engineMocks: {
    getSharedDocument: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/engine/document-engine', () => ({
  DocumentEngine: {
    getSharedDocument: engineMocks.getSharedDocument,
  },
}));

import { GET } from './route';
import { resetRateLimitsForTests } from '@/lib/rate-limit';
import { SHARE_PASSWORD_MAX_ATTEMPTS } from '@/lib/security/share-limit';

const PROTECTED_SHARE = {
  id: 'share_1',
  token: 'tok_1',
  password: 'hashed',
  isActive: true,
  expiresAt: null,
  maxDownloads: null,
  downloadCount: 0,
};

function get(password?: string, ip = '203.0.113.5'): Promise<Response> {
  const url = new URL('http://localhost:3000/api/documents/share/tok_1');
  if (password !== undefined) url.searchParams.set('password', password);
  const request = new NextRequest(url, {
    headers: {
      // x-real-ip is set by nginx to $remote_addr and is the value the shared
      // extractor prefers.
      'x-real-ip': ip,
    },
  });
  return GET(request, { params: Promise.resolve({ token: 'tok_1' }) });
}

describe('GET /api/documents/share/[token] — brute-force protection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetRateLimitsForTests();
    prismaMocks.documentShare.findUnique.mockResolvedValue(PROTECTED_SHARE);
    engineMocks.getSharedDocument.mockResolvedValue({
      success: false,
      error: 'Invalid password',
    });
  });

  it('allows a normal number of attempts before throttling', async () => {
    for (let i = 0; i < SHARE_PASSWORD_MAX_ATTEMPTS; i++) {
      const res = await get(`guess-${i}`);
      expect(res.status).toBe(200);
    }
    expect(engineMocks.getSharedDocument).toHaveBeenCalledTimes(SHARE_PASSWORD_MAX_ATTEMPTS);
  });

  it('blocks further password guesses with 429 once the budget is spent', async () => {
    for (let i = 0; i < SHARE_PASSWORD_MAX_ATTEMPTS; i++) {
      await get(`guess-${i}`);
    }
    const res = await get('one-too-many');
    expect(res.status).toBe(429);
    // Crucially, no further bcrypt comparison is performed.
    expect(engineMocks.getSharedDocument).toHaveBeenCalledTimes(SHARE_PASSWORD_MAX_ATTEMPTS);
  });

  it('does not let a rotated source IP reset the per-token budget', async () => {
    for (let i = 0; i < SHARE_PASSWORD_MAX_ATTEMPTS; i++) {
      await get(`guess-${i}`, `198.51.100.${i}`);
    }
    // A fresh IP on the next attempt must not restore the token's budget.
    const res = await get('guess-again', '198.51.100.99');
    expect(res.status).toBe(429);
  });

  it('throttles a spray across many tokens from one IP', async () => {
    // The per-IP budget is a multiple of the per-token one, so a single source
    // hammering distinct share links still hits a ceiling.
    let throttled = false;
    for (let i = 0; i < SHARE_PASSWORD_MAX_ATTEMPTS * 6; i++) {
      prismaMocks.documentShare.findUnique.mockResolvedValue({
        ...PROTECTED_SHARE,
        token: `tok_${i}`,
      });
      const res = await get('guess', '203.0.113.200');
      if (res.status === 429) {
        throttled = true;
        break;
      }
    }
    expect(throttled).toBe(true);
  });

  it('does not consume the budget for a plain link view with no password', async () => {
    engineMocks.getSharedDocument.mockResolvedValue({ success: true, data: { id: 'doc_1' } });
    // The legitimate recipient loading the page repeatedly must not be throttled.
    for (let i = 0; i < SHARE_PASSWORD_MAX_ATTEMPTS * 3; i++) {
      const res = await get(undefined);
      expect(res.status).toBe(200);
    }
  });

  it('still enforces the password server-side, not just by rate limit', async () => {
    const res = await get('wrong');
    expect(engineMocks.getSharedDocument).toHaveBeenCalledWith('tok_1', 'wrong');
    expect((await res.json()).success).toBe(false);
  });

  // ─── Soft-delete defense (share link + deleted document) ───

  describe('soft-deleted document defense', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      resetRateLimitsForTests();
    });

    it('denies access when getSharedDocument reports deleted document', async () => {
      prismaMocks.documentShare.findUnique.mockResolvedValue(PROTECTED_SHARE);
      engineMocks.getSharedDocument.mockResolvedValue({
        success: false,
        error: 'Share link not found',
      });

      const res = await get(undefined);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('Share link not found');
    });

    it('denies access when getSharedDocument reports revoked share (not deleted)', async () => {
      prismaMocks.documentShare.findUnique.mockResolvedValue(PROTECTED_SHARE);
      engineMocks.getSharedDocument.mockResolvedValue({
        success: false,
        error: 'This share link has been revoked',
      });

      const res = await get(undefined);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('This share link has been revoked');
    });

    it('allows access for active document + active share (no regression)', async () => {
      prismaMocks.documentShare.findUnique.mockResolvedValue(PROTECTED_SHARE);
      engineMocks.getSharedDocument.mockResolvedValue({
        success: true,
        data: { id: 'doc_1', title: 'Active Doc' },
      });

      const res = await get(undefined);
      expect(res.status).toBe(200);
    });
  });
});
