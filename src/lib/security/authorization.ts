import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAuthzEvent, SecurityEventAction, createSecurityContext } from '@/lib/security/logger';

/**
 * Central authorization layer for every API route handler.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this module each route hand-rolled its own check
 * (`if (!session?.user || !['SUPER_ADMIN','ADMIN'].includes(...))  return 401`).
 * That produced three classes of real bugs:
 *
 *  1. Cross-tenant IDOR — a route authenticated the caller but never compared
 *     the target record's `organizationId` to the caller's, so any tenant
 *     ADMIN could read/mutate another tenant's rows.
 *  2. Wrong status code — every denial returned 401, conflating "not signed in"
 *     with "signed in, insufficient role".
 *  3. Copy/paste drift — a new endpoint simply forgot the check.
 *
 * The guards below make all three structurally impossible: a route handler can
 * only reach its business logic through a guard, and every guard returns the
 * tenant scope it is permitted to operate on.
 */

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Shape returned by every successful guard. */
export interface Guard {
  session: Session;
  user: NonNullable<Session['user']>;
  /**
   * The organization the caller is allowed to act within.
   *  - `ADMIN` (tenant admin)  → ALWAYS their own org id, never null.
   *  - `SUPER_ADMIN` (platform) → `null` = platform-wide, unless the request
   *    carries an explicit `organizationId` query param, in which case they are
   *    narrowed to that one org.
   *
   * Routes MUST push this into the Prisma `where` clause when it is non-null.
   */
  organizationId: string | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  /** True when the caller is in a disabled/deleted organization. */
  organizationSuspended: boolean;
}

type GuardResult =
  | { ok: true; guard: Guard }
  | { ok: false; response: NextResponse };

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

export const unauthorized = (message = 'Unauthorized') => jsonError(message, 401);
export const forbidden = (message = 'Forbidden') => jsonError(message, 403);

function readRequestedOrganizationId(request?: Request): string | null {
  if (!request) return null;
  const url = new URL(request.url);
  const raw = url.searchParams.get('organizationId');
  if (!raw) return null;
  // cuid-ish guard: never let a non-id value reach the DB layer.
  return /^[a-zA-Z0-9_-]{6,64}$/.test(raw) ? raw : null;
}

/**
 * Re-verify the caller against the database.
 *
 * The session is a stateless JWT, so `role`, `organizationId` and
 * `emailVerified` are snapshotted at sign-in and trusted for the token's whole
 * lifetime. Every guard below therefore re-reads the user row so that:
 *  - a suspended or soft-deleted user loses access immediately rather than
 *    when their token happens to expire;
 *  - a demoted admin loses admin scope immediately;
 *  - a user moved to another organization cannot keep acting as admin of the
 *    old one;
 *  - a suspended/deleted organization locks out all of its members.
 *
 * Fails CLOSED: if the row cannot be read the request is rejected rather than
 * allowed on the strength of a stale token.
 *
 * A short-lived cache keeps this off the hot path for bursts of requests from
 * one session while still bounding staleness.
 */
const REVALIDATION_TTL_MS = 5_000;
const revalidationCache = new Map<string, { expiresAt: number; active: boolean; role: string; organizationId: string | null; organizationStatus: string | null; passwordVersion: number }>();

interface RevalidatedUser {
  active: boolean;
  role: string;
  organizationId: string | null;
  organizationStatus: string | null;
  passwordVersion: number;
}

async function revalidateUser(userId: string): Promise<RevalidatedUser | null> {
  const cached = revalidationCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { active: cached.active, role: cached.role, organizationId: cached.organizationId, organizationStatus: cached.organizationStatus, passwordVersion: cached.passwordVersion };
  }

  const row = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      isActive: true,
      role: true,
      organizationId: true,
      organization: { select: { status: true } },
      passwordVersion: true,
    },
  });

  if (!row) {
    // Cache the negative briefly so a flood of requests from a deleted user
    // does not become a flood of identical DB lookups.
    revalidationCache.set(userId, { expiresAt: Date.now() + REVALIDATION_TTL_MS, active: false, role: 'USER', organizationId: null, organizationStatus: null, passwordVersion: 0 });
    return null;
  }

  const result: RevalidatedUser = {
    active: row.isActive && row.organization?.status === 'ACTIVE',
    role: row.role,
    organizationId: row.organizationId,
    organizationStatus: row.organization?.status ?? null,
    passwordVersion: row.passwordVersion ?? 0,
  };

  revalidationCache.set(userId, { expiresAt: Date.now() + REVALIDATION_TTL_MS, ...result });

  // Bound the cache so a long-lived process cannot accumulate entries.
  if (revalidationCache.size > 5_000) {
    const now = Date.now();
    for (const [key, value] of revalidationCache) {
      if (value.expiresAt <= now) revalidationCache.delete(key);
    }
  }

  return result;
}

/** Test-only: drop the revalidation cache. */
export function __clearRevalidationCache(): void {
  revalidationCache.clear();
}

