import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { invalidateUserCache } from '@/lib/security/authorization';
import { resolveVerificationToken, consumeVerificationToken } from '@/lib/security/token-lookup';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Before any DB or bcrypt work, keyed by IP.
    if (!checkRateLimit(`reset-password:${getClientIp(request)}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait a minute.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!token || token.startsWith('v_')) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Indexed lookup with a bounded fallback for legacy rows. See
    // src/lib/security/token-lookup.ts.
    const matched = await resolveVerificationToken(token, { purpose: 'reset' });
    if (!matched) {
      return NextResponse.json(
        { success: false, error: 'Invalid or already-used reset link' },
        { status: 400 }
      );
    }

    // The token's identifier is the account email.
    const hashedPassword = await bcrypt.hash(password, 12);
    const updated = await prisma.user.updateMany({
      where: { email: matched.identifier, deletedAt: null },
      data: { passwordHash: hashedPassword, passwordVersion: { increment: 1 } },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Account not found for this reset link' },
        { status: 404 }
      );
    }

    // Single-use token.
    await consumeVerificationToken(matched.tokenHash);

    // Invalidate revalidation cache so the new password takes effect immediately
    // on subsequent requests rather than waiting for the TTL to expire.
    const updatedUser = await prisma.user.findFirst({ where: { email: matched.identifier, deletedAt: null }, select: { id: true } });
    if (updatedUser) {
      invalidateUserCache(updatedUser.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. You can now sign in.',
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}