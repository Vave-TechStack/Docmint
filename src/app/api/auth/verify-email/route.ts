import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { invalidateUserCache } from '@/lib/security/authorization';
import { verifyTokenHash } from '@/lib/security/crypto';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Upper bound on candidate hashes examined per request.
 *
 * Tokens are stored hashed, so the row cannot be looked up by value — every
 * unexpired token has to be bcrypt-compared. That made this route
 * O(unexpired tokens across ALL tenants) × ~250ms of bcrypt, reachable without
 * authentication: an unbounded, unmetered CPU-exhaustion vector that also grew
 * over time, since nothing prunes expired rows and each forgot-password or
 * resend-verification call inserts another.
 *
 * The cap bounds the worst case. It is not a substitute for an indexed lookup
 * — see the staging notes for the HMAC lookup column that removes the sweep.
 */
const MAX_TOKEN_CANDIDATES = 50;

export async function GET(request: NextRequest) {
  try {
    // Applied before the database and bcrypt work, keyed by IP. Without it the
    // sweep below is an unauthenticated DoS amplifier.
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

    // Since tokens are now stored hashed, we must find candidate tokens by
    // identifier (email) and verify the provided token against each hash.
    // First, find all unexpired verification tokens (v_* prefix tokens).
    const candidateTokens = await prisma.verificationToken.findMany({
      where: {
        expires: { gt: new Date() },
        // We can't filter by token prefix in DB since it's hashed, so we'll
        // verify each candidate. The number of unexpired tokens per email is
        // typically 0 or 1, so this is efficient.
      },
      take: MAX_TOKEN_CANDIDATES,
      orderBy: { expires: 'desc' },
    });

    let matchedRecord: { identifier: string; token: string; expires: Date } | null = null;

    for (const candidate of candidateTokens) {
      // Only check tokens that were created as verification tokens (v_ prefix)
      // The original token had v_ prefix, but we only have the hash now.
      // We verify the provided token against each stored hash.
      const isMatch = await verifyTokenHash(token, candidate.token);
      if (isMatch) {
        matchedRecord = candidate;
        break;
      }
    }

    if (!matchedRecord) {
      return NextResponse.json(
        { success: false, error: 'Invalid or already-used verification link' },
        { status: 400 }
      );
    }

    // Mark the owning account's email as verified (token identifier = email).
    const updated = await prisma.user.updateMany({
      where: { email: matchedRecord.identifier, deletedAt: null },
      data: { emailVerified: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Account not found for this verification link' },
        { status: 404 }
      );
    }

    // Tokens are single-use.
    await prisma.verificationToken.delete({ where: { token: matchedRecord.token } }).catch(() => {});

    // Invalidate revalidation cache so the verified email status takes effect immediately
    const updatedUser = await prisma.user.findFirst({ where: { email: matchedRecord.identifier, deletedAt: null }, select: { id: true } });
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