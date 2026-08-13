/**
 * Next.js instrumentation — runs once when the server starts.
 *
 * DocMint startup config check: in production, surface loudly when a
 * required runtime secret is missing, so a misconfigured deploy can't go
 * live silently (e.g. no RESEND_API_KEY = email verification and password
 * reset silently never send, locking new users out forever).
 */

const REQUIRED_IN_PRODUCTION: Record<string, string> = {
  AUTH_SECRET: 'session encryption + the proxy auth gate will fail',
  DATABASE_URL: 'the app cannot connect to the database',
  RAZORPAY_WEBHOOK_SECRET: 'payment webhooks will be rejected',
  RESEND_API_KEY: 'email verification / password reset emails will never send',
  GOOGLE_CLIENT_ID: 'Google OAuth login button will error',
  GOOGLE_CLIENT_SECRET: 'Google OAuth login button will error',
  MICROSOFT_CLIENT_ID: 'Microsoft OAuth login button will error',
  MICROSOFT_CLIENT_SECRET: 'Microsoft OAuth login button will error',
};

const RECOMMENDED_IN_PRODUCTION: Record<string, string> = {
  SUPPORT_EMAIL: 'contact/notification emails fall back to support@docmint.com',
  NEXT_PUBLIC_APP_URL: 'email links fall back to localhost',
};

export function register() {
  if (process.env.NODE_ENV !== 'production') return;

  const missingRequired = Object.entries(REQUIRED_IN_PRODUCTION).filter(
    ([key]) => !process.env[key]
  );
  const missingRecommended = Object.entries(RECOMMENDED_IN_PRODUCTION).filter(
    ([key]) => !process.env[key]
  );

  if (missingRequired.length) {
    console.warn(
      '\n' +
        '⚠️  ⚠️  ⚠️  DocMint: MISSING REQUIRED ENVIRONMENT VARIABLES ⚠️  ⚠️  ⚠️\n' +
        missingRequired
          .map(([key, impact]) => `  • ${key} — ${impact}`)
          .join('\n') +
        '\nThese features will be broken in production. Fix the .env before going live.\n'
    );
  }

  if (missingRecommended.length) {
    console.warn(
      '[DocMint] Recommended env vars not set:\n' +
        missingRecommended
          .map(([key, impact]) => `  • ${key} — ${impact}`)
          .join('\n')
    );
  }
}
