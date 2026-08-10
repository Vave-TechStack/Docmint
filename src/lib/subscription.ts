import { prisma } from '@/lib/prisma';

/**
 * Whether the organization currently has premium access — an active (or
 * grace-period) Subscription row, OR an admin-granted org plan of PREMIUM /
 * ENTERPRISE (an org can be upgraded without a Subscription record).
 *
 * This is the entitlement that unlocks premium template downloads.
 *
 * Fails closed: if the DB errors, we deny access rather than let a broken
 * check open the paywall.
 */
export async function hasActivePremiumSubscription(
  organizationId?: string | null
): Promise<boolean> {
  if (!organizationId) return false;

  try {
    const [subscription, organization] = await Promise.all([
      prisma.subscription.findFirst({
        where: {
          organizationId,
          status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
          endDate: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organization.findFirst({
        where: { id: organizationId },
        select: { plan: true },
      }),
    ]);

    if (subscription) return true;
    return organization?.plan === 'PREMIUM' || organization?.plan === 'ENTERPRISE';
  } catch (error) {
    console.error('Subscription entitlement check error:', error);
    return false;
  }
}
