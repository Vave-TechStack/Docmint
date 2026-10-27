import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireUserScope } from '@/lib/security/authorization';
import { invalidateUserCache } from '@/lib/security/authorization';
import { assertSameOrigin, readJsonBody, isPlainObject, cleanString } from '@/lib/security/request';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logAuthEvent, SecurityEventAction, createSecurityContext } from '@/lib/security/logger';
import { exceedsBcryptPasswordLimit, passwordValidationError } from '@/lib/auth/password-policy';

export const dynamic = 'force-dynamic';

const BCRYPT_COST = 12;
/**
 * POST /api/account/password  { currentPassword, newPassword }
 *
 * Changes the signed-in user's password.
 *
 * The settings page previously showed a "Password updated (API coming soon)"
 * toast and called no API at all, so the user believed the password had been
 * changed when it had not. This endpoint makes the control real.
 *
 * Security properties:
 *  - the CURRENT password must be supplied and verified, so a stolen session
 *    alone cannot lock the owner out;
 *  - `passwordVersion` is incremented, which every authorization guard
 *    compares against the JWT, so all existing sessions are revoked;
 *  - the revalidation cache is invalidated so the change takes effect
 *    immediately rather than after the 5 s TTL;
 *  - failures are rate limited per IP and the current-password check is
 *    performed before any write.
 */
export async function POST(request: NextRequest) {
  const context = createSecurityContext(request);

  try {
    const scope = await requireUserScope(request);
    if (!scope.ok) return scope.response;

    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    // Brute-force guard: an attacker with a stolen cookie still has to guess
    // the current password, and each guess costs a bcrypt comparison.
    if (!checkRateLimit(`account-password:${getClientIp(request)}`, 5, 15 * 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await readJsonBody(request);
    if (!isPlainObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required' },
        { status: 400 }
      );
    }
    if (exceedsBcryptPasswordLimit(currentPassword)) {
      return NextResponse.json(
        { success: false, error: 'Current password exceeds the supported limit. Reset your password to continue.' },
        { status: 400 }
      );
    }
    const passwordError = passwordValidationError(newPassword);
    if (passwordError) {
      return NextResponse.json(
        { success: false, error: passwordError },
        { status: 400 }
      );
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: 'New password must be different from the current one' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { id: scope.userId, deletedAt: null },
      select: { id: true, passwordHash: true, organizationId: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // OAuth-only accounts have no password to confirm against. Refuse rather
    // than allow a password-less takeover.
    if (!user.passwordHash) {
      await logAuthEvent(
        SecurityEventAction.LOGIN_FAILURE,
        false,
        'Password change attempted on an account without a password',
        { ...context, userId: user.id, organizationId: user.organizationId, metadata: { reason: 'no_password_hash' } }
      );
      return NextResponse.json(
        {
          success: false,
          error: 'This account signs in with a social provider. Change your password there.',
        },
        { status: 400 }
      );
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentMatches) {
      await logAuthEvent(
        SecurityEventAction.LOGIN_FAILURE,
        false,
        'Password change rejected: current password incorrect',
        { ...context, userId: user.id, organizationId: user.organizationId, metadata: { reason: 'invalid_current_password' } }
      );
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordVersion: { increment: 1 } },
    });

    // Revoke every other session immediately.
    invalidateUserCache(user.id);

    await prisma.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        userId: user.id,
        action: 'PASSWORD_CHANGED',
        entity: 'User',
        entityId: user.id,
        description: 'User changed their own password',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Password updated. Other sessions have been signed out.',
    });
  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update password' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/account/profile  { name?, mobile? }
 *
 * Updates the signed-in user's editable profile fields. Email is deliberately
 * NOT updatable here: changing the address would invalidate the verified
 * state and require a re-verification flow that does not exist yet.
 */
export async function PATCH(request: NextRequest) {
  try {
    const scope = await requireUserScope(request);
    if (!scope.ok) return scope.response;

    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const body = await readJsonBody(request);
    if (!isPlainObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const data: Record<string, string | null> = {};

    if (body.name !== undefined) {
      const name = cleanString(body.name, 120, { required: true });
      data.name = name;
    }
    if (body.mobile !== undefined) {
      const mobile = cleanString(body.mobile, 32, { required: false });
      if (mobile && !/^[0-9+\-\s()]{6,32}$/.test(mobile)) {
        return NextResponse.json({ success: false, error: 'Mobile number format is not valid' }, { status: 400 });
      }
      data.mobile = mobile || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: 'No supported fields to update' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: scope.userId },
      data,
      select: { id: true, name: true, email: true, mobile: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Profile updated',
      data: { name: user.name, email: user.email, mobile: user.mobile },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}