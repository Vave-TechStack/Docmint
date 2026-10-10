import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, authMocks, paymentMocks } = vi.hoisted(() => ({
  prismaMocks: {
    user: { findFirst: vi.fn() },
    subscription: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  authMocks: { auth: vi.fn() },
  paymentMocks: { processRefund: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/auth', () => ({ auth: authMocks.auth }));

import { mockRevalidation, resetSessionUser } from '@/test/guard-harness';
import { __clearRevalidationCache } from '@/lib/security/authorization';
vi.mock('@/lib/payment/razorpay', () => ({
  PaymentService: { processRefund: paymentMocks.processRefund },
}));

import { GET, PATCH } from './route';

const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const SUPER_ADMIN_SESSION = { user: { id: 'super_1', role: 'SUPER_ADMIN', organizationId: 'org_A', passwordVersion: 0 } };
const USER_SESSION = { user: { id: 'user_1', role: 'USER', organizationId: 'org_A', passwordVersion: 0 } };

const SUBSCRIPTION = {
  id: 'sub_1',
  organizationId: 'org_A',
  userId: 'user_1',
  plan: 'PREMIUM',
  status: 'ACTIVE',
  amount: 9900,
  payments: [],
};

const PAYMENT = {
  id: 'pay_1',
  subscriptionId: 'sub_1',
  razorpayPaymentId: 'pay_abc',
  amount: 9900,
  status: 'SUCCESS',
  refundId: null,
};

function patch(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/admin/subscriptions', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  });
  return PATCH(request);
}

function get(query = ''): Promise<Response> {
  return GET(new NextRequest(`http://localhost:3000/api/admin/subscriptions${query}`));
}

describe('/api/admin/subscriptions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __clearRevalidationCache();
    resetSessionUser();
    mockRevalidation(prismaMocks.user.findFirst, () => authMocks.auth());
    prismaMocks.subscription.update.mockResolvedValue({});
    prismaMocks.subscription.findFirst.mockResolvedValue(SUBSCRIPTION);
    prismaMocks.payment.findFirst.mockResolvedValue(PAYMENT);
    prismaMocks.payment.update.mockResolvedValue({});
    prismaMocks.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.auditLog.create.mockResolvedValue({});
    paymentMocks.processRefund.mockResolvedValue({ id: 'rfnd_1' });
  });

  // ─── Authorization ─────────────────────────────────────────

  describe('GET authorization', () => {
    it('rejects unauthenticated requests', async () => {
      authMocks.auth.mockResolvedValue(null);
      const res = await get();
      expect(res.status).toBe(401);
      expect(prismaMocks.subscription.findMany).not.toHaveBeenCalled();
    });

    it('rejects a non-admin with 403 (not 401)', async () => {
      authMocks.auth.mockResolvedValue(USER_SESSION);
      const res = await get();
      expect(res.status).toBe(403);
    });
  });

  describe('GET tenant scoping', () => {
    it('pins the query to the ADMIN own organization', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.subscription.findMany.mockResolvedValue([]);
      prismaMocks.subscription.count.mockResolvedValue(0);

      await get();

      const where = prismaMocks.subscription.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org_A');
    });

    it('lets a SUPER_ADMIN list platform-wide when no org is specified', async () => {
      authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
      prismaMocks.subscription.findMany.mockResolvedValue([]);
      prismaMocks.subscription.count.mockResolvedValue(0);

      await get();

      const where = prismaMocks.subscription.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBeUndefined();
    });

    it('lets a SUPER_ADMIN narrow to one org via ?organizationId=', async () => {
      authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
      prismaMocks.subscription.findMany.mockResolvedValue([]);
      prismaMocks.subscription.count.mockResolvedValue(0);

      await get('?organizationId=org_ZZZZZZ');

      const where = prismaMocks.subscription.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org_ZZZZZZ');
    });

    it('ignores a malformed ?organizationId= rather than widening scope', async () => {
      authMocks.auth.mockResolvedValue(SUPER_ADMIN_SESSION);
      prismaMocks.subscription.findMany.mockResolvedValue([]);
      prismaMocks.subscription.count.mockResolvedValue(0);

      // Too short to be a cuid, and an injection attempt rather than an id.
      await get(`?organizationId=${encodeURIComponent("' OR 1=1--")}`);

      const where = prismaMocks.subscription.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBeUndefined();
    });
  });

  describe('GET pagination', () => {
    beforeEach(() => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.subscription.findMany.mockResolvedValue([]);
      prismaMocks.subscription.count.mockResolvedValue(0);
    });

    it('clamps an oversized pageSize instead of dumping the table', async () => {
      const res = await get('?pageSize=1000000');
      const body = await res.json();

      const take = prismaMocks.subscription.findMany.mock.calls[0][0].take;
      expect(take).toBeLessThanOrEqual(100);
      expect(body.pageSize).toBeLessThanOrEqual(100);
    });

    it('falls back to page 1 for a non-numeric page (no NaN skip)', async () => {
      await get('?page=abc');
      const call = prismaMocks.subscription.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(Number.isNaN(call.skip)).toBe(false);
    });

    it('rejects an unknown status filter instead of querying for it', async () => {
      await get('?status=NOT_A_STATUS');
      const where = prismaMocks.subscription.findMany.mock.calls[0][0].where;
      expect(where.status).toBeUndefined();
    });
  });

  // ─── Cross-tenant IDOR ──────────────────────────────────────

  describe('PATCH tenant scoping', () => {
    it('scopes the subscription lookup to the caller organization', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);

      await patch({ subscriptionId: 'sub_1', action: 'cancel' });

      const where = prismaMocks.subscription.findFirst.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org_A');
      expect(where.id).toBe('sub_1');
    });

    it('404s when the subscription belongs to another tenant', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      // The scoped query finds nothing for org_A.
      prismaMocks.subscription.findFirst.mockResolvedValue(null);

      const res = await patch({ subscriptionId: 'sub_other', action: 'cancel' });

      expect(res.status).toBe(404);
      expect(prismaMocks.subscription.update).not.toHaveBeenCalled();
      expect(paymentMocks.processRefund).not.toHaveBeenCalled();
    });

    it('rejects an unauthenticated PATCH', async () => {
      authMocks.auth.mockResolvedValue(null);
      const res = await patch({ subscriptionId: 'sub_1', action: 'cancel' });
      expect(res.status).toBe(401);
      expect(prismaMocks.subscription.update).not.toHaveBeenCalled();
    });

    it('rejects a cross-origin PATCH (CSRF)', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const request = new NextRequest('http://localhost:3000/api/admin/subscriptions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ subscriptionId: 'sub_1', action: 'cancel' }),
      });
      const res = await PATCH(request);
      expect(res.status).toBe(403);
      expect(prismaMocks.subscription.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown action', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ subscriptionId: 'sub_1', action: 'drop_database' });
      expect(res.status).toBe(400);
      expect(prismaMocks.subscription.update).not.toHaveBeenCalled();
    });
  });

  // ─── change_plan ────────────────────────────────────────────

  describe('change_plan', () => {
    it('rejects a plan outside the enum', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ subscriptionId: 'sub_1', action: 'change_plan', plan: 'GOD_MODE' });
      expect(res.status).toBe(400);
      expect(prismaMocks.subscription.update).not.toHaveBeenCalled();
    });

    it('accepts a valid plan and writes an audit log', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ subscriptionId: 'sub_1', action: 'change_plan', plan: 'enterprise' });
      expect(res.status).toBe(200);
      expect(prismaMocks.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: 'ENTERPRISE' } })
      );
      expect(prismaMocks.auditLog.create).toHaveBeenCalled();
    });
  });

  // ─── refund ────────────────────────────────────────────────

  describe('refund', () => {
    it('rejects a refundAmount larger than the captured amount', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({
        subscriptionId: 'sub_1', action: 'refund',
        refundPaymentId: 'pay_1', refundAmount: 999999,
      });
      expect(res.status).toBe(400);
      expect(paymentMocks.processRefund).not.toHaveBeenCalled();
    });

    it('rejects a negative refundAmount', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({
        subscriptionId: 'sub_1', action: 'refund',
        refundPaymentId: 'pay_1', refundAmount: -500,
      });
      expect(res.status).toBe(400);
      expect(paymentMocks.processRefund).not.toHaveBeenCalled();
    });

    it('rejects a non-integer refundAmount', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({
        subscriptionId: 'sub_1', action: 'refund',
        refundPaymentId: 'pay_1', refundAmount: 10.5,
      });
      expect(res.status).toBe(400);
      expect(paymentMocks.processRefund).not.toHaveBeenCalled();
    });

    it('refunds and records the actual amount for a valid partial refund', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({
        subscriptionId: 'sub_1', action: 'refund',
        refundPaymentId: 'pay_1', refundAmount: 5000,
      });
      expect(res.status).toBe(200);
      expect(paymentMocks.processRefund).toHaveBeenCalledWith('pay_abc', 5000);
      expect(prismaMocks.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PARTIALLY_REFUNDED', refundAmount: 5000 }),
        })
      );
    });

    it('claims the payment atomically before calling the gateway', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      await patch({ subscriptionId: 'sub_1', action: 'refund', refundPaymentId: 'pay_1' });

      const claim = prismaMocks.payment.updateMany.mock.calls[0][0];
      // The claim is one guarded UPDATE, so concurrent refunds cannot both win.
      expect(claim.where).toEqual(
        expect.objectContaining({ id: 'pay_1', refundId: null, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] } })
      );
      expect(claim.data.refundId).toMatch(/^pending:/);
    });

    it('refuses to refund when another request already holds the claim', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.payment.updateMany.mockResolvedValue({ count: 0 });

      const res = await patch({ subscriptionId: 'sub_1', action: 'refund', refundPaymentId: 'pay_1' });

      expect(res.status).toBe(409);
      expect(paymentMocks.processRefund).not.toHaveBeenCalled();
    });

    it('releases the claim when the gateway fails so the refund can be retried', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      paymentMocks.processRefund.mockRejectedValue(new Error('gateway down'));

      const res = await patch({ subscriptionId: 'sub_1', action: 'refund', refundPaymentId: 'pay_1' });

      expect(res.status).toBe(500);
      const release = prismaMocks.payment.updateMany.mock.calls[1][0];
      expect(release.data).toEqual({ refundId: null });
    });

    it('404s when the payment does not belong to the subscription', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      prismaMocks.payment.findFirst.mockResolvedValue(null);

      const res = await patch({ subscriptionId: 'sub_1', action: 'refund', refundPaymentId: 'pay_x' });

      expect(res.status).toBe(404);
      expect(paymentMocks.processRefund).not.toHaveBeenCalled();
    });

    it('requires a payment id', async () => {
      authMocks.auth.mockResolvedValue(ADMIN_SESSION);
      const res = await patch({ subscriptionId: 'sub_1', action: 'refund' });
      expect(res.status).toBe(400);
    });
  });
});
