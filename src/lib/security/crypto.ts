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

// ─────────────────────────────────────────────────────────────────────────────
// Indexed token lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Domain separation for the token-index key.
 *
 * HKDF is used so the derived key can be rotated independently by bumping the
 * version below, without rotating AUTH_SECRET itself (which would invalidate
 * every Auth.js session in the application).
 */
const TOKEN_INDEX_HKDF_SALT = 'docmint:verification-token-index:v1';
const TOKEN_INDEX_HKDF_INFO = 'verification-token-index';

/**
 * Derive the key used to build an indexed token digest.
 *
 * Fails closed when AUTH_SECRET is absent: an unkeyed digest would let an
 * attacker who obtains the table confirm a guessed token with one indexed
 * lookup and no bcrypt work, which is precisely the property the bcrypt hash
 * at rest exists to prevent.
 */
function tokenIndexKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET is not configured; refusing to build an unkeyed token index. ' +
        'See src/instrumentation.ts.'
    );
  }
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(secret, 'utf8'),
      Buffer.from(TOKEN_INDEX_HKDF_SALT, 'utf8'),
      Buffer.from(TOKEN_INDEX_HKDF_INFO, 'utf8'),
      32
    )
  );
}

/**
 * Deterministic, keyed digest of a token, safe to store in an indexed column.
 *
 * WHY HMAC AND NOT A PLAIN HASH
 * -----------------------------
 * Verification tokens are 32 bytes of CSPRNG output delivered by email, so a
 * bare SHA-256 would be hard to attack directly. It would still be wrong here:
 *  - the digest would be usable for offline confirmation of any future
 *    low-entropy or user-derived token, and
 *  - it would convert the current ~250 ms bcrypt-per-guess cost into a single
 *    indexed lookup, letting an attacker confirm a stolen candidate token
 *    almost instantly.
 *
 * Keying it with a server-side secret removes both: a table dump alone yields
 * nothing usable without AUTH_SECRET.
 *
 * bcrypt remains the authoritative check — this digest only *locates* the row.
 */
export function tokenIndex(token: string): string {
  return crypto.createHmac('sha256', tokenIndexKey()).update(token, 'utf8').digest('hex');
}

/** True when a token index can be produced in the current environment. */
export function isTokenIndexAvailable(): boolean {
  const secret = process.env.AUTH_SECRET;
  return typeof secret === 'string' && secret.length >= 16;
}

/**
 * A bcrypt hash of a value nobody knows, used to equalise the work done on the
 * "user not found" branch of a login so response time cannot be used to
 * enumerate registered email addresses.
 */
export const DUMMY_BCRYPT_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.t7UwYFkO3uCzS5X9nnfyL0gvjiqBSYFa';
