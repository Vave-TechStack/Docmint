import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PaymentService } from '@/lib/payment/razorpay';
import { INSTANT_DOWNLOAD_PRICE } from '@/lib/utils/constants';

export async function POST(request: NextRequest) {
  try {
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
      // Allow both monthly (₹299) and annual (₹2,870) amounts
      const validAmounts = [PaymentService.SUBSCRIPTION_AMOUNT, PaymentService.ANNUAL_SUBSCRIPTION_AMOUNT];
      orderAmount = validAmounts.includes(amount) ? amount : PaymentService.SUBSCRIPTION_AMOUNT;
      receipt = `sub_${Date.now()}`;
    } else if (type === 'instant') {
      // Enforce minimum amount server-side
      const clientAmount = amount || INSTANT_DOWNLOAD_PRICE;
      orderAmount = Math.max(clientAmount, PaymentService.MIN_INSTANT_AMOUNT);
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
