/**
 * 🚨 TEMPORARY DEBUG ENDPOINT 🚨
 * This helps diagnose why login is failing.
 * DELETE AFTER FIXING THE ISSUE.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function GET() {
  const results: Record<string, any> = {};

  try {
    // Step 1: Check env vars
    results.env = {
      DATABASE_URL: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 40)}...` : 'NOT SET',
      AUTH_SECRET: process.env.AUTH_SECRET ? '✅ SET' : '❌ NOT SET',
      AUTH_URL: process.env.AUTH_URL || 'NOT SET',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✅ SET' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV,
    };

    // Step 2: Try to import prisma
    const { prisma } = await import('@/lib/prisma');

    // Step 3: Try to connect to database
    try {
      await prisma.$connect();
      results.db = { connected: true };
    } catch (e: any) {
      results.db = { connected: false, error: e.message };
    }

    // Step 4: Look up admin user
    const user = await prisma.user.findUnique({
      where: { email: 'admin@docmint.com' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        organizationId: true,
      },
    });

    if (!user) {
      // Check if any users exist
      const userCount = await prisma.user.count();
      results.user = { found: false, totalUsersInDb: userCount };
    } else {
      results.user = {
        found: true,
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        hasPasswordHash: !!user.passwordHash,
        passwordHashLength: user.passwordHash?.length,
      };

      // Step 5: Test bcrypt
      if (user.passwordHash) {
        const testCorrect = await bcrypt.compare('Admin@749', user.passwordHash);
        const testWrong = await bcrypt.compare('WrongPassword123', user.passwordHash);
        results.bcrypt = {
          correctPassword: testCorrect,
          wrongPassword: testWrong,
        };
      }

      // Step 6: Check organization
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
      });
      results.organization = org
        ? { found: true, name: org.name, plan: org.plan, status: org.status }
        : { found: false };
    }

    await prisma.$disconnect();
  } catch (e: any) {
    results.error = {
      message: e.message,
      stack: e.stack?.substring(0, 500),
      code: e.code,
    };
  }

  return NextResponse.json(results, { status: 200 });
}
