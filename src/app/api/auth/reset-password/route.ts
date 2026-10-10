import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { invalidateUserCache } from '@/lib/security/authorization';
import { verifyTokenHash } from '@/lib/security/crypto';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Upper bound on candidate hashes examined per request. See the equivalent
 * note in `verify-email`: tokens are bcrypt-hashed, so an unauthenticated
 * request would otherwise sweep every unexpired token in the table at ~250ms
 * of CPU each — an unmetered DoS that worsens as the table grows.
 */
const MAX_TOKEN_CANDIDATES = 50;

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

    // Since tokens are now stored hashed, we must find candidate tokens by
    // identifier (email) and verify the provided token against each hash.
    // First, find all unexpired reset tokens (r_* prefix tokens).
    const candidateTokens = await prisma.verificationToken.findMany({
      where: {
        expires: { gt: new Date() },
      },
      take: MAX_TOKEN_CANDIDATES,
      orderBy: { expires: 'desc' },
    });

    let matchedRecord: { identifier: string; token: string; expires: Date } | null = null;

    for (const candidate of candidateTokens) {
      const isMatch = await verifyTokenHash(token, candidate.token);
      if (isMatch) {
        matchedRecord = candidate;
        break;
      }
    }

    if (!matchedRecord) {
      return NextResponse.json(
        { success: false, error: 'Invalid or already-used reset link' },
        { status: 400 }
      );
    }

    // The token's identifier is the account email.
    const hashedPassword = await bcrypt.hash(password, 12);
    const updated = await prisma.user.updateMany({
      where: { email: matchedRecord.identifier, deletedAt: null },
      data: { passwordHash: hashedPassword, passwordVersion: { increment: 1 } },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Account not found for this reset link' },
        { status: 404 }
      );
    }

    // Single-use token.
    await prisma.verificationToken.delete({ where: { token: matchedRecord.token } }).catch(() => {});

    // Invalidate revalidation cache so the new password takes effect immediately
    // on subsequent requests rather than waiting for the TTL to expire.
    const updatedUser = await prisma.user.findFirst({ where: { email: matchedRecord.identifier, deletedAt: null }, select: { id: true } });
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