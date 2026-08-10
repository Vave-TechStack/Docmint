import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

/**
 * Multi-tenant context extracted from request
 */
export interface TenantContext {
  organizationId: string;
  organizationSlug: string;
  userId: string;
  userRole: string;
}

/**
 * Get the current tenant context from request headers
 * Tenant is determined by either:
 * 1. JWT token (tenant_id claim) for authenticated users
 * 2. Subdomain for organization-specific access
 * 3. Custom domain for enterprise customers
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const headersList = await headers();
  const tenantId = headersList.get('x-tenant-id');
  const userId = headersList.get('x-user-id');
  const userRole = headersList.get('x-user-role');

  if (!tenantId || !userId) return null;

  return {
    organizationId: tenantId,
    organizationSlug: headersList.get('x-tenant-slug') || '',
    userId,
    userRole: userRole || 'USER',
  };
}

/**
 * Resolve tenant from domain/slug
 */
export async function resolveTenant(slugOrDomain: string): Promise<{ id: string; name: string; slug: string; plan: string } | null> {
  const org = await prisma.organization.findFirst({
    where: {
      OR: [
        { slug: slugOrDomain },
        { domain: slugOrDomain },
      ],
    },
    select: { id: true, name: true, slug: true, plan: true },
  });

  return org;
}

/**
 * Tenant-scoped query helper - appends tenantId to where clause
 */
export function withTenant<T extends Record<string, unknown>>(
  where: T,
  tenantId: string
): T & { organizationId: string } {
  return {
    ...where,
    organizationId: tenantId,
  };
}

/**
 * Verify that a resource belongs to the user's tenant
 */
export async function verifyTenantAccess(
  resourceType: string,
  resourceId: string,
  tenantId: string
): Promise<boolean> {
  const where: Record<string, string> = { id: resourceId, organizationId: tenantId };

  // Dynamic model access — typed via an index signature to avoid `any`
  const count = await (prisma as unknown as Record<
    string,
    { count: (args: { where: Record<string, string> }) => Promise<number> }
  >)[resourceType].count({ where });
  return count > 0;
}
