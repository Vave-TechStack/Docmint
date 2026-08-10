/**
 * DocMint - Admin User Seed Script
 * Creates the SUPER_ADMIN user with Admin / Admin@749 credentials.
 * 
 * Run: npx tsx prisma/seed-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';

// ─── Load .env ───
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;
function createPrismaClient(): PrismaClient {
  if (connectionString) {
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
  }
  throw new Error('DATABASE_URL not found');
}

const prisma = createPrismaClient();

async function main() {
  console.log('🔐 DocMint - Creating Admin User...\n');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@docmint.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@749';

  // ─── Create or find the organization ───
  let org = await prisma.organization.findFirst({
    where: { slug: 'docmint' },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'DocMint',
        slug: 'docmint',
        plan: 'PREMIUM',
        status: 'ACTIVE',
        maxUsers: 1000,
      },
    });
    console.log(`  ✅ Organization created: "${org.name}" (${org.id})`);
  } else {
    console.log(`  ⏭  Organization found: "${org.name}"`);
  }

  // ─── Create or update the SUPER_ADMIN user ───
  let user = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  if (!user) {
    user = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Admin',
        email: adminEmail,
        passwordHash,
        role: 'SUPER_ADMIN',
        emailVerified: new Date(),
        isActive: true,
      },
    });
    console.log(`  ✅ Admin user created: "${adminEmail}"`);
  } else {
    user = await prisma.user.update({
      where: { email: adminEmail },
      data: {
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
    console.log(`  ✅ Admin user updated: "${adminEmail}"`);
  }

  console.log(`\n📋 Admin Login Credentials:`);
  console.log(`   Email:    ${adminEmail}`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`   Role:     ${user.role}`);
  console.log(`   Org:      ${org.name}`);
  console.log(`\n✨ Admin setup complete!\n`);
}

main()
  .catch((e: unknown) => {
    const err = e as { code?: string; message?: string };
    if (err.code === 'ECONNREFUSED') {
      console.error('\n❌ Could not connect to database. Is it running?');
    } else {
      console.error('❌ Failed:', err.message || e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
