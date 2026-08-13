import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/verify-email?token=...
 *
 * Verifies the email address on the account that owns the token. Tokens are
 * single-use and expire after 24 hours (see EMAIL_VERIFICATION_TOKEN_TTL_MS).
 */
export async function GET(request: NextRequest) {
  try {
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

    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record) {
      return NextResponse.json(
        { success: false, error: 'Invalid or already-used verification link' },
        { status: 400 }
      );
    }

    if (record.expires < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Verification link has expired' },
        { status: 410 }
      );
    }

    // Mark the owning account's email as verified (token identifier = email).
    const updated = await prisma.user.updateMany({
      where: { email: record.identifier, deletedAt: null },
      data: { emailVerified: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Account not found for this verification link' },
        { status: 404 }
      );
    }

    // Tokens are single-use.
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});

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
