import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const { prismaMocks, emailMocks } = vi.hoisted(() => ({
  prismaMocks: {
    subscription: { findFirst: vi.fn() },
    organization: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  emailMocks: {
    send: vi.fn(),
    sendSubscriptionEmail: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/email/email-service', () => ({ EmailService: emailMocks }));

import { POST, PATCH } from './route';
import { auth } from '@/lib/auth';
import { PaymentService } from '@/lib/payment/razorpay';

// NextAuth types `auth` as a middleware wrapper; the route only uses its
// resolved session, so cast the mock to that shape.
type AuthResult = Promise<
  | {
      user: {
        id: string;
        organizationId: string;
        email: string;
        name: string;
        role: string;
      };
    }
  | null
>;
const authMock = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn<() => AuthResult>>;

const SESSION = {
  user: {
    id: 'user_1',
    organizationId: 'org_1',
    email: 'user@acme.com',
    name: 'Test User',
    role: 'USER',
  },
};

const FAKE_SUBSCRIPTION = {
  id: 'sub_1',
  organizationId: 'org_1',
  userId: 'user_1',
  plan: 'PREMIUM',
  status: 'ACTIVE',
  amount: 29900,
  currency: 'INR',
  startDate: new Date(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  graceEndDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
  autoRenew: true,
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function post(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request);
}

function patch(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/subscriptions', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // PATCH can technically fall through without returning in some type-level
  // branches; the route always returns for the inputs we test.
  return PATCH(request) as Promise<Response>;
}

describe('POST /api/subscriptions', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    authMock.mockResolvedValue(SESSION);
    // No active subscription by default
    prismaMocks.subscription.findFirst.mockResolvedValue(null);
    // Run the transaction body against a fake tx (create paths only for POST)
    prismaMocks.$transaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => unknown) =>
        fn({
          organization: { update: vi.fn().mockResolvedValue({ plan: 'PREMIUM' }) },
          subscription: {
            create: vi.fn().mockResolvedValue(FAKE_SUBSCRIPTION),
            update: vi.fn().mockResolvedValue({ ...FAKE_SUBSCRIPTION, status: 'ACTIVE' }),
          },
          payment: { create: vi.fn().mockResolvedValue({}) },
        })
    );
    emailMocks.sendSubscriptionEmail.mockResolvedValue(true);
    emailMocks.send.mockResolvedValue(true);
    verifySpy = vi.spyOn(PaymentService, 'verifySubscriptionPayment');
  });

  it('rejects unauthenticated requests with 401 before any verification', async () => {
    authMock.mockResolvedValue(null);
    const res = await post({
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      razorpaySignature: 'sig_1',
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('rejects a replayed ₹9 instant payment with 400 — the pricing bypass', async () => {
    // The attacker paid ₹9 via the instant flow; verifySubscriptionPayment
    // cross-checks the amount with Razorpay and returns false.
    verifySpy.mockResolvedValue(false);
    const res = await post({
      razorpayOrderId: 'order_inst_1',
      razorpayPaymentId: 'pay_inst_1',
      razorpaySignature: 'sig',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Payment verification failed' });
    // No subscription or payment rows may be created for an unverified payment
    expect(prismaMocks.$transaction).not.toHaveBeenCalled();
    expect(emailMocks.sendSubscriptionEmail).not.toHaveBeenCalled();
  });

  it('activates a monthly subscription only after verifying the ₹299 payment', async () => {
    verifySpy.mockResolvedValue(true);
    const res = await post({
      razorpayOrderId: 'order_sub',
      razorpayPaymentId: 'pay_sub',
      razorpaySignature: 'sig',
      planType: 'monthly',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(verifySpy).toHaveBeenCalledWith(
      'order_sub',
      'pay_sub',
      'sig',
      PaymentService.SUBSCRIPTION_AMOUNT
    );
    expect(prismaMocks.$transaction).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendSubscriptionEmail).toHaveBeenCalled();
  });

  it('requires the annual amount (₹2,870) for an annual plan', async () => {
    verifySpy.mockResolvedValue(true);
    const res = await post({
      razorpayOrderId: 'order_sub',
      razorpayPaymentId: 'pay_sub',
      razorpaySignature: 'sig',
      planType: 'annual',
    });
    expect(res.status).toBe(200);
    expect(verifySpy).toHaveBeenCalledWith(
      'order_sub',
      'pay_sub',
      'sig',
      PaymentService.ANNUAL_SUBSCRIPTION_AMOUNT
    );
  });

  it('returns 409 when an active subscription already exists (no double purchase)', async () => {
    prismaMocks.subscription.findFirst.mockResolvedValue(FAKE_SUBSCRIPTION);
    const res = await post({
      razorpayOrderId: 'order_sub',
      razorpayPaymentId: 'pay_sub',
      razorpaySignature: 'sig',
    });
    expect(res.status).toBe(409);
    expect(verifySpy).not.toHaveBeenCalled();
    expect(prismaMocks.$transaction).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/subscriptions (renew)', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    authMock.mockResolvedValue(SESSION);
    prismaMocks.subscription.findFirst.mockResolvedValue(FAKE_SUBSCRIPTION);
    prismaMocks.$transaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => unknown) =>
        fn({
          organization: { update: vi.fn().mockResolvedValue({ plan: 'PREMIUM' }) },
          subscription: {
            create: vi.fn().mockResolvedValue(FAKE_SUBSCRIPTION),
            update: vi.fn().mockResolvedValue({ ...FAKE_SUBSCRIPTION, status: 'ACTIVE' }),
          },
          payment: { create: vi.fn().mockResolvedValue({}) },
        })
    );
    emailMocks.send.mockResolvedValue(true);
    emailMocks.sendSubscriptionEmail.mockResolvedValue(true);
    verifySpy = vi.spyOn(PaymentService, 'verifySubscriptionPayment');
  });

  it('rejects a renewal paid with a cheaper (₹9) payment with 400', async () => {
    verifySpy.mockResolvedValue(false);
    const res = await patch({
      action: 'renew',
      razorpayOrderId: 'order_inst_1',
      razorpayPaymentId: 'pay_inst_1',
      razorpaySignature: 'sig',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Payment verification failed' });
    expect(prismaMocks.$transaction).not.toHaveBeenCalled();
  });

  it('renews only for a verified monthly-amount payment', async () => {
    verifySpy.mockResolvedValue(true);
    const res = await patch({
      action: 'renew',
      razorpayOrderId: 'order_sub',
      razorpayPaymentId: 'pay_sub',
      razorpaySignature: 'sig',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(verifySpy).toHaveBeenCalledWith(
      'order_sub',
      'pay_sub',
      'sig',
      PaymentService.SUBSCRIPTION_AMOUNT
    );
    expect(prismaMocks.$transaction).toHaveBeenCalledTimes(1);
  });
});
