import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/reset-password  { token, password }
 *
 * Validates the single-use password-reset token, then sets the account's new
 * password. Tokens are purpose-tagged with an "r_" prefix so verification
 * tokens can never reset a password and vice versa.
 */
export async function POST(request: NextRequest) {
  try {
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

    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record) {
      return NextResponse.json(
        { success: false, error: 'Invalid or already-used reset link' },
        { status: 400 }
      );
    }

    if (record.expires < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This reset link has expired. Please request a new one.' },
        { status: 410 }
      );
    }

    // The token's identifier is the account email.
    const hashedPassword = await bcrypt.hash(password, 12);
    const updated = await prisma.user.updateMany({
      where: { email: record.identifier, deletedAt: null },
      data: { passwordHash: hashedPassword },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Account not found for this reset link' },
        { status: 404 }
      );
    }

    // Single-use token.
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});

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
