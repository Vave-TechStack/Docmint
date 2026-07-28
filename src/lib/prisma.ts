import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * DocMint Prisma Client Singleton
 * Uses @prisma/adapter-pg for PostgreSQL connectivity
 * Prisma v7 requires a driver adapter — this ensures one is always provided.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('[PRISMA] DATABASE_URL is not set. PrismaClient will fail.');
    // Still return a client so the error surfaces clearly
    return new PrismaClient({ log: ['error'] });
  }

  try {
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  } catch (err) {
    console.error('[PRISMA] Failed to create PrismaPg adapter:', err);
    throw err;
  }
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = getPrisma();
export default prisma;
