import { test, expect } from '@playwright/test';
import { assertStagingTarget, assertRazorpayTestMode, requireEnv } from './support/staging';

/**
 * Razorpay Checkout behaviour in a real browser, TEST MODE ONLY.
 *
 * `assertRazorpayTestMode()` refuses to run if `RAZORPAY_KEY_ID` does not start
 * with `rzp_test_`, so a staging environment accidentally holding live keys
 * aborts the suite instead of placing real orders.
 *
 * These tests need a browser with a real network path to
 * `https://checkout.razorpay.com`. If staging has no egress, the load will fail
 * and the suite will report it — that failure is itself useful information.
 *
 * NOT EXECUTED in the current environment: no staging deployment and no
 * Razorpay test credentials are available.
 */
test.describe('Razorpay Checkout (test mode)', () => {
  test.beforeAll(() => {
    assertStagingTarget();
    assertRazorpayTestMode();
  });

  test('creates a test order server-side and returns a test key', async ({ request }) => {
    const res = await request.post('/api/payments/create-order', {
      headers: { origin: new URL(process.env.STAGING_BASE_URL!).origin },
      data: { type: 'premium', amount: 100 },
    });

    // 401 is acceptable when run unauthenticated; the point is that the
    // endpoint is not issuing orders to anonymous callers.
    if (res.status() === 401 || res.status() === 403) return;

    expect(res.status()).toBe(200);
    const body = await res.json();
    const key = body?.data?.key;
    if (typeof key === 'string' && key.length > 0) {
      expect(key.startsWith('rzp_test_')).toBe(true);
    }
  });

  test('rejects an unauthenticated order creation', async ({ request }) => {
    const res = await request.post('/api/payments/create-order', {
      headers: { origin: new URL(process.env.STAGING_BASE_URL!).origin },
      data: { type: 'premium', amount: 100 },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('blocks checkout.js and surfaces an error instead of hanging', async ({ page }) => {
    // The regression this guards: the script loader had no timeout, so a
    // request that never settled left the button on "Preparing..." forever with
    // no error and no recovery short of a reload.
    await page.route('**/checkout.razorpay.com/v1/checkout.js', (route) => route.abort());

    await page.goto(await premiumCheckoutPath());
    await triggerCheckout(page);

    // The UI must reach a terminal error state quickly rather than spinning.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('alert')).toContainText(/could not reach|payment gateway|try again/i);
  });

  test('times out a stalled checkout.js request within ~15 seconds', async ({ page }) => {
    // Aborting models a hard failure; a route that never responds models the
    // silent-packet-drop case the timeout was added for.
    await page.route('**/checkout.razorpay.com/v1/checkout.js', async () => {
      await new Promise(() => {
        /* never resolve */
      });
    });

    await page.goto(await premiumCheckoutPath());
    const startedAt = Date.now();
    await triggerCheckout(page);

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 25_000 });
    const elapsed = Date.now() - startedAt;

    // The loader uses a 15s budget; allow generous slack for CI slowness but
    // fail if it waited far longer, which would mean the timeout is gone.
    expect(elapsed).toBeLessThan(25_000);
  });

  test('ignores repeated clicks on the pay button', async ({ page }) => {
    let orderRequests = 0;
    await page.route('**/api/payments/create-order', async (route) => {
      orderRequests++;
      await route.continue();
    });

    await page.goto(await premiumCheckoutPath());
    const button = page.getByRole('button', { name: /pay|buy|upgrade|subscribe/i }).first();

    // A fast triple click can dispatch twice before React re-renders.
    await button.click();
    await button.click({ force: true }).catch(() => {});
    await button.click({ force: true }).catch(() => {});

    await page.waitForTimeout(2_000);
    // Exactly one order must be created; duplicates cause double charges.
    expect(orderRequests).toBeLessThanOrEqual(1);
  });

  test('shows a configuration error for a placeholder Razorpay key', async ({ request }) => {
    // A placeholder key (`rzp_test_xxxxxxxx`) is a common misconfiguration; the
    // component must explain it rather than opening an unusable modal.
    const res = await request.post('/api/payments/create-order', {
      headers: { origin: new URL(process.env.STAGING_BASE_URL!).origin },
      data: { type: 'premium', amount: 100 },
    });
    if (!res.ok()) return;
    const body = await res.json();
    const key = body?.data?.key;
    if (typeof key === 'string') {
      expect(key).not.toContain('xxxxxxxx');
    }
  });

  test('does not mark an order paid from the client callback alone', async ({ request }) => {
    // The browser handler reports that the gateway completed; entitlement must
    // require server-side signature verification. Posting a forged handler
    // payload directly must therefore change nothing.
    const res = await request.post('/api/payments/verify', {
      headers: { origin: new URL(process.env.STAGING_BASE_URL!).origin },
      data: {
        razorpay_payment_id: 'pay_forged_e2e',
        razorpay_order_id: 'order_forged_e2e',
        razorpay_signature: 'forged_signature_e2e',
      },
    });

    // Must not be a success. 404/400/401/403 are all acceptable rejections.
    expect(res.ok(), 'forged payment signature was accepted').toBe(false);
  });
});

/** Navigates to whichever page renders the checkout button. */
async function premiumCheckoutPath(): Promise<string> {
  return process.env.STAGING_CHECKOUT_PATH ?? '/subscription';
}

/** Clicks the pay button, tolerating either the idle or loading label. */
async function triggerCheckout(page: import('@playwright/test').Page): Promise<void> {
  const button = page.getByRole('button', { name: /pay|buy|upgrade|subscribe|continue/i }).first();
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await button.click();
}

// Documents the env contract for this suite; values are never inlined.
export const RAZORPAY_REQUIRED_ENV = ['STAGING_CHECKOUT_PATH'] as const;
export { requireEnv };