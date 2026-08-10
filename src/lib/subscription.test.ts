import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { hasActivePremiumSubscription } from './subscription';

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

  it('should return true when an active subscription exists', async () => {
    findFirstMock.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
    orgFindFirstMock.mockResolvedValue({ plan: 'FREE' });

    const result = await hasActivePremiumSubscription('org-1');

    expect(result).toBe(true);
    const where = findFirstMock.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-1');
    expect(where.status).toEqual({ in: ['ACTIVE', 'GRACE_PERIOD'] });
    expect(where.endDate.gt).toBeInstanceOf(Date);
  });

  it('should return false when no subscription and the org is FREE', async () => {
    findFirstMock.mockResolvedValue(null);
    orgFindFirstMock.mockResolvedValue({ plan: 'FREE' });
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

  it('should fail closed when the DB errors', async () => {
    findFirstMock.mockRejectedValue(new Error('db down'));
    expect(await hasActivePremiumSubscription('org-1')).toBe(false);
  });
});
