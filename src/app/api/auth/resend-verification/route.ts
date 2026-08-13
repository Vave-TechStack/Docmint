import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { EmailService } from '@/lib/email/email-service';
import { EMAIL_VERIFICATION_TOKEN_TTL_MS } from '@/lib/utils/constants';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/resend-verification  { email }
 *
 * Sends a fresh verification link if the email belongs to an existing, active,
 * unverified account. Always returns the same generic success message so the
 * endpoint cannot be used to enumerate registered emails.
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

    // At most one verification link per email per minute.
    if (!checkRateLimit(`resend:${email}`, 1, 60_000)) {
      return NextResponse.json(
        {
          success: true,
          message: 'If your email is registered and unverified, a verification link has been sent.',
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.isActive && !user.emailVerified) {
      const verificationToken = `v_${crypto.randomBytes(32).toString('hex')}`;
      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token: verificationToken,
          expires: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
        },
      });
      await EmailService.sendVerificationEmail(email, verificationToken);
    }

    // Generic on purpose — do not reveal whether the account exists.
    return NextResponse.json({
      success: true,
      message: 'If your email is registered and unverified, a verification link has been sent.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send verification email' },
      { status: 500 }
    );
  }
}
