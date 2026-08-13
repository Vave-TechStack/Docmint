import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// PaymentService captures the Razorpay credentials at module load (non-null
// assertions), and verifyPaymentAsync HMAC-signs with the secret — so the
// keys must be present before the module is imported for the real-signature
// tests below.
vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
});

import { PaymentService } from './razorpay';
import {
  INSTANT_DOWNLOAD_PRICE,
  PREMIUM_PRICE,
  ANNUAL_PREMIUM_PRICE,
} from '@/lib/utils/constants';

/** Valid Razorpay payment signature for orderId|paymentId under the test secret. */
function signatureFor(orderId: string, paymentId: string): string {
  return createHmac('sha256', 'rzp_test_secret')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

describe('PaymentService.resolveInstantAmount', () => {
  it('enforces a floor of at least 900 paise (₹9) for any client-supplied amount', () => {
    expect(PaymentService.resolveInstantAmount(1)).toBe(900); // ₹0.01
    expect(PaymentService.resolveInstantAmount(0)).toBe(900);
    expect(PaymentService.resolveInstantAmount(-50)).toBe(900);
    expect(PaymentService.resolveInstantAmount(899)).toBe(900); // just below ₹9
    expect(PaymentService.resolveInstantAmount(Number.NaN)).toBe(900);
    // A tampered client could send a numeric string from the JSON body
    expect(PaymentService.resolveInstantAmount('0' as unknown as number)).toBe(900);
  });

  it('falls back to the published price (INR → paise) when no amount is supplied', () => {
    expect(PaymentService.resolveInstantAmount(undefined)).toBe(INSTANT_DOWNLOAD_PRICE * 100);
    expect(PaymentService.resolveInstantAmount(null as unknown as number)).toBe(
      INSTANT_DOWNLOAD_PRICE * 100
    );
  });

  it('passes through amounts at or above the minimum unchanged', () => {
    expect(PaymentService.resolveInstantAmount(900)).toBe(900);
    expect(PaymentService.resolveInstantAmount(5000)).toBe(5000);
  });

  it('keeps the minimum in sync with the published price constant', () => {
    expect(PaymentService.MIN_INSTANT_AMOUNT).toBe(INSTANT_DOWNLOAD_PRICE * 100);
  });
});

describe('PaymentService.resolveSubscriptionAmount', () => {
  it('accepts the monthly amount (₹299 = 29900 paise)', () => {
    expect(PaymentService.resolveSubscriptionAmount(29900)).toBe(29900);
    expect(PaymentService.resolveSubscriptionAmount(PaymentService.SUBSCRIPTION_AMOUNT)).toBe(
      PaymentService.SUBSCRIPTION_AMOUNT
    );
  });

  it('accepts the annual amount (₹2,870 = 287000 paise)', () => {
    expect(PaymentService.resolveSubscriptionAmount(287000)).toBe(287000);
    expect(PaymentService.resolveSubscriptionAmount(PaymentService.ANNUAL_SUBSCRIPTION_AMOUNT)).toBe(
      PaymentService.ANNUAL_SUBSCRIPTION_AMOUNT
    );
  });

  it('falls back to the monthly amount for any other client-supplied value', () => {
    expect(PaymentService.resolveSubscriptionAmount(1)).toBe(29900);
    expect(PaymentService.resolveSubscriptionAmount(0)).toBe(29900);
    expect(PaymentService.resolveSubscriptionAmount(-500)).toBe(29900);
    expect(PaymentService.resolveSubscriptionAmount(Number.NaN)).toBe(29900);
    expect(PaymentService.resolveSubscriptionAmount(undefined)).toBe(29900);
    // A tampered client could send a numeric string from the JSON body; the
    // strict whitelist rejects it just like the previous includes() check.
    expect(PaymentService.resolveSubscriptionAmount('29900' as unknown as number)).toBe(29900);
  });

  it('keeps the accepted amounts in sync with the published price constants', () => {
    expect(PaymentService.SUBSCRIPTION_AMOUNT).toBe(PREMIUM_PRICE * 100);
    expect(PaymentService.ANNUAL_SUBSCRIPTION_AMOUNT).toBe(ANNUAL_PREMIUM_PRICE * 100);
  });
});

describe('PaymentService.verifySubscriptionPayment', () => {
  const fetchMock = vi.fn();

  const razorpayPayment = (overrides: Record<string, unknown> = {}) => ({
    id: 'pay_sub_1',
    order_id: 'order_sub_1',
    amount: PaymentService.SUBSCRIPTION_AMOUNT,
    currency: 'INR',
    status: 'captured',
    ...overrides,
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a captured payment of exactly the expected amount for the signed order', async () => {
    fetchMock.mockResolvedValue({ json: async () => razorpayPayment() });
    const ok = await PaymentService.verifySubscriptionPayment(
      'order_sub_1',
      'pay_sub_1',
      signatureFor('order_sub_1', 'pay_sub_1'),
      PaymentService.SUBSCRIPTION_AMOUNT
    );
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/payments/pay_sub_1',
      expect.any(Object)
    );
  });

  it('rejects a ₹9 instant payment replayed as a subscription payment (the pricing bypass)', async () => {
    // Attacker pays ₹9 via the instant flow, then reuses those IDs here.
    fetchMock.mockResolvedValue({
      json: async () =>
        razorpayPayment({ id: 'pay_inst_1', order_id: 'order_inst_1', amount: 900 }),
    });
    const ok = await PaymentService.verifySubscriptionPayment(
      'order_inst_1',
      'pay_inst_1',
      signatureFor('order_inst_1', 'pay_inst_1'),
      PaymentService.SUBSCRIPTION_AMOUNT
    );
    expect(ok).toBe(false);
  });

  it('rejects a payment that belongs to a different order than the one in the signature', async () => {
    fetchMock.mockResolvedValue({
      json: async () => razorpayPayment({ order_id: 'order_someone_else' }),
    });
    const ok = await PaymentService.verifySubscriptionPayment(
      'order_sub_1',
      'pay_sub_1',
      signatureFor('order_sub_1', 'pay_sub_1'),
      PaymentService.SUBSCRIPTION_AMOUNT
    );
    expect(ok).toBe(false);
  });

  it('rejects payments that were not actually captured', async () => {
    for (const status of ['created', 'authorized', 'failed', 'refunded']) {
      fetchMock.mockResolvedValue({
        json: async () => razorpayPayment({ status }),
      });
      const ok = await PaymentService.verifySubscriptionPayment(
        'order_sub_1',
        'pay_sub_1',
        signatureFor('order_sub_1', 'pay_sub_1'),
        PaymentService.SUBSCRIPTION_AMOUNT
      );
      expect(ok).toBe(false);
    }
  });

  it('rejects an invalid signature without ever calling the Razorpay API', async () => {
    const ok = await PaymentService.verifySubscriptionPayment(
      'order_sub_1',
      'pay_sub_1',
      'forged-signature',
      PaymentService.SUBSCRIPTION_AMOUNT
    );
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the Razorpay API errors', async () => {
    fetchMock.mockRejectedValue(new Error('razorpay down'));
    const ok = await PaymentService.verifySubscriptionPayment(
      'order_sub_1',
      'pay_sub_1',
      signatureFor('order_sub_1', 'pay_sub_1'),
      PaymentService.SUBSCRIPTION_AMOUNT
    );
    expect(ok).toBe(false);
  });
});

