import type { Prisma } from '@prisma/client';

/**
 * Safely cast a value to Prisma's InputJsonValue type.
 * Prisma v7 has strict JSON typing that doesn't accept Record<string, unknown>.
 * This helper centralizes the escape hatch for Prisma JSON fields.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
