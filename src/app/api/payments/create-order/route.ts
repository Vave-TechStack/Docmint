import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PaymentService } from '@/lib/payment/razorpay';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Abuse guard: each order is a real Razorpay API call.
    const ip = getClientIp(request);
    if (!checkRateLimit(`create-order:${ip}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many order requests. Please slow down.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { type, amount } = body;

    // For subscription payments, require auth
    if (type === 'subscription') {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Determine amount (server-side validation, never trust client)
    let orderAmount: number;
    let receipt: string;

    if (type === 'subscription') {
      // Server-side: only the published monthly (₹299) and annual (₹2,870)
      // amounts are accepted; anything else falls back to monthly.
      orderAmount = PaymentService.resolveSubscriptionAmount(amount);
      receipt = `sub_${Date.now()}`;
    } else if (type === 'instant') {
      // Server-side: fallback to the published price and clamp to the minimum
      // (both in paise) so the client can never force a lower amount.
      orderAmount = PaymentService.resolveInstantAmount(amount);
      receipt = `inst_${Date.now()}`;
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid payment type' },
        { status: 400 }
      );
    }

    // Create Razorpay order with server-validated amount
    const order = await PaymentService.createOrder(orderAmount, receipt);

    return NextResponse.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create payment order' },
      { status: 500 }
    );
  }
}
