/**
 * Password-guess budget for a public, password-protected share link.
 *
 * Shared by the view and download routes so both halves of one share enforce an
 * identical budget — otherwise the download route would remain a free
 * brute-force oracle even with the view route throttled.
 *
 * The token is the only secret on these endpoints and every guess costs one
 * bcrypt comparison, so without a budget the share password is crackable at
 * network speed.
 */
export const SHARE_PASSWORD_MAX_ATTEMPTS = 10;

/** 15 minutes. Long enough that a legitimate typo is forgiven, short enough to matter. */
export const SHARE_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

/**
 * Rate-limit keys for a share-password attempt.
 *
 * Keyed on BOTH the share token and the client IP:
 * - token alone would let one attacker lock out the legitimate recipient,
 * - IP alone would not stop a distributed attempt.
 *
 * The per-IP budget is a multiple of the per-token budget so that a user
 * working legitimately across several of their own shares is not throttled,
 * while a single-IP spray across many tokens still hits a ceiling.
 */
export function sharePasswordRateLimitKeys(
  token: string,
  clientIp: string
): { token: string; ip: string } {
  return {
    token: `share-auth:${token}`,
    ip: `share-auth-ip:${clientIp}`,
  };
}
