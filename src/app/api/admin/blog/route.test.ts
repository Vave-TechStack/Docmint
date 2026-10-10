import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    blogPost: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';

import { GET, POST, PATCH, DELETE } from './route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const USER_SESSION = { user: { id: 'user_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } };

const VALID = { title: 'Hello World', content: 'Some body' };

function call(fn: typeof GET, method: string, body?: unknown, query = '', origin = 'http://localhost:3000'): Promise<Response> {
  return fn(
    new NextRequest(`http://localhost:3000/api/admin/blog${query}`, {
      method,
      headers: { 'content-type': 'application/json', origin },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  ) as Promise<Response>;
}

describe('/api/admin/blog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.blogPost.findMany.mockResolvedValue([]);
    prismaMocks.blogPost.count.mockResolvedValue(0);
    prismaMocks.blogPost.findUnique.mockResolvedValue(null);
    prismaMocks.blogPost.create.mockResolvedValue({ id: 'post_1' });
    prismaMocks.blogPost.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.blogPost.deleteMany.mockResolvedValue({ count: 1 });
  });

  // BlogPost is global (no organizationId) and renders on the public site, so
  // a tenant admin must not be able to author/unpublish platform content.
  describe('privilege boundary', () => {
    it('GET denies a tenant ADMIN', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      expect((await call(GET, 'GET')).status).toBe(403);
      expect(prismaMocks.blogPost.findMany).not.toHaveBeenCalled();
    });

    it('POST denies a tenant ADMIN', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      expect((await call(POST, 'POST', VALID)).status).toBe(403);
      expect(prismaMocks.blogPost.create).not.toHaveBeenCalled();
    });

    it('PATCH denies a tenant ADMIN', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      expect((await call(PATCH, 'PATCH', { id: 'post_1', status: 'DRAFT' })).status).toBe(403);
      expect(prismaMocks.blogPost.updateMany).not.toHaveBeenCalled();
    });

    it('DELETE denies a tenant ADMIN', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      expect((await call(DELETE, 'DELETE', undefined, '?id=post_1')).status).toBe(403);
      expect(prismaMocks.blogPost.deleteMany).not.toHaveBeenCalled();
    });

    it('allows a SUPER_ADMIN through', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      expect((await call(GET, 'GET')).status).toBe(200);
    });

    it('rejects a non-admin', async () => {
      authMocks.auth.mockResolvedValue(USER_SESSION);
      expect((await call(GET, 'GET')).status).toBe(403);
    });

    it('returns 401 when unauthenticated', async () => {
      authMocks.auth.mockResolvedValue(null);
      expect((await call(GET, 'GET')).status).toBe(401);
    });
  });

  describe('POST validation', () => {
    beforeEach(() => authMocks.auth.mockResolvedValue(SUPER_SESSION));

    it('rejects a cross-origin create (CSRF)', async () => {
      const res = await call(POST, 'POST', VALID, '', 'https://evil.example');
      expect(res.status).toBe(403);
      expect(prismaMocks.blogPost.create).not.toHaveBeenCalled();
    });

    it('rejects a missing title', async () => {
      expect((await call(POST, 'POST', { content: 'x' })).status).toBe(400);
    });

    it('rejects an arbitrary status string instead of writing it to the enum', async () => {
      const res = await call(POST, 'POST', { ...VALID, status: 'NOT_A_STATUS' });
      expect(res.status).toBe(400);
      expect(prismaMocks.blogPost.create).not.toHaveBeenCalled();
    });

    it('caps an oversized content body', async () => {
      const res = await call(POST, 'POST', { title: 'T', content: 'x'.repeat(300_000) });
      expect(res.status).toBe(400);
    });

    it('produces a bounded slug for a long unicode title', async () => {
      await call(POST, 'POST', { title: 'é'.repeat(400), content: 'body' });
      const slug = prismaMocks.blogPost.create.mock.calls[0][0].data.slug as string;
      expect(slug.length).toBeLessThanOrEqual(160);
    });

    it('accepts a valid post', async () => {
      expect((await call(POST, 'POST', VALID)).status).toBe(200);
      expect(prismaMocks.blogPost.create).toHaveBeenCalled();
    });
  });

  describe('PATCH', () => {
    beforeEach(() => authMocks.auth.mockResolvedValue(SUPER_SESSION));

    it('rejects a cross-origin update (CSRF)', async () => {
      const res = await call(PATCH, 'PATCH', { id: 'post_1', title: 'x' }, '', 'https://evil.example');
      expect(res.status).toBe(403);
    });

    it('rejects an unknown status enum', async () => {
      expect((await call(PATCH, 'PATCH', { id: 'post_1', status: 'NOPE' })).status).toBe(400);
    });

    it('404s for a missing post instead of throwing', async () => {
      prismaMocks.blogPost.updateMany.mockResolvedValue({ count: 0 });
      expect((await call(PATCH, 'PATCH', { id: 'gone', title: 'x' })).status).toBe(404);
    });

    it('rejects a body with no recognised fields', async () => {
      expect((await call(PATCH, 'PATCH', { id: 'post_1', junk: 1 })).status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('404s for a missing post', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      prismaMocks.blogPost.deleteMany.mockResolvedValue({ count: 0 });
      expect((await call(DELETE, 'DELETE', undefined, '?id=gone')).status).toBe(404);
    });

    it('requires an id', async () => {
      authMocks.auth.mockResolvedValue(SUPER_SESSION);
      expect((await call(DELETE, 'DELETE')).status).toBe(400);
    });
  });
});
