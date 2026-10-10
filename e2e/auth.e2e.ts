import { test, expect } from '@playwright/test';
import {
  assertStagingTarget,
  requireEnv,
  testEmail,
  uniqueSuffix,
  DESTRUCTIVE,
} from './support/staging';

/**
 * Authentication lifecycle against the deployed staging origin.
 *
 * Positive email-dependent steps (clicking the verification link,
 * consuming the reset link) require reading mail from the staging
 * mailbox. Those tests are gated on STAGING_VERIFICATION_TOKEN and
 * STAGING_RESET_TOKEN, which the operator pastes from the mailbox —
 * the suite never guesses a token and never claims a mail flow it
 * could not observe.
 *
 * NOT EXECUTED in the current environment: requires a deployed
 * staging origin and staging credentials.
 *
 * Setup contract:
 *   STAGING_USER_A_EMAIL / STAGING_USER_A_PASSWORD  existing VERIFIED user
 *   STAGING_VERIFICATION_TOKEN  optional, from the signup email
 *   STAGING_RESET_TOKEN         optional, from the forgot-password email
 */
test.describe('Authentication lifecycle', () => {
  test.beforeAll(() => {
    assertStagingTarget();
  });

  // Shared across tests in this file: the suite runs with one worker
  // and fullyParallel disabled, so module state is stable.
  let registeredEmail = '';
  let registeredPassword = '';

  test.describe(`signup ${DESTRUCTIVE}`, () => {
    test('creates an account and a new organization', async ({ request }) => {
      registeredEmail = testEmail('e2e-signup');
      registeredPassword = `E2e-${uniqueSuffix()}-Pass!`;

      const res = await request.post('/api/auth/signup', {
        headers: { origin: origin() },
        data: {
          name: 'E2E Signup',
          companyName: `E2E Org ${uniqueSuffix()}`,
          email: registeredEmail,
          mobile: '0000000000',
          gstNumber: '',
          panNumber: '',
          address: 'E2E staging address',
          password: registeredPassword,
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data?.organizationId).toBeTruthy();
      expect(body.data?.organizationSlug).toBeTruthy();
    });

    test('rejects a duplicate email with 409', async ({ request }) => {
      const res = await request.post('/api/auth/signup', {
        headers: { origin: origin() },
        data: {
          name: 'E2E Signup',
          companyName: 'E2E Org Duplicate',
          email: registeredEmail,
          mobile: '0000000000',
          address: 'E2E staging address',
          password: registeredPassword,
        },
      });
      expect(res.status()).toBe(409);
    });

    test('rejects missing required fields with 400', async ({ request }) => {
      const res = await request.post('/api/auth/signup', {
        headers: { origin: origin() },
        data: { email: testEmail('e2e-incomplete') },
      });
      expect(res.status()).toBe(400);
    });
  });

  test.describe('email verification', () => {
    test('rejects a missing token', async ({ request }) => {
      const res = await request.get('/api/auth/verify-email');
      expect(res.status()).toBe(400);
    });

    test('rejects a garbage token', async ({ request }) => {
      const res = await request.get(
        '/api/auth/verify-email?token=not-a-real-token'
      );
      expect(res.status()).toBe(400);
    });

    test('rejects a password-reset token used as a verification token', async ({ request }) => {
      // Purpose confusion: an "r_" reset link must never verify email.
      const res = await request.get(
        '/api/auth/verify-email?token=r_someresetvalue'
      );
      expect(res.status()).toBe(400);
    });

    test('verifies the account when given the emailed link token', async ({ request }) => {
      const token = process.env.STAGING_VERIFICATION_TOKEN ?? '';
      test.skip(!token, 'STAGING_VERIFICATION_TOKEN not provided — paste the token from the staging mailbox');

      const res = await request.get(
        `/api/auth/verify-email?token=${encodeURIComponent(token)}`
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('rejects a replayed verification token', async ({ request }) => {
      const token = process.env.STAGING_VERIFICATION_TOKEN ?? '';
      test.skip(!token, 'STAGING_VERIFICATION_TOKEN not provided');

      // The first consumption happens in the test above; a second use
      // of the same single-use token must fail.
      const res = await request.get(
        `/api/auth/verify-email?token=${encodeURIComponent(token)}`
      );
      expect(res.status()).toBe(400);
    });
  });

  test.describe('login and logout', () => {
    test('signs in an existing verified user and exposes the session', async ({ request }) => {
      const email = requireEnv('STAGING_USER_A_EMAIL');
      const password = requireEnv('STAGING_USER_A_PASSWORD');

      const res = await signIn(request, email, password);
      expect(res.status()).toBe(200);

      const session = await request.get('/api/auth/session');
      expect(session.status()).toBe(200);
      const body = await session.json();
      expect(body?.user?.email).toBe(email.toLowerCase());
    });

    test('rejects a wrong password', async ({ request }) => {
      const res = await signIn(request, requireEnv('STAGING_USER_A_EMAIL'), 'definitely-wrong-password');
      expect(res.status()).toBe(401);
    });

    test('clears the session on sign-out', async ({ request }) => {
      await signIn(request, requireEnv('STAGING_USER_A_EMAIL'), requireEnv('STAGING_USER_A_PASSWORD'));

      const csrf = await request.get('/api/auth/csrf').then((r) => r.json());
      const res = await request.post('/api/auth/signout', {
        headers: { origin: origin() },
        data: { csrfToken: csrf.csrfToken },
      });
      expect([200, 201, 302]).toContain(res.status());

      const session = await request.get('/api/auth/session');
      const body = await session.json();
      expect(body?.user).toBeFalsy();
    });
  });

  test.describe('password reset', () => {
    test('accepts a forgot-password request with a generic response', async ({ request }) => {
      const res = await request.post('/api/auth/forgot-password', {
        headers: { origin: origin() },
        data: { email: requireEnv('STAGING_USER_A_EMAIL') },
      });
      // Always the same generic message: no account enumeration.
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.message).toMatch(/if your email is registered/i);
    });

    test('rejects a malformed email with 400', async ({ request }) => {
      const res = await request.post('/api/auth/forgot-password', {
        headers: { origin: origin() },
        data: { email: 'not-an-email' },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects a verification token used as a reset token', async ({ request }) => {
      const res = await request.post('/api/auth/reset-password', {
        headers: { origin: origin() },
        data: { token: 'v_someverificationvalue', password: 'new-password-123' },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects a garbage reset token', async ({ request }) => {
      const res = await request.post('/api/auth/reset-password', {
        headers: { origin: origin() },
        data: { token: 'r_garbage-token', password: 'new-password-123' },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects a short replacement password', async ({ request }) => {
      const res = await request.post('/api/auth/reset-password', {
        headers: { origin: origin() },
        data: { token: 'r_garbage-token', password: 'short' },
      });
      expect(res.status()).toBe(400);
    });

    test('resets the password when given the emailed reset token', async ({ request }) => {
      const token = process.env.STAGING_RESET_TOKEN;
      test.skip(!token, 'STAGING_RESET_TOKEN not provided — paste the token from the staging mailbox');

      const res = await request.post('/api/auth/reset-password', {
        headers: { origin: origin() },
        data: { token, password: `E2e-${uniqueSuffix()}-NewPass!` },
      });
      expect(res.status()).toBe(200);
    });
  });
});

function origin(): string {
  return new URL(requireEnv('STAGING_BASE_URL')).origin;
}

/**
 * Signs in through the real credentials endpoint.
 *
 * The CSRF token is read from the documented /api/auth/csrf
 * endpoint, with a fallback to the Auth.js CSRF cookie for
 * deployments that only expose the cookie.
 */
async function signIn(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  password: string
): Promise<import('@playwright/test').APIResponse> {
  let csrfToken = '';
  const csrfRes = await request.get('/api/auth/csrf');
  if (csrfRes.ok()) {
    csrfToken = (await csrfRes.json()).csrfToken ?? '';
  }
  if (!csrfToken) {
    const state = await request.storageState({});
    const cookie = state.cookies.find((c) => c.name.endsWith('csrf-token'));
    if (cookie) csrfToken = decodeURIComponent(cookie.value);
  }

  return request.post('/api/auth/callback/credentials', {
    form: { email, password, csrfToken },
    headers: { origin: origin() },
  });
}
