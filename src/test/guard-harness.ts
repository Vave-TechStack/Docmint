/**
 * Shared test scaffolding for routes guarded by `@/lib/security/authorization`.
 *
 * The guards re-verify the caller against the database on every request (so a
 * suspended/deleted user or a revoked role loses access immediately instead of
 * when their JWT happens to expire). Route tests therefore have to satisfy two
 * extra requirements beyond mocking `auth()`:
 *
 *   1. `prisma.user.findFirst` must resolve a usable account row, and
 *   2. the guard's short-lived revalidation cache must be cleared between
 *      tests, otherwise a result cached for one session is reused for the next.
 *
 * `mockRevalidation` installs a `findFirst` implementation that mirrors
 * whatever session `authMocks.auth` is currently returning, so individual tests
 * keep asserting route behaviour rather than guard plumbing. `primeSessionUser`
 * is for the rarer case where a test needs the database row to disagree with the
 * token on purpose.
 */
import { vi } from 'vitest';

export interface RevalidationRow {
  isActive: boolean;
  role: string;
  organizationId: string | null;
  organization?: { status: string } | null;
  passwordVersion: number;
}

const DEFAULT_ROW: RevalidationRow = {
  isActive: true,
  role: 'USER',
  organizationId: 'org_A',
  organization: { status: 'ACTIVE' },
  passwordVersion: 0,
};

/** Row the next `findFirst` will resolve, or `null` to simulate "no such user". */
let nextRow: RevalidationRow | null | undefined = undefined;

/**
 * Default revalidation: mirror the session that `auth` is currently returning, so the
 * guard's authoritative role/org match the token in ordinary tests.
 */
export function mockRevalidation(
  findFirst: { mockImplementation: (fn: (args: unknown) => unknown) => unknown },
  getSession: () => Promise<{ user?: { role?: string; organizationId?: string | null; passwordVersion?: number } } | null>
): void {
  findFirst.mockImplementation(async () => {
    if (nextRow !== undefined) return nextRow;
    const session = await getSession();
    const user = session?.user;
    if (!user) return null;
    return {
      isActive: true,
      role: user.role ?? 'USER',
      organizationId: user.organizationId ?? null,
      organization: { status: 'ACTIVE' },
      passwordVersion: user.passwordVersion ?? 0,
    } satisfies RevalidationRow;
  });
}

/** Force the next revalidation read to return a specific row (or `null`). */
export function primeSessionUser(row: RevalidationRow | null): void {
  nextRow = row;
}

/** Reset any primed override back to the session-mirroring default. */
export function resetSessionUser(): void {
  nextRow = undefined;
}

export { DEFAULT_ROW, vi };
