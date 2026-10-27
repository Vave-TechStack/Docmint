import { test, expect } from '@playwright/test';
import { assertStagingTarget, requireEnv, DESTRUCTIVE } from './support/staging';

/**
 * Role-change staleness: the audit found that authorization decisions
 * read `role` straight off the JWT. With no session maxAge the Auth.js
 * default token lifetime is 30 days, so a demoted administrator kept
 * admin access for up to a month.
 *
 * The fix revalidates the role against the database on every guarded
 * request and invalidates the user cache on role change. This suite
 * proves the end-to-end behaviour: an EXISTING session whose token
 * still carries the old role must lose access immediately after the
 * authorized demotion.
 *
 * NOT EXECUTED in the current environment: requires a deployed staging
 * origin, a SUPER_ADMIN account and an ADMIN account in the same
 * organization.
 *
 * Setup contract:
 *   STAGING_SUPER_ADMIN_EMAIL / STAGING_SUPER_ADMIN_PASSWORD
 *   STAGING_DEMOTE_ADMIN_EMAIL / STAGING_DEMOTE_ADMIN_PASSWORD
 *     an ADMIN (not SUPER_ADMIN) in the SAME organization
 */
test.describe(`admin role staleness ${DESTRUCTIVE}`, () => {
  test.beforeAll(() => {
    assertStagingTarget();
  });

  test('a demoted admin loses access on the existing session immediately', async ({ playwright }) => {
    // Two isolated cookie jars: one per principal. A single shared
    // context would overwrite the session cookie and hide the bug.
    const adminSession = await playwright.request.newContext();
    const superAdminSession = await playwright.request.newContext();

    // 1. The target admin signs in and demonstrably has admin access.
    const before = await signIn(
      adminSession,
      requireEnv('STAGING_DEMOTE_ADMIN_EMAIL'),
      requireEnv('STAGING_DEMOTE_ADMIN_PASSWORD')
    );
    expect(before.status(), 'target admin sign-in failed').toBe(200);

    const accessBefore = await adminSession.get('/api/admin/users');
    expect(
      accessBefore.status(),
      'target admin had no admin access before demotion'
    ).toBe(200);

    // 2. The super admin performs the authorized demotion through the
    //    administrative workflow.
    await signIn(
      superAdminSession,
      requireEnv('STAGING_SUPER_ADMIN_EMAIL'),
      requireEnv('STAGING_SUPER_ADMIN_PASSWORD')
    );

    const targetUserId = await resolveUserId(
      superAdminSession,
      requireEnv('STAGING_DEMOTE_ADMIN_EMAIL')
    );

    const demote = await superAdminSession.patch('/api/admin/users', {
      headers: { origin: origin() },
      data: { userId: targetUserId, action: 'make_user' },
    });
    expect(demote.status(), 'authorized demotion was rejected').toBe(200);

    // 3. THE STALENESS CHECK. The admin's session cookie (and the JWT
    //    inside it) is unchanged and still claims the ADMIN role. If
    //    the app trusts the token, the next admin call succeeds and
    //    this test fails.
    const accessAfter = await adminSession.get('/api/admin/users');
    expect(
      accessAfter.status(),
      'stale admin privileges survived the demotion'
    ).toBe(403);

    const dashboard = await adminSession.get('/api/admin/dashboard');
    expect(dashboard.status()).toBe(403);

    // 4. Restore the account so the staging fixture stays reusable.
    await superAdminSession.patch('/api/admin/users', {
      headers: { origin: origin() },
      data: { userId: targetUserId, action: 'make_admin' },
    });

    await adminSession.dispose();
    await superAdminSession.dispose();
  });

  test('a non-super admin cannot change roles', async ({ playwright }) => {
    const adminSession = await playwright.request.newContext();
    const superAdminSession = await playwright.request.newContext();

    await signIn(
      adminSession,
      requireEnv('STAGING_DEMOTE_ADMIN_EMAIL'),
      requireEnv('STAGING_DEMOTE_ADMIN_PASSWORD')
    );
    await signIn(
      superAdminSession,
      requireEnv('STAGING_SUPER_ADMIN_EMAIL'),
      requireEnv('STAGING_SUPER_ADMIN_PASSWORD')
    );

    // A plain ADMIN attempting to promote someone: role changes are a
    // system-level privilege reserved for SUPER_ADMIN.
    const targetUserId = await resolveUserId(
      superAdminSession,
      requireEnv('STAGING_DEMOTE_ADMIN_EMAIL')
    );

    const res = await adminSession.patch('/api/admin/users', {
      headers: { origin: origin() },
      data: { userId: targetUserId, action: 'make_admin' },
    });
    expect(res.status()).toBe(403);

    await adminSession.dispose();
    await superAdminSession.dispose();
  });

  test('anonymous callers cannot list users', async ({ request }) => {
    const res = await request.get('/api/admin/users');
    expect([401, 403]).toContain(res.status());
  });
});

function origin(): string {
  return new URL(requireEnv('STAGING_BASE_URL')).origin;
}

async function signIn(
  session: import('@playwright/test').APIRequestContext,
  email: string,
  password: string
): Promise<import('@playwright/test').APIResponse> {
  const csrfRes = await session.get('/api/auth/csrf');
  const csrfToken = csrfRes.ok() ? (await csrfRes.json()).csrfToken ?? '' : '';

  return session.post('/api/auth/callback/credentials', {
    form: { email, password, csrfToken },
    headers: { origin: origin() },
  });
}

/** Looks up a user id by email through the admin list endpoint. */
async function resolveUserId(
  superAdminSession: import('@playwright/test').APIRequestContext,
  email: string
): Promise<string> {
  const res = await superAdminSession.get(
    `/api/admin/users?search=${encodeURIComponent(email)}`
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  const users = Array.isArray(body?.data) ? body.data : [];
  const match = users.find((u: { email?: string }) => u.email === email.toLowerCase());
  if (!match?.id) {
    throw new Error(`Could not resolve user id for ${email} via the admin users list`);
  }
  return match.id;
}
