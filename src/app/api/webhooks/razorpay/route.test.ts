import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

// Mock prisma so no DATABASE_URL / real PrismaClient is needed. The stub
// exposes only the methods the webhook route actually calls.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    payment: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from './route';

const SECRET = 'test_webhook_secret';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

// Unique client IP per request so the in-memory per-IP rate limiter
// (10 req/s) can never trip across tests.
let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `10.0.0.${(ipSeed % 250) + 1}`;
}

function post(body: string, signature?: string): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': nextIp(),
      ...(signature ? { 'x-razorpay-signature': signature } : {}),
    },
    body,
  });
  return POST(request);
}

describe('POST /api/webhooks/razorpay', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    // Silence the route's logging during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('signature verification', () => {
    it('rejects requests without an x-razorpay-signature header (401)', async () => {
      const res = await post(JSON.stringify({ event: 'order.paid', payload: {} }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ success: false, error: 'Missing signature' });
      expect(prismaMock.payment.upsert).not.toHaveBeenCalled();
    });

    it('rejects requests with an invalid signature (401)', async () => {
      const res = await post(
        JSON.stringify({ event: 'order.paid', payload: {} }),
        'sha256=not-the-real-signature'
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ success: false, error: 'Invalid signature' });
      expect(prismaMock.payment.upsert).not.toHaveBeenCalled();
    });

    it('returns 500 when RAZORPAY_WEBHOOK_SECRET is not configured', async () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      const res = await post(
        JSON.stringify({ event: 'order.paid', payload: {} }),
        'sha256=whatever'
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'Webhook not configured' });
    });

    it('accepts a request signed with the correct HMAC-SHA256', async () => {
      const body = JSON.stringify({ event: 'order.paid', payload: {} });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  });

  describe('payment recording', () => {
    it('records an INSTANT_DOWNLOAD payment on order.paid', async () => {
      const body = JSON.stringify({
        event: 'order.paid',
        payload: {
          order: { entity: { id: 'order_inst_123', amount: 900, currency: 'INR' } },
        },
      });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(prismaMock.payment.upsert).toHaveBeenCalledWith({
        where: { razorpayOrderId: 'order_inst_123' },
        update: { status: 'SUCCESS' },
        create: expect.objectContaining({
          razorpayOrderId: 'order_inst_123',
          amount: 900,
          currency: 'INR',
          status: 'SUCCESS',
          paymentType: 'INSTANT_DOWNLOAD',
          organizationId: 'webhook',
        }),
      });
    });

    it('marks a captured payment SUCCESS on payment.captured', async () => {
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_1', order_id: 'order_1', status: 'captured' } },
        },
      });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
        where: { OR: [{ razorpayPaymentId: 'pay_1' }, { razorpayOrderId: 'order_1' }] },
        data: { razorpayPaymentId: 'pay_1', status: 'SUCCESS' },
      });
    });

    it('marks a failed payment FAILED on payment.failed', async () => {
      const body = JSON.stringify({
        event: 'payment.failed',
        payload: {
          payment: { entity: { id: 'pay_3' } },
        },
      });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
        where: { razorpayPaymentId: 'pay_3' },
        data: { status: 'FAILED' },
      });
    });

    it('marks a non-captured payment FAILED on payment.captured', async () => {
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_2', order_id: 'order_2', status: 'authorized' } },
        },
      });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { razorpayPaymentId: 'pay_2', status: 'FAILED' },
        })
      );
    });

    it('activates a subscription and records a SUBSCRIPTION payment on subscription.activated', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 'sub_db_1',
        organizationId: 'org_1',
        userId: 'user_1',
        amount: 29900,
        currency: 'INR',
        status: 'PENDING',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      const body = JSON.stringify({
        event: 'subscription.activated',
        payload: {
          subscription: {
            entity: { id: 'sub_rzp_1', status: 'active', start_at: 1700000000, end_at: 1702592000 },
          },
        },
      });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(prismaMock.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub_db_1' } })
      );
      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentType: 'SUBSCRIPTION', status: 'SUCCESS' }),
        })
      );
    });
  });

  describe('payload handling', () => {
    it('rejects a payload missing event/payload (400)', async () => {
      const body = JSON.stringify({ foo: 'bar' });
      const res = await post(body, sign(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Invalid webhook payload' });
    });

    it('acknowledges unknown event types with 200', async () => {
      const body = JSON.stringify({ event: 'checkout.session.completed', payload: {} });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });

    it('returns 500 when the signed body is not valid JSON', async () => {
      const body = 'this is not json'; // valid signature, garbage payload
      const res = await post(body, sign(body));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'Webhook processing failed' });
    });
  });
});