/** Invalidate a specific user's revalidation cache (e.g., after password change, role change, suspension). */
export function invalidateUserCache(userId: string): void {
  revalidationCache.delete(userId);
}

/**
 * FUTURE PASSWORD CHANGE IMPLEMENTATION REQUIREMENT:
 * Any successful password-change API MUST:
 *   1. Increment the user's passwordVersion (Prisma: { passwordVersion: { increment: 1 } })
 *   2. Call invalidateUserCache(userId) to force immediate revalidation
 * This ensures all existing JWT sessions are revoked on the next authorization check.
 */

async function buildGuard(request?: Request, roles?: readonly string[]): Promise<GuardResult> {
  const session = await auth();
  const user = session?.user;

  const context = createSecurityContext(request, { user: session?.user });

  if (!session || !user) {
    await logAuthzEvent(
      SecurityEventAction.ACCESS_DENIED,
      false,
      'No session or user',
      { ...context, metadata: { reason: 'no_session' } }
    );
    return { ok: false, response: unauthorized('You must be signed in') };
  }

  const userId = (user.id as string | undefined) || session.user?.email;
  if (!userId) {
    await logAuthzEvent(
      SecurityEventAction.ACCESS_DENIED,
      false,
      'No user identifier in session',
      { ...context, metadata: { reason: 'no_user_id' } }
    );
    return { ok: false, response: unauthorized('You must be signed in') };
  }

  /**
   * DB revalidation happens BEFORE the role check so a suspended or deleted
   * user is rejected as unauthorized rather than being told "insufficient
   * permissions", and so a role that was revoked in the database cannot be
   * honoured from the token.
   */
  let fresh: RevalidatedUser | null = null;
  try {
    fresh = await revalidateUser(userId);
  } catch (error) {
    await logAuthzEvent(
      SecurityEventAction.ACCESS_DENIED,
      false,
      'Revalidation failed, failing closed',
      { ...context, userId, metadata: { reason: 'revalidation_error', error: String(error) } }
    );
    return { ok: false, response: forbidden('Unable to verify account status') };
  }

  if (!fresh || !fresh.active) {
    await logAuthzEvent(
      SecurityEventAction.ACCESS_DENIED,
      false,
      'Account inactive or no longer exists',
      { ...context, userId, organizationId: fresh?.organizationId ?? null, role: fresh?.role ?? 'UNKNOWN', metadata: { reason: 'inactive_or_deleted' } }
    );
    return { ok: false, response: unauthorized('Account is inactive or no longer exists') };
  }

  // Password version check: reject sessions issued before the last password change/reset.
  // JWTs without passwordVersion claim (legacy) are rejected to enforce revocation.
  const jwtPasswordVersion = user.passwordVersion ?? -1;
  if (fresh.passwordVersion > jwtPasswordVersion) {
    await logAuthzEvent(
      SecurityEventAction.PASSWORD_VERSION_MISMATCH,
      false,
      'Session revoked: password changed',
      { ...context, userId, organizationId: fresh.organizationId, role: fresh.role, metadata: { reason: 'password_version_mismatch', jwtVersion: jwtPasswordVersion, dbVersion: fresh.passwordVersion } }
    );
    return { ok: false, response: unauthorized('Session revoked: password changed') };
  }

  // Authoritative role/org come from the database, not the token.
  const role = fresh.role;
  if (roles && !roles.includes(role)) {
    await logAuthzEvent(
      SecurityEventAction.INSUFFICIENT_PERMISSIONS,
      false,
      'Insufficient permissions for requested role',
      { ...context, userId, organizationId: fresh.organizationId, role: fresh.role, metadata: { reason: 'insufficient_role', requiredRoles: roles } }
    );
    return { ok: false, response: forbidden('Insufficient permissions') };
  }

  const isSuperAdmin = role === 'SUPER_ADMIN';
  const ownOrg = fresh.organizationId;

  // A caller with no organization can only be a platform super admin acting
  // platform-wide. A non-super-admin without an org is misconfigured — fail
  // closed rather than silently widening their scope to "all tenants".
  if (!isSuperAdmin && roles?.includes('ADMIN') && !ownOrg) {
    await logAuthzEvent(
      SecurityEventAction.ACCESS_DENIED,
      false,
      'Admin account not attached to organization',
      { ...context, userId, role: fresh.role, metadata: { reason: 'admin_no_org' } }
    );
    return { ok: false, response: forbidden('Account is not attached to an organization') };
  }

  const requestedOrg = isSuperAdmin ? readRequestedOrganizationId(request) : null;

  // A super admin may narrow to one org but may never *widen*: an explicit
  // `?organizationId=` on a super admin is honoured, and only super admins
  // get the `null` (platform-wide) scope.
  const organizationId = isSuperAdmin ? requestedOrg : ownOrg;

  await logAuthzEvent(
    SecurityEventAction.ACCESS_GRANTED,
    true,
    'Authorization successful',
    { ...context, userId, organizationId, role: fresh.role, metadata: { isSuperAdmin, requestedOrg, grantedOrg: organizationId } }
  );

  return {
    ok: true,
    guard: {
      session,
      user,
      organizationId,
      isSuperAdmin,
      isAdmin: ADMIN_ROLES.includes(role as AdminRole),
      organizationSuspended: fresh.organizationStatus !== 'ACTIVE',
    },
  };
}

