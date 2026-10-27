import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { hasActivePremiumSubscription } from './subscription';

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 10 * DAY);
const past = () => new Date(Date.now() - 10 * DAY);

describe('hasActivePremiumSubscription', () => {
  const findFirstMock = prisma.subscription.findFirst as ReturnType<typeof vi.fn>;
  const orgFindFirstMock = prisma.organization.findFirst as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findFirstMock.mockReset();
    orgFindFirstMock.mockReset();
  });

  it('should return false without an organizationId and not query the DB', async () => {
    expect(await hasActivePremiumSubscription(undefined)).toBe(false);
    expect(await hasActivePremiumSubscription(null)).toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(orgFindFirstMock).not.toHaveBeenCalled();
  });

  it('should return true when an active subscription is inside its grace window', async () => {
    findFirstMock.mockResolvedValue({
      id: 'sub-1',
      status: 'ACTIVE',
      endDate: past(),
      graceEndDate: future(),
    });
    orgFindFirstMock.mockResolvedValue({ plan: 'FREE' });

    expect(await hasActivePremiumSubscription('org-1')).toBe(true);
    expect(findFirstMock.mock.calls[0][0].where.organizationId).toBe('org-1');
  });

  it('should keep access through the grace window for a GRACE_PERIOD subscription', async () => {
    findFirstMock.mockResolvedValue({
      id: 'sub-1',
      status: 'GRACE_PERIOD',
      endDate: past(),
      graceEndDate: future(),
    });
    orgFindFirstMock.mockResolvedValue({ plan: 'FREE' });

    expect(await hasActivePremiumSubscription('org-1')).toBe(true);
  });

  it('should revoke access after the grace window even if the org plan is still PREMIUM', async () => {
    // Regression: the subscription flows mirror org.plan = PREMIUM and never
    // reset it. A lapsed subscription must not leave a permanent grant.
    findFirstMock.mockResolvedValue({
      id: 'sub-1',
      status: 'ACTIVE',
      endDate: past(),
      graceEndDate: past(),
    });
    orgFindFirstMock.mockResolvedValue({ plan: 'PREMIUM' });

    expect(await hasActivePremiumSubscription('org-1')).toBe(false);
  });

  it('should keep access until endDate for a CANCELLED subscription (the cancellation promise)', async () => {
    findFirstMock.mockResolvedValue({
      id: 'sub-1',
      status: 'CANCELLED',
      endDate: future(),
      graceEndDate: future(),
    });
    orgFindFirstMock.mockResolvedValue({ plan: 'PREMIUM' });

    expect(await hasActivePremiumSubscription('org-1')).toBe(true);
  });

  it('should revoke access once a CANCELLED subscription reaches endDate', async () => {
    findFirstMock.mockResolvedValue({
      id: 'sub-1',
      status: 'CANCELLED',
      endDate: past(),
      graceEndDate: future(),
    });
    orgFindFirstMock.mockResolvedValue({ plan: 'PREMIUM' });

    expect(await hasActivePremiumSubscription('org-1')).toBe(false);
  });

  it('should return true for an admin-granted PREMIUM/ENTERPRISE org plan without a subscription', async () => {
    findFirstMock.mockResolvedValue(null);
    orgFindFirstMock.mockResolvedValue({ plan: 'PREMIUM' });
    expect(await hasActivePremiumSubscription('org-1')).toBe(true);

    findFirstMock.mockResolvedValue(null);
    orgFindFirstMock.mockResolvedValue({ plan: 'ENTERPRISE' });
    expect(await hasActivePremiumSubscription('org-1')).toBe(true);
  });

  it('should return false when no subscription and the org is FREE', async () => {
    findFirstMock.mockResolvedValue(null);
    orgFindFirstMock.mockResolvedValue({ plan: 'FREE' });
    expect(await hasActivePremiumSubscription('org-1')).toBe(false);
  });

  it('should honour an admin-granted ENTERPRISE plan even when a subscription lapsed', async () => {
    findFirstMock.mockResolvedValue({
      id: 'sub-1',
      status: 'EXPIRED',
      endDate: past(),
      graceEndDate: past(),
    });
    orgFindFirstMock.mockResolvedValue({ plan: 'ENTERPRISE' });

    expect(await hasActivePremiumSubscription('org-1')).toBe(true);
  });

  it('should fail closed when the DB errors', async () => {
    findFirstMock.mockRejectedValue(new Error('db down'));
    expect(await hasActivePremiumSubscription('org-1')).toBe(false);
  });
});
