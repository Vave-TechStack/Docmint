import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique } },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed-password') },
  hash: vi.fn(async () => 'hashed-password'),
}));

import { POST } from './route';
import { resetRateLimitsForTests } from '@/lib/rate-limit';

const payload = {
  name: 'Test User',
  companyName: 'Test Company',
  email: 'test@example.com',
  mobile: '1234567890',
  address: 'Test address',
};

function post(password: string): Promise<Response> {
  return POST(new NextRequest('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, password }),
  }));
}

describe('POST /api/auth/signup password policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    findUnique.mockResolvedValue({ id: 'existing-user' });
  });

  it('accepts a password at the 72-byte boundary', async () => {
    const response = await post('a'.repeat(72));
    expect(response.status).toBe(409);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects over-limit ASCII and multibyte passwords before database work', async () => {
    const ascii = await post('a'.repeat(73));
    const unicode = await post('😀'.repeat(19));
    expect(ascii.status).toBe(400);
    expect(unicode.status).toBe(400);
    expect((await unicode.json()).error).toMatch(/72 UTF-8 bytes/);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
