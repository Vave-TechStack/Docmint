import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { invalidateUserCache } from '@/lib/security/authorization';
import { resolveVerificationToken, consumeVerificationToken } from '@/lib/security/token-lookup';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Applied before the database and bcrypt work, keyed by IP. Without it the
    // lookup below is an unauthenticated DoS amplifier.
    if (!checkRateLimit(`verify-email:${getClientIp(request)}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait a minute.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || '';

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing verification token' },
        { status: 400 }
      );
    }

    // Tokens are purpose-tagged: verification links start with "v_", password
    // reset links with "r_". A reset link must never be consumed by this route
    // (legacy bare-hex verification tokens are still accepted).
    if (token.startsWith('r_')) {
      return NextResponse.json(
        { success: false, error: 'Invalid or already-used verification link' },
        { status: 400 }
      );
    }

    // Indexed lookup with a bounded fallback for legacy rows. See
    // src/lib/security/token-lookup.ts.
    const matched = await resolveVerificationToken(token, { purpose: 'verify' });
    if (!matched) {
      return NextResponse.json(
        { success: false, error: 'Invalid or already-used verification link' },
        { status: 400 }
      );
    }

    // Mark the owning account's email as verified (token identifier = email).
    const updated = await prisma.user.updateMany({
      where: { email: matched.identifier, deletedAt: null },
      data: { emailVerified: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Account not found for this verification link' },
        { status: 404 }
      );
    }

    // Tokens are single-use.
    await consumeVerificationToken(matched.tokenHash);

    // Invalidate revalidation cache so the verified email status takes effect immediately
    const updatedUser = await prisma.user.findFirst({ where: { email: matched.identifier, deletedAt: null }, select: { id: true } });
    if (updatedUser) {
      invalidateUserCache(updatedUser.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully. You can now sign in.',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify email' },
      { status: 500 }
    );
  }
}