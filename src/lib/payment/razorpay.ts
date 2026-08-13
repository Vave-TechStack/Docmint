import type { RazorpayOrderResponse } from '@/types';
import {
  INSTANT_DOWNLOAD_PRICE,
  PREMIUM_PRICE,
  ANNUAL_PREMIUM_PRICE,
} from '@/lib/utils/constants';

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
  // Subscription amounts in paise, derived from the INR price constants so the
  // accepted values can never drift from the published prices.
  static readonly SUBSCRIPTION_AMOUNT = PREMIUM_PRICE * 100; // ₹299/mo
  static readonly ANNUAL_SUBSCRIPTION_AMOUNT = ANNUAL_PREMIUM_PRICE * 100; // ₹2,870/yr

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
   * Resolve the actual order amount (in paise) for a subscription.
   * Pure and server-side: never trusts the client. Only the exact published
   * monthly (₹299) and annual (₹2,870) amounts are accepted; anything else
   * falls back to the monthly amount so the client cannot force a custom price.
   */
  static resolveSubscriptionAmount(clientAmount?: number): number {
    if (
      clientAmount === this.SUBSCRIPTION_AMOUNT ||
      clientAmount === this.ANNUAL_SUBSCRIPTION_AMOUNT
    ) {
      return clientAmount;
    }
    return this.SUBSCRIPTION_AMOUNT;
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
   * Verify a subscription payment end-to-end against the Razorpay API.
   *
   * The HMAC signature (verifyPaymentAsync) only proves the client holds a
   * payment ID for an order — it cannot prove how much was actually paid.
   * That lets a ₹9 instant-download payment be replayed here to activate (or
   * renew) a full Premium subscription. So on top of the signature we
   * cross-check the payment with Razorpay:
   *
   *   1. the payment must belong to the order named in the signature,
   *   2. the payment must actually have moved money (status 'captured' —
   *      orders are created with payment_capture: 1, so a successful checkout
   *      is always captured; anything less permissive is refused), and
   *   3. the paid amount must be exactly the expected subscription amount
   *      (paise), so a cheaper order/payment can never be replayed.
   *
   * Fails closed: any API error, missing data, or mismatch returns false.
   */
  static async verifySubscriptionPayment(
    orderId: string,
    paymentId: string,
    signature: string,
    expectedAmount: number
  ): Promise<boolean> {
    // 1. Existing HMAC signature check over `${orderId}|${paymentId}`.
    let signatureValid: boolean;
    try {
      signatureValid = await this.verifyPaymentAsync(orderId, paymentId, signature);
    } catch (error) {
      console.error('Subscription payment signature verification failed:', error);
      return false;
    }
    if (!signatureValid) return false;

    // 2. Cross-check the payment with the Razorpay API.
    let payment: Record<string, unknown>;
    try {
      payment = await this.getPayment(paymentId);
    } catch (error) {
      console.error('Subscription payment verification failed:', error);
      return false;
    }

    // 3. The payment must belong to the order named in the signature.
    if (payment.order_id !== orderId) return false;

    // 4. Money must have actually moved — captured only (see doc comment).
    if (payment.status !== 'captured') return false;

    // 5. The paid amount must be exactly the expected subscription amount.
    if (payment.amount !== expectedAmount) return false;

    return true;
  }

  /**
   * Verify an instant-download (₹9) payment end-to-end against the Razorpay
   * API — the same hardening as verifySubscriptionPayment.
   *
   * The bare HMAC (verifyPaymentAsync) only proves the client holds a payment
   * ID for an order; it cannot prove money moved or how much was paid. That
   * lets a failed/cheaper payment be presented as a valid ₹9 purchase, and
   * lets one payment be replayed for unlimited downloads. So on top of the
   * signature we require, via the Razorpay API:
   *
   *   1. the payment belongs to the order named in the signature,
   *   2. the payment was actually captured (money moved), and
   *   3. the paid amount is exactly the ₹9 instant price.
   *
   * Replay protection (one payment = one download) is handled by the caller
   * marking the payment consumed (Payment.usedAt).
   */
  static async verifyInstantDownloadPayment(
    orderId: string,
    paymentId: string,
    signature: string
  ): Promise<boolean> {
    // 1. Existing HMAC signature check over `${orderId}|${paymentId}`.
    let signatureValid: boolean;
    try {
      signatureValid = await this.verifyPaymentAsync(orderId, paymentId, signature);
    } catch (error) {
      console.error('Instant payment signature verification failed:', error);
      return false;
    }
    if (!signatureValid) return false;

    // 2. Cross-check the payment with the Razorpay API.
    let payment: Record<string, unknown>;
    try {
      payment = await this.getPayment(paymentId);
    } catch (error) {
      console.error('Instant payment verification failed:', error);
      return false;
    }

    // 3. The payment must belong to the order named in the signature.
    if (payment.order_id !== orderId) return false;

    // 4. Money must have actually moved — captured only.
    if (payment.status !== 'captured') return false;

    // 5. The paid amount must be exactly the ₹9 instant price.
    if (payment.amount !== this.MIN_INSTANT_AMOUNT) return false;

    return true;
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
