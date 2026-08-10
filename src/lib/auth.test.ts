import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – these are hoisted above imports, so they run BEFORE auth.ts loads.
// This prevents the top-level NextAuth() IIFE from crashing due to missing
// env vars or side effects during unit tests.
// ---------------------------------------------------------------------------

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: async () => null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  })),
  DefaultSession: {},
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn(() => ({ id: 'credentials', name: 'credentials' })),
}));

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(() => ({ id: 'google', name: 'Google' })),
}));

vi.mock('next-auth/providers/microsoft-entra-id', () => ({
  default: vi.fn(() => ({ id: 'microsoft-entra-id', name: 'Microsoft' })),
}));

const mockBcryptCompare = vi.hoisted(() => vi.fn());

vi.mock('bcryptjs', () => ({
  default: {
    compare: mockBcryptCompare,
  },
  compare: mockBcryptCompare,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports – resolve after mocks thanks to vi.mock hoisting.
// ---------------------------------------------------------------------------

import { jwtCallback, sessionCallback, signInCallback, redirectCallback, authorizeCallback } from './auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Tests: JWT Callback
// ---------------------------------------------------------------------------

describe('jwtCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set custom fields from credentials user onto the token', async () => {
    const token: Record<string, unknown> = { sub: 'existing-sub' };
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      organizationName: 'My Org',
      role: 'ADMIN',
      emailVerified: '2024-01-15T00:00:00.000Z',
    };

    const result = await jwtCallback({ token, user, account: { provider: 'credentials' } });

    expect(result.id).toBe('user-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.organizationName).toBe('My Org');
    expect(result.role).toBe('ADMIN');
    expect(result.emailVerified).toBe('2024-01-15T00:00:00.000Z');
    expect(result.sub).toBe('existing-sub'); // preserves existing fields
  });

  it('should default role to USER when user has no role', async () => {
    const token: Record<string, unknown> = {};
    const user = { id: 'user-1', organizationId: 'org-1' };

    const result = await jwtCallback({ token, user, account: { provider: 'credentials' } });

    expect(result.role).toBe('USER');
  });

  it('should handle user with no emailVerified gracefully', async () => {
    const token: Record<string, unknown> = {};
    const user = { id: 'user-1', organizationId: 'org-1', role: 'USER' };

    const result = await jwtCallback({ token, user, account: { provider: 'credentials' } });

    expect(result.emailVerified).toBeUndefined();
  });

  it('should return the token unchanged when no user is provided (token refresh)', async () => {
    const token: Record<string, unknown> = {
      sub: 'existing',
      organizationId: 'org-1',
      role: 'USER',
    };

    const result = await jwtCallback({ token, user: undefined, account: null });

    expect(result).toEqual({
      sub: 'existing',
      organizationId: 'org-1',
      role: 'USER',
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should fetch org from database for OAuth sign-ins', async () => {
    const mockDbUser = {
      organizationId: 'oauth-org',
      organization: { name: 'OAuth Org' },
      role: 'MEMBER',
    };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockDbUser);

    const token: Record<string, unknown> = { email: 'oauth@example.com' };
    const user = {};
    const account = { provider: 'google' };

    const result = await jwtCallback({ token, user, account });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'oauth@example.com' },
      include: { organization: true },
    });
    expect(result.organizationId).toBe('oauth-org');
    expect(result.organizationName).toBe('OAuth Org');
    expect(result.role).toBe('MEMBER');
  });

  it('should not crash when OAuth DB lookup returns null', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const token: Record<string, unknown> = { email: 'unknown@example.com' };
    const user = {};
    const account = { provider: 'google' };

    const result = await jwtCallback({ token, user, account });

    expect(result.email).toBe('unknown@example.com');
    expect(result.organizationId).toBeUndefined();
  });

  it('should not fetch DB for credentials provider', async () => {
    const token: Record<string, unknown> = {};
    const user = { id: 'u-1', organizationId: 'org-1', role: 'USER' };
    const account = { provider: 'credentials' };

    await jwtCallback({ token, user, account });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should handle OAuth user without account gracefully', async () => {
    const token: Record<string, unknown> = {};
    const user = { id: 'u-1' };

    const result = await jwtCallback({ token, user, account: undefined });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(result.id).toBe('u-1');
  });
});

// ---------------------------------------------------------------------------
// Tests: Session Callback
// ---------------------------------------------------------------------------

