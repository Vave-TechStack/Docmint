import { defineConfig } from 'prisma/config';

/**
 * Prisma v7 Configuration
 * Connection URL reads from DATABASE_URL environment variable
 */
export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || '',
  },
});
