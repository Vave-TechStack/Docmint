import { test, expect } from '@playwright/test';
import { assertStagingTarget } from './support/staging';

/**
 * CSP behaviour observed from inside a real browser.
 *
 * The header-level assertions live in security-headers.e2e.ts. These
 * tests answer the question the headers alone cannot: does the
 * report-only policy actually let the application run while still
 * reporting violations, and does the browser deliver those reports to
 * the first-party endpoint?
 *
 * NOT EXECUTED in the current environment: requires a deployed staging
 * origin.
 */
test.describe('CSP report-only in the browser', () => {
  test.beforeAll(() => {
    assertStagingTarget();
  });

  test('the application runs normally under the report-only policy', async ({ page }) => {
    // Report-only must not break the app: inline scripts the app
    // relies on still execute. A page that fails to hydrate here
    // would mean enforcement was switched on by mistake.
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);

    const reportOnly = (response?.headers()['content-security-policy-report-only'] ?? '') as string;
    expect(reportOnly).toBeTruthy();

    // The app shell renders.
    await expect(page.locator('body')).toBeVisible();
  });

  test('executes an inline script that the enforced policy would block', async ({ page }) => {
    await page.goto('/');

    // Install a listener BEFORE the violation happens.
    await page.evaluate(() => {
      (window as unknown as { __cspViolations: unknown[] }).__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { __cspViolations: unknown[] }).__cspViolations.push({
          directive: event.violatedDirective,
          blockedURI: event.blockedURI,
          documentURI: event.documentURI,
        });
      });
    });

    // Inject an inline script. The report-only candidate drops
    // 'unsafe-inline' from script-src, so this is a violation — but
    // report-only means it must still EXECUTE.
    const executed = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inlineRan = true;';
      document.body.appendChild(script);
      return (window as unknown as { __inlineRan?: boolean }).__inlineRan === true;
    });

    // The decisive assertion: report-only does not block execution.
    expect(executed, 'inline script was blocked — CSP is enforced, not report-only').toBe(true);

    // And the browser recorded the violation.
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: Array<{ directive: string }> }).__cspViolations
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.directive.startsWith('script-src'))).toBe(true);
  });

  test('delivers violation reports to the first-party endpoint', async ({ page }) => {
    const reports: string[] = [];
    await page.route('**/api/csp-report', async (route) => {
      const body = route.request().postData();
      if (body) reports.push(body);
      await route.fulfill({ status: 204 });
    });

    await page.goto('/');

    // Trigger a violation the same way the previous test does.
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__cspProbe = true;';
      document.body.appendChild(script);
    });

    // Reporting API beacons are asynchronous; allow a generous window.
    await page.waitForTimeout(10_000);

    expect(
      reports.length,
      'no CSP violation report reached /api/csp-report within 10s'
    ).toBeGreaterThan(0);
    expect(reports[0]).toContain('csp-report');
  });
});
