import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { EmailService } from '@/lib/email/email-service';
import { EMAIL_VERIFICATION_TOKEN_TTL_MS } from '@/lib/utils/constants';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    // Abuse guard: max 5 signups per minute per IP. No email enumeration is
    // possible through this limiter alone, but combined with the generic 409
    // below it keeps bulk account/org creation from being scripted.
    const ip = getClientIp(request);
    if (!checkRateLimit(`signup:${ip}`, 5, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many signup attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, companyName, email, mobile, gstNumber, panNumber, address, password } = body;

    // Validate required fields
    if (!name || !companyName || !email || !mobile || !address || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    // Normalize: emails are stored and matched lowercased everywhere.
    const normalizedEmail = email.trim().toLowerCase();

    // Check if email exists
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Create organization and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const org = await tx.organization.create({
        data: {
          name: companyName,
          slug: companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        },
      });

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          name,
          email: normalizedEmail,
          mobile,
          gstNumber,
          panNumber,
          companyAddress: address,
          passwordHash: hashedPassword,
        },
      });

      // Create default company profile
      await tx.companyProfile.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          companyName,
          companyAddress: address,
          companyEmail: normalizedEmail,
          companyPhone: mobile,
        },
      });

      return { org, user };
    });

    // Send a real verification email: a single-use token stored in the
    // VerificationToken table, linked from /verify-email?token=... Failing to
    // send must not roll back the account — the user can request a fresh link
    // from /verify-email.
    try {
      // "v_" prefix marks this as a verification token (see verify-email route).
      const verificationToken = `v_${crypto.randomBytes(32).toString('hex')}`;
      await prisma.verificationToken.create({
        data: {
          identifier: normalizedEmail,
          token: verificationToken,
          expires: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
        },
      });
      await EmailService.sendVerificationEmail(normalizedEmail, verificationToken);
    } catch (emailErr) {
      console.error('Signup verification email failed:', emailErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. Please verify your email.',
      data: {
        userId: result.user.id,
        organizationId: result.org.id,
        organizationSlug: result.org.slug,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
