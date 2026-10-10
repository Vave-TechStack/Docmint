import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for STAGING browser validation.
 *
 * Deliberately separate from the Vitest suites: `vitest.config.ts` only
 * includes files under src ending in .test.ts, and these files use the
 * .e2e.ts suffix, so
 * the two runners can never pick up each other's files. Nothing here runs as
 * part of `npm test` or `npm run build`.
 *
 * There is NO `webServer` block on purpose. Playwright must exercise an
 * already-deployed staging origin over HTTPS — that is the only way to observe
 * real TLS, the real reverse proxy, and real CSP/HSTS behaviour. Starting a
 * local server would validate the wrong thing.
 *
 * The target origin is read from STAGING_BASE_URL and validated by
 * `assertStagingTarget()` before any test runs. See `e2e/support/staging.ts`.
 */
const BASE_URL = process.env.STAGING_BASE_URL;

if (!BASE_URL) {
  throw new Error(
    'STAGING_BASE_URL is not set.\n' +
      'This suite targets a DEPLOYED STAGING environment and will not start a server for you.\n' +
      'Example: STAGING_BASE_URL=https://staging.example.com npx playwright test'
  );
}

export default defineConfig({
  testDir: './e2e',
  // `*.e2e.ts` rather than `*.spec.ts` keeps vitest's default glob away from
  // these files even if its `include` is widened later.
  testMatch: '**/*.e2e.ts',

  // Conservative on purpose: these tests create real accounts and real orders
  // in staging, so parallel workers against one database invite flakiness and
  // cross-test interference.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // Keeps the staging origin in the browser context so a stray absolute link
    // cannot silently navigate the run to production.
    ignoreHTTPSErrors: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  // Never run destructive suites against production. `destructive` suites are
  // opt-in via STAGING_ALLOW_DESTRUCTIVE=1 and are skipped otherwise.
  grepInvert: process.env.STAGING_ALLOW_DESTRUCTIVE === '1' ? undefined : /@destructive/,
});