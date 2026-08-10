import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { POST } from './route';
import { auth } from '@/lib/auth';
import { PaymentService } from '@/lib/payment/razorpay';
import type { RazorpayOrderResponse } from '@/types';

// NextAuth types `auth` as a middleware wrapper; the route only uses its
// resolved session, so cast the mock to that shape.
type AuthResult = Promise<{ user: { name: string } } | null>;
const authMock = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn<() => AuthResult>>;

const FAKE_ORDER: RazorpayOrderResponse = {
  id: 'order_rzp_test',
  amount: 900,
  currency: 'INR',
  key: 'rzp_test_key',
};

function post(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/payments/create-order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request);
}

describe('POST /api/payments/create-order', () => {
  beforeEach(() => {
    // Restore any prior spy so call history cannot leak between tests, then
    // re-spy with a fresh implementation.
    vi.restoreAllMocks();
    authMock.mockResolvedValue(null); // default: no session
    vi.spyOn(PaymentService, 'createOrder').mockResolvedValue(FAKE_ORDER);
  });

  describe('instant downloads', () => {
    it('creates a 900-paise (₹9) order even when the client sends a tampered low amount', async () => {
      const res = await post({ type: 'instant', amount: 1 });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual(FAKE_ORDER);
      expect(PaymentService.createOrder).toHaveBeenCalledWith(
        900,
        expect.stringMatching(/^inst_\d+$/)
      );
    });

    it('falls back to 900 paise when no amount is supplied', async () => {
      const res = await post({ type: 'instant' });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(PaymentService.createOrder).toHaveBeenCalledWith(
        900,
        expect.stringMatching(/^inst_\d+$/)
      );
    });

    it('passes an at-or-above-minimum amount through unchanged', async () => {
      const res = await post({ type: 'instant', amount: 1500 });
      expect(res.status).toBe(200);
      expect(PaymentService.createOrder).toHaveBeenCalledWith(
        1500,
        expect.stringMatching(/^inst_\d+$/)
      );
    });

    it('does not require a session', async () => {
      await post({ type: 'instant', amount: 900 });
      expect(authMock).not.toHaveBeenCalled();
    });
  });

  describe('subscriptions', () => {
    it('rejects with 401 when unauthenticated', async () => {
      authMock.mockResolvedValue(null);
      const res = await post({ type: 'subscription', amount: 29900 });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ success: false, error: 'Unauthorized' });
      expect(PaymentService.createOrder).not.toHaveBeenCalled();
    });

    it('creates a monthly order for an authenticated user', async () => {
      authMock.mockResolvedValue({ user: { name: 'Test User' } });
      const res = await post({ type: 'subscription', amount: 29900 });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(PaymentService.createOrder).toHaveBeenCalledWith(
        29900,
        expect.stringMatching(/^sub_\d+$/)
      );
    });

    it('creates an annual order for an authenticated user', async () => {
      authMock.mockResolvedValue({ user: { name: 'Test User' } });
      const res = await post({ type: 'subscription', amount: 287000 });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(PaymentService.createOrder).toHaveBeenCalledWith(
        287000,
        expect.stringMatching(/^sub_\d+$/)
      );
    });

    it('falls back to the monthly amount for a non-published client amount', async () => {
      authMock.mockResolvedValue({ user: { name: 'Test User' } });
      const res = await post({ type: 'subscription', amount: 1000 });
      expect(res.status).toBe(200);
      expect(PaymentService.createOrder).toHaveBeenCalledWith(
        29900,
        expect.stringMatching(/^sub_\d+$/)
      );
    });
  });

  it('rejects unknown payment types with 400', async () => {
    const res = await post({ type: 'coupon' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Invalid payment type' });
    expect(PaymentService.createOrder).not.toHaveBeenCalled();
  });

  it('returns 500 when Razorpay order creation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // silence the logged error
    vi.spyOn(PaymentService, 'createOrder').mockRejectedValue(new Error('razorpay down'));
    const res = await post({ type: 'instant', amount: 900 });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Failed to create payment order' });
  });
});
