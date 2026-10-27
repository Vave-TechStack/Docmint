import { prisma } from '@/lib/prisma';

/**
 * Whether the organization currently has premium access — an active (or
 * grace-period) Subscription row, a cancelled subscription still inside its
 * paid period, OR an admin-granted org plan of PREMIUM / ENTERPRISE for orgs
 * that have no Subscription record at all.
 *
 * This is the entitlement that unlocks premium template downloads.
 *
 * Invariants this function must preserve:
 *  - ACTIVE / GRACE_PERIOD keep access through graceEndDate (the grace window
 *    is what the "renew before …" banner promises).
 *  - CANCELLED keeps access until endDate — the cancel email promises access
 *    "until the end of the current billing period".
 *  - Once the paid/grace window lapses, access is revoked. The subscription
 *    flows mirror `Organization.plan = PREMIUM` and never reset it, so the
 *    org-plan fallback must NOT be consulted while a Subscription record
 *    exists — otherwise a lapsed customer would keep premium forever.
 *  - ENTERPRISE is only ever set by an admin and outranks a lapsed row.
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
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organization.findFirst({
        where: { id: organizationId },
        select: { plan: true },
      }),
    ]);

    const orgPlan = organization?.plan ?? null;

    if (subscription) {
      const now = Date.now();

      if (subscription.status === 'ACTIVE' || subscription.status === 'GRACE_PERIOD') {
        const endsAt = subscription.graceEndDate ?? subscription.endDate;
        if (endsAt && endsAt.getTime() > now) return true;
      } else if (subscription.status === 'CANCELLED') {
        // Honour the cancellation promise: access runs to the end of the
        // paid period, not to the grace window.
        if (subscription.endDate && subscription.endDate.getTime() > now) return true;
      }

      // An admin-granted Enterprise plan outranks a lapsed Subscription row.
      return orgPlan === 'ENTERPRISE';
    }

    // No Subscription record ever → honour an admin-granted org plan.
    return orgPlan === 'PREMIUM' || orgPlan === 'ENTERPRISE';
  } catch (error) {
    console.error('Subscription entitlement check error:', error);
    return false;
  }
}