describe('sessionCallback', () => {
  it('should map custom token fields to session user', async () => {
    const session = { user: {} };
    const token: Record<string, unknown> = {
      id: 'user-1',
      organizationId: 'org-1',
      organizationName: 'My Org',
      role: 'ADMIN',
      emailVerified: '2024-01-15T00:00:00.000Z',
    };

    const result = await sessionCallback({ session, token });

    expect(result.user?.id).toBe('user-1');
    expect(result.user?.organizationId).toBe('org-1');
    expect(result.user?.organizationName).toBe('My Org');
    expect(result.user?.role).toBe('ADMIN');
    expect(result.user?.emailVerified).toBe('2024-01-15T00:00:00.000Z');
  });

  it('should default role to USER when token has no role', async () => {
    const session = { user: {} };
    const token: Record<string, unknown> = { id: 'user-1' };

    const result = await sessionCallback({ session, token });

    expect(result.user?.role).toBe('USER');
  });

  it('should pass through emailVerified as null when token has null', async () => {
    const session = { user: {} };
    const token: Record<string, unknown> = {
      id: 'user-1',
      emailVerified: null,
    };

    const result = await sessionCallback({ session, token });

    expect(result.user?.emailVerified).toBeNull();
  });

  it('should leave emailVerified undefined when token lacks it', async () => {
    const session = { user: {} };
    const token: Record<string, unknown> = { id: 'user-1', role: 'USER' };

    const result = await sessionCallback({ session, token });

    expect(result.user?.emailVerified).toBeUndefined();
  });

  it('should return session unchanged when session has no user', async () => {
    const session = { user: null };
    const token: Record<string, unknown> = {
      id: 'user-1',
      organizationId: 'org-1',
    };

    const result = await sessionCallback({ session, token });

    expect(result.user).toBeNull();
  });

  it('should preserve existing session fields', async () => {
    const session = { user: { name: 'John', email: 'john@example.com' } };
    const token: Record<string, unknown> = { id: 'user-1', role: 'USER' };

    const result = await sessionCallback({ session, token });

    expect(result.user?.name).toBe('John');
    expect(result.user?.email).toBe('john@example.com');
    expect(result.user?.id).toBe('user-1');
  });

  it('should handle session with undefined user', async () => {
    const session = { user: undefined };
    const token: Record<string, unknown> = { id: 'user-1', role: 'USER' };

    const result = await sessionCallback({ session, token });

    expect(result.user).toBeUndefined();
  });

  it('should map organizationId as undefined when not in token', async () => {
    const session = { user: {} };
    const token: Record<string, unknown> = { id: 'user-1', role: 'USER' };

    const result = await sessionCallback({ session, token });

    expect(result.user?.organizationId).toBeUndefined();
    expect(result.user?.organizationName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: SignIn Callback
// ---------------------------------------------------------------------------

describe('signInCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should always allow credentials sign-ins', async () => {
    const result = await signInCallback({
      user: { email: 'test@example.com' },
      account: { provider: 'credentials' },
    });

    expect(result).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should allow Google sign-in when user does not exist yet', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await signInCallback({
      user: { email: 'new@google.com', name: 'New User' },
      account: { provider: 'google' },
    });

    expect(result).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'new@google.com' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should update existing user profile on Google sign-in', async () => {
    const mockExisting = {
      id: 'existing-id',
      email: 'existing@google.com',
      name: 'Old Name',
      image: null,
    };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockExisting);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await signInCallback({
      user: { email: 'existing@google.com', name: 'New Name', image: 'https://pic.com/avatar' },
      account: { provider: 'google' },
    });

    expect(result).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: 'existing@google.com' },
      data: {
        image: 'https://pic.com/avatar',
        name: 'New Name',
      },
    });
  });

  it('should fall back to existing image/name when OAuth does not provide them', async () => {
    const mockExisting = {
      id: 'existing-id',
      email: 'existing@google.com',
      name: 'Old Name',
      image: 'https://pic.com/old',
    };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockExisting);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await signInCallback({
      user: { email: 'existing@google.com', name: null, image: null },
      account: { provider: 'google' },
    });

    expect(result).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: 'existing@google.com' },
      data: {
        image: mockExisting.image,
        name: mockExisting.name,
      },
    });
  });

  it('should reject Google sign-in when user has no email', async () => {
    const result = await signInCallback({
      user: { email: null },
      account: { provider: 'google' },
    });

    expect(result).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should allow Microsoft sign-in when user does not exist', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await signInCallback({
      user: { email: 'new@microsoft.com' },
      account: { provider: 'microsoft-entra-id' },
    });

    expect(result).toBe(true);
  });

  it('should update existing user on Microsoft sign-in', async () => {
    const mockExisting = {
      id: 'existing-ms',
      email: 'existing@microsoft.com',
      name: 'Old Name',
      image: null,
    };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockExisting);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await signInCallback({
      user: { email: 'existing@microsoft.com', name: 'New Name' },
      account: { provider: 'microsoft-entra-id' },
    });

    expect(result).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('should reject sign-ins from unknown providers', async () => {
    const result = await signInCallback({
      user: { email: 'test@example.com' },
      account: { provider: 'github' },
    });

    expect(result).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should handle missing account gracefully', async () => {
    const result = await signInCallback({
      user: { email: 'test@example.com' },
      account: undefined,
    });

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Redirect Callback
// ---------------------------------------------------------------------------

describe('redirectCallback', () => {
  it('should redirect relative URLs to baseUrl + url', () => {
    const result = redirectCallback({
      url: '/dashboard',
      baseUrl: 'http://localhost:3000',
    });

    expect(result).toBe('http://localhost:3000/dashboard');
  });

  it('should return same-origin URLs as-is', () => {
    const result = redirectCallback({
      url: 'http://localhost:3000/settings',
      baseUrl: 'http://localhost:3000',
    });

    expect(result).toBe('http://localhost:3000/settings');
  });

  it('should return baseUrl for cross-origin URLs', () => {
    const result = redirectCallback({
      url: 'https://evil.com/phish',
      baseUrl: 'http://localhost:3000',
    });

    expect(result).toBe('http://localhost:3000');
  });

  it('should redirect root path to baseUrl + /', () => {
    const result = redirectCallback({
      url: '/',
      baseUrl: 'https://docmint.com',
    });

    expect(result).toBe('https://docmint.com/');
  });

  it('should redirect nested relative paths', () => {
    const result = redirectCallback({
      url: '/admin/users/123/edit',
      baseUrl: 'https://app.docmint.com',
    });

    expect(result).toBe('https://app.docmint.com/admin/users/123/edit');
  });

  it('should throw on invalid URL', () => {
    expect(() => redirectCallback({
      url: '',
      baseUrl: 'http://localhost:3000',
    })).toThrow();
  });

  it('should handle production URL with subpath', () => {
    const result = redirectCallback({
      url: '/api/auth/callback/google',
      baseUrl: 'https://docmint.com',
    });

    expect(result).toBe('https://docmint.com/api/auth/callback/google');
  });

  it('should treat URLs with different ports as different origins', () => {
    const result = redirectCallback({
      url: 'http://localhost:3001/dashboard',
      baseUrl: 'http://localhost:3000',
    });

    expect(result).toBe('http://localhost:3000');
  });
});

// ---------------------------------------------------------------------------
// Tests: Authorize Callback (Credentials Provider)
// ---------------------------------------------------------------------------

describe('authorizeCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when email is missing', async () => {
    const result = await authorizeCallback({ password: 'pass123' });

    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should return null when password is missing', async () => {
    const result = await authorizeCallback({ email: 'test@example.com' });

    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should return null when credentials is undefined', async () => {
    const result = await authorizeCallback(undefined);

    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should return null when user is not found in the database', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await authorizeCallback({
      email: 'unknown@example.com',
      password: 'pass123',
    });

    expect(result).toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'unknown@example.com' },
      include: { organization: true },
    });
  });

  it('should return null when user has no passwordHash', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: null,
      isActive: true,
    });

    const result = await authorizeCallback({
      email: 'test@example.com',
      password: 'pass123',
    });

    expect(result).toBeNull();
  });

  it('should return null when user is inactive', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: '$2a$10$hash',
      isActive: false,
    });

    const result = await authorizeCallback({
      email: 'test@example.com',
      password: 'pass123',
    });

    expect(result).toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('should return null when password is incorrect', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: '$2a$10$hash',
      isActive: true,
    });
    mockBcryptCompare.mockResolvedValue(false);

    const result = await authorizeCallback({
      email: 'test@example.com',
      password: 'wrong-password',
    });

    expect(result).toBeNull();
    expect(mockBcryptCompare).toHaveBeenCalledWith('wrong-password', '$2a$10$hash');
  });

  it('should return user object when credentials are valid', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://avatar.com/pic',
      passwordHash: '$2a$10$hash',
      isActive: true,
      organizationId: 'org-1',
      organization: { name: 'My Org' },
      role: 'ADMIN',
      emailVerified: new Date('2024-01-15T00:00:00.000Z'),
    };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(true);

    const result = await authorizeCallback({
      email: 'test@example.com',
      password: 'correct-password',
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://avatar.com/pic',
      organizationId: 'org-1',
      organizationName: 'My Org',
      role: 'ADMIN',
      emailVerified: '2024-01-15T00:00:00.000Z',
    });
  });

  it('should return user object with null emailVerified when user has no emailVerified', async () => {
    const mockUser = {
      id: 'user-2',
      email: 'noverify@example.com',
      name: 'No Verify',
      image: null,
      passwordHash: '$2a$10$hash',
      isActive: true,
      organizationId: 'org-1',
      organization: { name: 'Org' },
      role: 'USER',
      emailVerified: null,
    };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(true);

    const result = await authorizeCallback({
      email: 'noverify@example.com',
      password: 'pass123',
    });

    expect(result).toEqual({
      id: 'user-2',
      email: 'noverify@example.com',
      name: 'No Verify',
      image: null,
      organizationId: 'org-1',
      organizationName: 'Org',
      role: 'USER',
      emailVerified: null,
    });
  });

  it('should return null when prisma throws an error', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection failed'));

    const result = await authorizeCallback({
      email: 'test@example.com',
      password: 'pass123',
    });

    expect(result).toBeNull();
  });
});
