import { test, expect } from '@playwright/test';
import { assertStagingTarget, requireEnv } from './support/staging';

/**
 * Template download access matrix.
 *
 * The download endpoint performs expensive server-side rendering and
 * was historically reachable anonymously with no rate limit. The
 * premium gate must hold: anonymous callers get 401, signed-in
 * callers without an active Premium subscription get 402, and only
 * admins or subscribed organizations get the full document. Free
 * watermarked samples (sample=true) stay free.
 *
 * NOT EXECUTED in the current environment: requires a deployed staging
 * origin and seeded templates.
 *
 * Setup contract:
 *   STAGING_PUBLIC_TEMPLATE_ID    a free, publicly visible template
 *   STAGING_PREMIUM_TEMPLATE_ID   a premium template
 *   STAGING_USER_A_EMAIL / STAGING_USER_A_PASSWORD
 *     a plain USER whose organization has NO active premium subscription
 *   STAGING_PREMIUM_USER_EMAIL / STAGING_PREMIUM_USER_PASSWORD  optional
 *     a user whose organization HAS an active premium subscription
 */
test.describe('Template access', () => {
  test.beforeAll(() => {
    assertStagingTarget();
  });

  test('serves a free watermarked sample of a premium template anonymously', async ({ request }) => {
    const res = await download(request, requireEnv('STAGING_PREMIUM_TEMPLATE_ID'), {
      variables: {},
      format: 'pdf',
      sample: true,
    });

    // Samples are the marketing preview: free, but truncated and
    // watermarked, never the full paid document.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('rejects an anonymous full premium download with 401', async ({ request }) => {
    const res = await download(request, requireEnv('STAGING_PREMIUM_TEMPLATE_ID'), {
      variables: {},
      format: 'pdf',
    });
    expect(res.status()).toBe(401);
  });

  test('rejects a signed-in user without a premium subscription with 402', async ({ request }) => {
    await signIn(request, requireEnv('STAGING_USER_A_EMAIL'), requireEnv('STAGING_USER_A_PASSWORD'));

    const res = await download(request, requireEnv('STAGING_PREMIUM_TEMPLATE_ID'), {
      variables: {},
      format: 'pdf',
    });
    expect(res.status()).toBe(402);
  });

  test('serves a full public template download to a signed-in user', async ({ request }) => {
    await signIn(request, requireEnv('STAGING_USER_A_EMAIL'), requireEnv('STAGING_USER_A_PASSWORD'));

    const res = await download(request, requireEnv('STAGING_PUBLIC_TEMPLATE_ID'), {
      variables: {},
      format: 'pdf',
    });
    expect(res.status()).toBe(200);
  });

  test('serves a full premium download to a subscribed organization', async ({ request }) => {
    const email = process.env.STAGING_PREMIUM_USER_EMAIL;
    test.skip(!email, 'STAGING_PREMIUM_USER_EMAIL not provided — no subscribed staging organization');

    await signIn(request, requireEnv('STAGING_PREMIUM_USER_EMAIL'), requireEnv('STAGING_PREMIUM_USER_PASSWORD'));

    const res = await download(request, requireEnv('STAGING_PREMIUM_TEMPLATE_ID'), {
      variables: {},
      format: 'pdf',
    });
    expect(res.status()).toBe(200);
  });

  test('rejects an unsupported format with 400', async ({ request }) => {
    const res = await download(request, requireEnv('STAGING_PUBLIC_TEMPLATE_ID'), {
      variables: {},
      format: 'exe',
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a missing variables or format field with 400', async ({ request }) => {
    const res = await request.post(
      `/api/templates/${requireEnv('STAGING_PUBLIC_TEMPLATE_ID')}/download`,
      { headers: { origin: origin() }, data: {} }
    );
    expect(res.status()).toBe(400);
  });

  test('treats a forged session cookie as anonymous', async ({ playwright, request }) => {
    // A garbage session cookie must be rejected, not trusted: the
    // premium gate then behaves exactly like the anonymous case.
    await request.get('/'); // establish cookie jar on the origin
    const cookies = await request.storageState({});
    cookies.cookies.push({
      name: '__Secure-authjs.session-token',
      value: 'forged-e2e-session-value',
      domain: new URL(requireEnv('STAGING_BASE_URL')).hostname,
      path: '/',
      expires: -1,
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    });

    const forged = await playwright.request.newContext({ storageState: cookies });
    const res = await forged.post(
      `/api/templates/${requireEnv('STAGING_PREMIUM_TEMPLATE_ID')}/download`,
      { headers: { origin: origin() }, data: { variables: {}, format: 'pdf' } }
    );
    expect(res.status()).toBe(401);
    await forged.dispose();
  });

  test('rate limits rapid downloads with 429', async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await download(request, requireEnv('STAGING_PUBLIC_TEMPLATE_ID'), {
        variables: {},
        format: 'pdf',
      });
      statuses.push(res.status());
    }
    expect(statuses).toContain(429);
  });
});

function origin(): string {
  return new URL(requireEnv('STAGING_BASE_URL')).origin;
}

async function download(
  request: import('@playwright/test').APIRequestContext,
  templateId: string,
  payload: Record<string, unknown>
): Promise<import('@playwright/test').APIResponse> {
  return request.post(`/api/templates/${templateId}/download`, {
    headers: { origin: origin() },
    data: payload,
  });
}

async function signIn(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  password: string
): Promise<void> {
  const csrfRes = await request.get('/api/auth/csrf');
  const csrfToken = csrfRes.ok() ? (await csrfRes.json()).csrfToken ?? '' : '';

  const res = await request.post('/api/auth/callback/credentials', {
    form: { email, password, csrfToken },
    headers: { origin: origin() },
  });
  if (!res.ok()) {
    throw new Error(`Sign-in failed for ${email} with status ${res.status()}`);
  }
}
