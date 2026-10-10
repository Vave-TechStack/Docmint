import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Cryptographic helpers used on the money and auth paths.
 */

const TOKEN_HASH_COST = 12;

/**
 * Constant-time string comparison.
 *
 * `a === b` short-circuits on the first differing byte, which leaks how much
 * of a secret an attacker has guessed. Webhook HMACs and Razorpay payment
 * signatures are the canonical case: an attacker who can measure the
 * comparison learns the expected MAC one byte at a time.
 *
 * `crypto.timingSafeEqual` throws when the two buffers differ in length, so
 * the length is compared first — that is safe, because the length of a hex MAC
 * is not a secret worth protecting.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  // Compare digests so unequal lengths still take the constant-time path.
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();

  return crypto.timingSafeEqual(hashA, hashB);
}

/** URL-safe random token with `bytes * 8` bits of entropy from the OS CSPRNG. */
export function randomToken(bytes = 32, prefix = ''): string {
  return `${prefix}${crypto.randomBytes(bytes).toString('hex')}`;
}

/** SHA-256 hex digest. Used to store reset/verification tokens at rest. */
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Hash a token for storage (bcrypt with fixed cost).
 * Tokens are stored hashed to prevent token theft from DB access.
 */
export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, TOKEN_HASH_COST);
}

/**
 * Verify a token against its stored hash.
 */
export async function verifyTokenHash(token: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(token, storedHash);
}

/**
 * A bcrypt hash of a value nobody knows, used to equalise the work done on the
 * "user not found" branch of a login so response time cannot be used to
 * enumerate registered email addresses.
 */
export const DUMMY_BCRYPT_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.t7UwYFkO3uCzS5X9nnfyL0gvjiqBSYFa';
