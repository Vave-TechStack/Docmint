import type { RazorpayOrderResponse } from '@/types';
import { INSTANT_DOWNLOAD_PRICE } from '@/lib/utils/constants';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID!;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;

/**
 * DocMint Payment Service
 * Handles Razorpay orders, payments, subscriptions, and refunds.
 */
export class PaymentService {
  // Minimum amount for instant download in paise. Derived from the INR price
  // constant so the server-side floor can never drift from the published price.
  static readonly MIN_INSTANT_AMOUNT = INSTANT_DOWNLOAD_PRICE * 100;
  static readonly SUBSCRIPTION_AMOUNT = 29900; // ₹299 in paise (monthly)
  static readonly ANNUAL_SUBSCRIPTION_AMOUNT = 287000; // ₹2,870 in paise (annual, 20% off)

  private static getAuthHeaders(): Record<string, string> {
    const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    return {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Resolve the actual order amount (in paise) for an instant download.
   * Pure and server-side: never trusts the client. Falls back to the
   * configured price (INR → paise) when nothing is supplied, then clamps to
   * the minimum so the order can never be below the published price.
   */
  static resolveInstantAmount(clientAmount?: number): number {
    const fallback = INSTANT_DOWNLOAD_PRICE * 100;
    const requested = clientAmount || fallback;
    return Math.max(requested, this.MIN_INSTANT_AMOUNT);
  }

  /**
   * Create a Razorpay order for instant download
   * Amount is validated server-side
   */
  static async createOrder(amount: number, receipt: string): Promise<RazorpayOrderResponse> {
    // Server-side amount validation
    const validatedAmount = Math.max(amount, this.MIN_INSTANT_AMOUNT);

    try {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          amount: validatedAmount, // Already in paise, validated server-side
          currency: 'INR',
          receipt,
          payment_capture: 1,
        }),
      });

      const data = await response.json();

      return {
        id: data.id,
        amount: data.amount,
        currency: data.currency,
        key: RAZORPAY_KEY_ID,
      };
    } catch (error) {
      console.error('Razorpay order creation failed:', error);
      throw new Error('Failed to create payment order');
    }
  }

  /**
   * Create a subscription order
   */
  static async createSubscription(
    planId: string,
    customerEmail: string,
    customerPhone?: string
  ): Promise<{ id: string; short_url: string }> {
    try {
      const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          plan_id: planId,
          customer_notify: 1,
          quantity: 1,
          total_count: 12,
          expire_by: Math.floor(Date.now() / 1000) + 86400, // 24 hours
          notes: {
            email: customerEmail,
            phone: customerPhone || '',
          },
        }),
      });

      const data = await response.json();
      return { id: data.id, short_url: data.short_url };
    } catch (error) {
      console.error('Razorpay subscription creation failed:', error);
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Verify Razorpay payment signature
   * Uses ESM import pattern for compatibility with Next.js App Router
   */
  static async verifyPaymentAsync(
    orderId: string,
    paymentId: string,
    signature: string
  ): Promise<boolean> {
    const { createHmac } = await import('crypto');
    const expectedSignature = createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return expectedSignature === signature;
  }

  /**
   * Process refund
   */
  static async processRefund(
    paymentId: string,
    amount?: number
  ): Promise<{ id: string; status: string }> {
    try {
      const response = await fetch(
        `https://api.razorpay.com/v1/payments/${paymentId}/refund`,
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: amount ? JSON.stringify({ amount: amount * 100 }) : undefined,
        }
      );

      const data = await response.json();
      return { id: data.id, status: data.status };
    } catch (error) {
      console.error('Razorpay refund failed:', error);
      throw new Error('Failed to process refund');
    }
  }

  /**
   * Fetch payment details
   */
  static async getPayment(paymentId: string): Promise<Record<string, unknown>> {
    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${paymentId}`,
      { headers: this.getAuthHeaders() }
    );
    return response.json();
  }

  /**
   * Fetch all payments with filters
   */
  static async listPayments(options: {
    from?: string;
    to?: string;
    count?: number;
    skip?: number;
  } = {}): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams();
    if (options.from) params.set('from', options.from);
    if (options.to) params.set('to', options.to);
    if (options.count) params.set('count', options.count.toString());
    if (options.skip) params.set('skip', options.skip.toString());

    const response = await fetch(
      `https://api.razorpay.com/v1/payments?${params.toString()}`,
      { headers: this.getAuthHeaders() }
    );
    const data = await response.json();
    return data.items || [];
  }
}
