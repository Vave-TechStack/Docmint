/**
 * Staging safety guards and shared helpers for the Playwright suites.
 *
 * The single most important job of this module is to make it impossible for
 * this suite to touch production. These tests create accounts, mint sessions,
 * place Razorpay test orders and mutate documents, so "the base URL was
 * mistyped" is a genuine hazard rather than a theoretical one.
 */

/**
 * Host fragments that must never appear in a test target.
 *
 * Matching is substring-based on the hostname so `app.example.com`,
 * `www.example.com` and `example.com` are all caught.
 */
const PRODUCTION_HOST_FRAGMENTS = [
  'example.com', // placeholder in docs — the real prod domain must be added here
  'prod',
  'production',
  'live',
];

/** Environments where a staging-like host is expected. */
const STAGING_HOST_HINTS = ['staging', 'stage', 'stg', 'test', 'localhost', '127.0.0.1'];

/**
 * Fails fast if the configured target is not plausibly a staging origin.
 *
 * Called from every spec's `beforeAll`, so a misconfigured `STAGING_BASE_URL`
 * aborts the run instead of quietly exercising production.
 */
export function assertStagingTarget(): string {
  const raw = process.env.STAGING_BASE_URL;
  if (!raw) throw new Error('STAGING_BASE_URL is not set.');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`STAGING_BASE_URL is not a valid URL: ${raw}`);
  }

  const host = url.hostname.toLowerCase();

  for (const fragment of PRODUCTION_HOST_FRAGMENTS) {
    if (host.includes(fragment)) {
      throw new Error(
        `Refusing to run: "${host}" looks like a PRODUCTION host (matched "${fragment}").\n` +
          'These tests mutate data and place test orders. Point STAGING_BASE_URL at staging.'
      );
    }
  }

  // Local development is acceptable for smoke runs; anything else must be HTTPS,
  // because HSTS and the TLS-terminating proxy only exist in front of HTTPS.
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal && url.protocol !== 'https:') {
    throw new Error(
      `Refusing to run: "${raw}" is not HTTPS. ` +
        'HSTS and trusted-proxy behaviour cannot be validated over plain HTTP.'
    );
  }

  if (
    !isLocal &&
    !STAGING_HOST_HINTS.some((hint) => host.includes(hint)) &&
    process.env.STAGING_ALLOW_UNKNOWN_HOST !== '1'
  ) {
    throw new Error(
      `Refusing to run: "${host}" does not look like a staging host ` +
        `(expected one of: ${STAGING_HOST_HINTS.join(', ')}).\n` +
        'Set STAGING_ALLOW_UNKNOWN_HOST=1 if this really is your staging domain.'
    );
  }

  return url.origin;
}

/** Marks a suite that writes data; skipped unless explicitly allowed. */
export const DESTRUCTIVE = '@destructive';

/**
 * Credentials for the staging run.
 *
 * Read from the environment and never hard-coded or logged. Tests that need
 * them should fail loudly rather than fall back to a default, because a
 * default would eventually point at a real account.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `${name} is not set. Staging browser tests read all credentials from the ` +
        'environment so no credential is ever committed.'
    );
  }
  return value;
}

/** A unique-per-run suffix so parallel/repeated runs do not collide on unique columns. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * Asserts that Razorpay is configured in TEST mode.
 *
 * Guards against a staging run silently placing real orders if live keys were
 * pasted into the staging environment by mistake. Called before any checkout
 * test.
 */
export function assertRazorpayTestMode(): void {
  const keyId = process.env.RAZORPAY_KEY_ID ?? '';
  if (keyId && !keyId.startsWith('rzp_test_')) {
    throw new Error(
      'RAZORPAY_KEY_ID does not start with "rzp_test_". ' +
        'Refusing to run checkout tests against live payment credentials.'
    );
  }
}

/** Unique, disposable mailbox for signup tests. */
export function testEmail(prefix: string): string {
  const domain = process.env.STAGING_TEST_EMAIL_DOMAIN;
  if (!domain) {
    throw new Error(
      'STAGING_TEST_EMAIL_DOMAIN is not set (e.g. "staging-mail.example.com"). ' +
        'Signup tests need a domain that receives mail so the verification link can be read.'
    );
  }
  return `${prefix}-${uniqueSuffix()}@${domain}`;
}