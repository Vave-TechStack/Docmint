import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { EmailService } from '@/lib/email/email-service';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '@/lib/utils/constants';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { hashToken } from '@/lib/security/crypto';
import { safeTokenIndex } from '@/lib/security/token-lookup';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/forgot-password  { email }
 *
 * If the email belongs to an existing, active account, issues a single-use
 * password-reset token (1h TTL) and emails a reset link. Always returns the
 * same generic message so the endpoint cannot be used to enumerate emails.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    // At most one reset email per address per minute.
    if (!checkRateLimit(`forgot-password:${email}`, 1, 60_000)) {
      return NextResponse.json(
        {
          success: true,
          message: 'If your email is registered, a password reset link has been sent.',
        },
        { status: 429 }
      );
    }

    // The per-address bucket alone is keyed entirely on attacker-supplied
    // input, so a loop over distinct target addresses was unbounded and each
    // accepted call cost a real outbound email. This per-IP ceiling bounds
    // mail volume regardless of how many addresses are cycled.
    if (!checkRateLimit(`forgot-password:ip:${getClientIp(request)}`, 5, 3_600_000)) {
      return NextResponse.json(
        {
          success: true,
          message: 'If your email is registered, a password reset link has been sent.',
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.isActive) {
      // "r_" prefix marks this as a reset token (see reset-password route).
      const token = `r_${crypto.randomBytes(32).toString('hex')}`;
      const tokenHash = await hashToken(token);
      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token: tokenHash,
          // Keyed digest so the consuming route can find this row with an
          // index instead of sweeping every unexpired token. Falls back to a
          // NULL index if the key cannot be derived.
          tokenIndex: safeTokenIndex(token),
          purpose: 'reset',
          expires: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
        },
      });

      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
      await EmailService.sendPasswordResetEmail(email, resetUrl);
    }

    // Generic on purpose — do not reveal whether the account exists.
    return NextResponse.json({
      success: true,
      message: 'If your email is registered, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