/** Any signed-in user. */
export async function requireAuth(request?: Request): Promise<GuardResult> {
  return buildGuard(request);
}

/**
 * Any signed-in user that is attached to an organization, with the
 * database-authoritative organization id.
 *
 * User-facing routes need the org id in order to scope their queries, and they
 * used to read it as `session.user.organizationId!` — a non-null assertion on a
 * JWT claim. That is wrong twice over: it trusts the stale token, and for an
 * account with no organization the assertion silently hands `null` to Prisma,
 * turning an `organizationId = null` filter into "match everything".
 *
 * This guard revalidates against the database and refuses when the caller has
 * no organization, so callers can use the id without an assertion.
 */
export async function requireUserScope(
  request?: Request
): Promise<
  | { ok: true; guard: Guard; userId: string; organizationId: string }
  | { ok: false; response: NextResponse }
> {
  const result = await buildGuard(request);
  if (!result.ok) return result;

  if (!result.guard.organizationId) {
    return { ok: false, response: forbidden('Account is not attached to an organization') };
  }

  return {
    ok: true,
    guard: result.guard,
    userId: result.guard.user.id,
    organizationId: result.guard.organizationId,
  };
}

/** ADMIN or SUPER_ADMIN. */
export async function requireAdmin(request?: Request): Promise<GuardResult> {
  return buildGuard(request, ADMIN_ROLES);
}

/** SUPER_ADMIN only — platform-wide / money-moving operations. */
export async function requireSuperAdmin(request?: Request): Promise<GuardResult> {
  return buildGuard(request, ['SUPER_ADMIN'] as const);
}

/**
 * Optional authentication with database revalidation.
 *
 * Returns `null` when there is no session, so a route that serves both
 * anonymous and signed-in callers (public template preview/download) can stay
 * open — but when a session DOES exist, role and organization are read from
 * the database rather than from the token.
 *
 * This exists because those routes used to read `session.user.role` and
 * `session.user.organizationId` straight off the JWT. `src/lib/auth.ts` sets
 * `session: { strategy: 'jwt' }` with no `maxAge`, so the Auth.js default
 * 30-day token lifetime applies: a user demoted from ADMIN to USER, suspended,
 * or moved between organizations kept their old role and tenant for weeks.
 * That bypassed the premium paywall (the admin branch skips the subscription
 * check) and exposed the previous tenant's PRIVATE templates.
 *
 * @param requireOrganization when true, a session with no organization is
 *   treated as anonymous rather than authenticated, so a caller can never
 *   reach an org-scoped branch without a tenant.
 */
export async function resolveOptionalScope(
  request?: Request,
  options: { requireOrganization?: boolean } = {}
): Promise<{ guard: Guard; userId: string; organizationId: string } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const result = await buildGuard(request);
  if (!result.ok) return null;

  const { guard } = result;
  if (options.requireOrganization && !guard.organizationId) return null;

  return {
    guard,
    userId: guard.user.id,
    organizationId: guard.organizationId as string,
  };
}

/**
 * Deny access to a record that belongs to a different organization.
 * Returns `null` when access is allowed so call sites can early-return:
 *
 *   const denied = crossTenant(guard, record.organizationId);
 *   if (denied) return denied;
 */
export function crossTenant(guard: Guard, recordOrganizationId: string | null | undefined, request?: Request): NextResponse | null {
  if (guard.isSuperAdmin && !guard.organizationId) return null; // platform-wide super admin
  if (!recordOrganizationId) return null; // platform/system-owned record
  if (recordOrganizationId === guard.organizationId) return null;

  // Log cross-tenant access attempt
  const context = createSecurityContext(request, { user: guard.user, organizationId: guard.organizationId, isSuperAdmin: guard.isSuperAdmin });
  logAuthzEvent(
    SecurityEventAction.CROSS_TENANT_BLOCKED,
    false,
    'Cross-tenant access blocked',
    { ...context, metadata: { reason: 'cross_tenant', recordOrganizationId, guardOrganizationId: guard.organizationId } }
  ).catch(() => {}); // Fire and forget

  return forbidden('Resource belongs to another organization');
}

/**
 * Apply the guard's tenant scope to a Prisma `where` object.
 * Mutates and returns `where` for ergonomic use:
 *
 *   const where = scopeWhere(guard, { deletedAt: null });
 */
export function scopeWhere<T extends Record<string, unknown>>(guard: Guard, where: T): T & { organizationId?: string } {
  if (guard.organizationId) {
    // Assigned AFTER the caller's filters so a spread can never override it.
    (where as Record<string, unknown>).organizationId = guard.organizationId;
  }
  return where;
}
