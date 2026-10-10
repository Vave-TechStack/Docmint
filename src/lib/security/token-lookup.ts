import { prisma } from '@/lib/prisma';
import { tokenIndex, verifyTokenHash, isTokenIndexAvailable } from './crypto';

/**
 * Verification / reset token resolution.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `VerificationToken.token` stores a bcrypt hash. Bcrypt is deliberately
 * non-deterministic and salted, so a hash cannot be searched by its input and
 * the owning row cannot be recovered with an index.
 *
 * Both consuming routes worked around this by fetching up to
 * `MAX_TOKEN_CANDIDATES` unexpired rows and bcrypt-comparing the presented
 * token against each. That bounds the worst case — an unauthenticated caller
 * cannot force unbounded CPU work — but it has a correctness cost: a
 * legitimate token that sorts beyond the window is reported invalid, and
 * nothing prunes expired rows, so the window fills up over time.
 *
 * This module adds a deterministic, keyed digest (`tokenIndex`) stored in an
 * indexed column. Resolution is then one indexed read followed by one bcrypt
 * comparison. bcrypt stays authoritative; the digest only locates the row.
 *
 * ROLLOUT
 * -------
 * Rows written before this change have `tokenIndex = NULL` and cannot be
 * backfilled (the raw token is unrecoverable from a bcrypt hash). The lookup
 * therefore falls back to the bounded sweep for those rows only. Once every
 * outstanding token has expired the fallback can be deleted.
 *
 * See docs/TOKEN_LOOKUP_PROPOSAL.md and the migration in
 * prisma/migrations/ (proposed, not applied to any environment).
 */

/** Upper bound on the legacy fallback sweep. */
const MAX_TOKEN_CANDIDATES = 50;

export interface ResolvedToken {
  identifier: string;
  /** bcrypt hash of the matched token, used to delete the row after use. */
  tokenHash: string;
  expires: Date;
}

export interface ResolveOptions {
  /**
   * Token purpose that may consume the row. `null` means "legacy row, purpose
   * unknown" and accepts both verification and reset tokens, matching the
   * behaviour before purpose was recorded.
   */
  purpose?: 'verify' | 'reset' | null;
}

/**
 * Resolve a presented token to its owning row.
 *
 * @returns the row on success, or `null` for every failure case. The caller
 *          must not distinguish "unknown token" from "expired token" or "wrong
 *          purpose" in its response, or the endpoint becomes an oracle.
 */
export async function resolveVerificationToken(
  presented: string,
  options: ResolveOptions = {}
): Promise<ResolvedToken | null> {
  if (!presented || typeof presented !== 'string') return null;

  // ── Fast path: indexed lookup ────────────────────────────────────────────
  if (isTokenIndexAvailable()) {
    let index: string;
    try {
      index = tokenIndex(presented);
    } catch {
      // Key derivation failed despite the availability check; fall through to
      // the bounded sweep rather than failing closed and locking users out.
      index = '';
    }

    if (index) {
      const row = await prisma.verificationToken.findFirst({
        where: { tokenIndex: index },
      });
      if (row) {
        if (row.expires <= new Date()) return null;
        if (options.purpose && row.purpose && row.purpose !== options.purpose) return null;
        // bcrypt remains the authoritative check.
        const ok = await verifyTokenHash(presented, row.token);
        return ok ? { identifier: row.identifier, tokenHash: row.token, expires: row.expires } : null;
      }
    }
  }

  // ── Legacy path: bounded sweep for rows without a token index ────────────
  const candidates = await prisma.verificationToken.findMany({
    where: {
      expires: { gt: new Date() },
      ...(isTokenIndexAvailable() ? { tokenIndex: null } : {}),
    },
    take: MAX_TOKEN_CANDIDATES,
    orderBy: { expires: 'desc' },
  });

  for (const candidate of candidates) {
    // Legacy rows have no recorded purpose, so they are accepted by both
    // routes — this preserves the behaviour that existed before purpose
    // tagging, including for tokens already in a user's inbox.
    const ok = await verifyTokenHash(presented, candidate.token);
    if (ok) {
      return { identifier: candidate.identifier, tokenHash: candidate.token, expires: candidate.expires };
    }
  }

  return null;
}

/** Delete a consumed token by its stored hash. Never throws. */
export async function consumeVerificationToken(tokenHash: string): Promise<void> {
  await prisma.verificationToken.deleteMany({ where: { token: tokenHash } }).catch(() => {});
}

/**
 * Token index for a token about to be issued, or null when one cannot be
 * derived.
 *
 * Returning null rather than throwing keeps signup and forgot-password working
 * when AUTH_SECRET is absent: the row is still stored with its bcrypt hash and
 * is reachable through the bounded-sweep fallback, so the user is not locked
 * out by a configuration problem. `instrumentation.ts` already reports the
 * missing secret loudly.
 */
export function safeTokenIndex(token: string): string | null {
  try {
    return tokenIndex(token);
  } catch {
    return null;
  }
}