describe('PaymentService.verifyInstantDownloadPayment', () => {
  const fetchMock = vi.fn();

  const razorpayPayment = (overrides: Record<string, unknown> = {}) => ({
    id: 'pay_inst_1',
    order_id: 'order_inst_1',
    amount: PaymentService.MIN_INSTANT_AMOUNT,
    currency: 'INR',
    status: 'captured',
    ...overrides,
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a captured ₹9 payment for the signed order', async () => {
    fetchMock.mockResolvedValue({ json: async () => razorpayPayment() });
    const ok = await PaymentService.verifyInstantDownloadPayment(
      'order_inst_1',
      'pay_inst_1',
      signatureFor('order_inst_1', 'pay_inst_1')
    );
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/payments/pay_inst_1',
      expect.any(Object)
    );
  });

  it('rejects a ₹1 payment presented as a ₹9 instant purchase', async () => {
    fetchMock.mockResolvedValue({
      json: async () => razorpayPayment({ amount: 100 }),
    });
    const ok = await PaymentService.verifyInstantDownloadPayment(
      'order_inst_1',
      'pay_inst_1',
      signatureFor('order_inst_1', 'pay_inst_1')
    );
    expect(ok).toBe(false);
  });

  it('rejects a subscription payment replayed as an instant download', async () => {
    fetchMock.mockResolvedValue({
      json: async () =>
        razorpayPayment({ id: 'pay_sub_1', order_id: 'order_sub_1', amount: PaymentService.SUBSCRIPTION_AMOUNT }),
    });
    const ok = await PaymentService.verifyInstantDownloadPayment(
      'order_sub_1',
      'pay_sub_1',
      signatureFor('order_sub_1', 'pay_sub_1')
    );
    expect(ok).toBe(false);
  });

  it('rejects payments that were not actually captured', async () => {
    for (const status of ['created', 'authorized', 'failed', 'refunded']) {
      fetchMock.mockResolvedValue({
        json: async () => razorpayPayment({ status }),
      });
      const ok = await PaymentService.verifyInstantDownloadPayment(
        'order_inst_1',
        'pay_inst_1',
        signatureFor('order_inst_1', 'pay_inst_1')
      );
      expect(ok).toBe(false);
    }
  });

  it('rejects an invalid signature without ever calling the Razorpay API', async () => {
    const ok = await PaymentService.verifyInstantDownloadPayment(
      'order_inst_1',
      'pay_inst_1',
      'forged-signature'
    );
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the Razorpay API errors', async () => {
    fetchMock.mockRejectedValue(new Error('razorpay down'));
    const ok = await PaymentService.verifyInstantDownloadPayment(
      'order_inst_1',
      'pay_inst_1',
      signatureFor('order_inst_1', 'pay_inst_1')
    );
    expect(ok).toBe(false);
  });
});
