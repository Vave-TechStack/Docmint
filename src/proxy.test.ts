import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { EncryptJWT } from 'jose';

const AUTH_SECRET = 'test-secret-for-proxy-tests-123456';
process.env.AUTH_SECRET = AUTH_SECRET;

const { default: proxy } = await import('@/proxy');

/** Replicates @auth/core/jwt.getDerivedEncryptionKey (HKDF-SHA256). */
async function deriveKey(secret: string, salt: string, length = 64): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(salt),
      info: enc.encode(`Auth.js Generated Encryption Key (${salt})`),
    },
    keyMaterial,
    length * 8
  );
  return new Uint8Array(bits);
}

/** Signs a real Auth.js-style JWE session token (dir / A256CBC-HS512). */
async function signToken(
  payload: Record<string, unknown>,
  salt: string,
  expiresInSec = 3600
): Promise<string> {
  const key = await deriveKey(AUTH_SECRET, salt);
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT({ ...payload, iat: now, exp: now + expiresInSec })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
    .encrypt(key);
}

function makeRequest(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers['cookie'] = cookie;
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

const SALT = 'authjs.session-token';
const SECURE_SALT = '__Secure-authjs.session-token';

describe('proxy auth gate', () => {
  it('redirects unauthenticated visitors away from protected pages', async () => {
    const res = await proxy(makeRequest('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects for /documents and /admin subpaths too', async () => {
    expect((await proxy(makeRequest('/documents/abc'))).status).toBe(307);
    expect((await proxy(makeRequest('/admin/users'))).status).toBe(307);
    expect((await proxy(makeRequest('/templates/new'))).status).toBe(307);
    expect((await proxy(makeRequest('/templates/xyz/edit'))).status).toBe(307);
  });

  it('does not redirect public pages or API routes', async () => {
    const publicPaths = [
      '/',
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/pricing',
      '/instant/offer-letter',
      '/templates',
      '/templates/xyz',
      '/share/token123',
      '/api/documents',
    ];
    for (const path of publicPaths) {
      const res = await proxy(makeRequest(path));
      expect(res.status, path).toBe(200);
    }
  });

  it('lets a real Auth.js JWE session token through', async () => {
    const token = await signToken({ sub: 'user_1', role: 'USER' }, SALT);
    const res = await proxy(makeRequest('/dashboard', `authjs.session-token=${token}`));
    expect(res.status).toBe(200);
  });

  it('accepts the __Secure- cookie name (production https) with its own salt', async () => {
    const token = await signToken({ sub: 'user_1' }, SECURE_SALT);
    const res = await proxy(makeRequest('/settings', `__Secure-authjs.session-token=${token}`));
    expect(res.status).toBe(200);
  });

  it('rejects a token derived from the wrong secret', async () => {
    const wrongKey = await deriveKey('wrong-secret', SALT);
    const now = Math.floor(Date.now() / 1000);
    const token = await new EncryptJWT({ sub: 'user_1', iat: now, exp: now + 3600 })
      .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
      .encrypt(wrongKey);
    const res = await proxy(makeRequest('/dashboard', `authjs.session-token=${token}`));
    expect(res.status).toBe(307);
  });

  it('rejects an expired token', async () => {
    // Expired beyond jose's 15s clock tolerance (mirrors Auth.js decode).
    const token = await signToken({ sub: 'user_1' }, SALT, -120);
    const res = await proxy(makeRequest('/dashboard', `authjs.session-token=${token}`));
    expect(res.status).toBe(307);
  });

  it('rejects a plain 3-part JWS (non-Auth.js token)', async () => {
    const res = await proxy(
      makeRequest('/dashboard', 'authjs.session-token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalidsig')
    );
    expect(res.status).toBe(307);
  });

  it('still sets security headers on responses', async () => {
    const res = await proxy(makeRequest('/'));
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});
