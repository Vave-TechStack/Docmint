import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { EmailService } from '@/lib/email/email-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, companyName, email, mobile, gstNumber, panNumber, address, password } = body;

    // Validate required fields
    if (!name || !companyName || !email || !mobile || !address || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if email exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
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
          email,
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
          companyEmail: email,
          companyPhone: mobile,
        },
      });

      return { org, user };
    });

    // Send welcome email
    await EmailService.sendWelcomeEmail(email, name);

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
