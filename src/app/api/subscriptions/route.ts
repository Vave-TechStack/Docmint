import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PaymentService } from '@/lib/payment/razorpay';
import { SUBSCRIPTION_DURATION_DAYS, GRACE_PERIOD_DAYS, ANNUAL_PREMIUM_PRICE } from '@/lib/utils/constants';
import { EmailService } from '@/lib/email/email-service';

/**
 * PATCH — Cancel or Renew a subscription
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, razorpayPaymentId, razorpayOrderId, razorpaySignature } = body;

    if (!action || !['cancel', 'renew'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "cancel" or "renew".' },
        { status: 400 }
      );
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        organizationId: session.user.organizationId!,
        status: { in: ['ACTIVE', 'GRACE_PERIOD', 'CANCELLED', 'EXPIRED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'No subscription found' },
        { status: 404 }
      );
    }

    if (action === 'cancel') {
      if (subscription.status !== 'ACTIVE') {
        return NextResponse.json(
          { success: false, error: 'Only active subscriptions can be cancelled' },
          { status: 400 }
        );
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELLED',
          autoRenew: false,
          cancelledAt: new Date(),
        },
      });

      await EmailService.send({
        to: session.user.email!,
        subject: 'DocMint - Subscription Cancelled',
        html: `<p>Your DocMint Premium subscription has been cancelled.</p>
               <p>You will continue to have access until <strong>${subscription.endDate.toLocaleDateString()}</strong>.</p>`,
      });

      await prisma.auditLog.create({
        data: {
          organizationId: session.user.organizationId!,
          userId: session.user.id,
          action: 'SUBSCRIPTION_CANCELLED',
          entity: 'Subscription',
          entityId: subscription.id,
          description: 'Premium subscription cancelled by user',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Subscription cancelled successfully',
      });
    }

    if (action === 'renew') {
      // For renewal via payment (from Razorpay checkout), verify the payment
      // end-to-end: HMAC signature + Razorpay API cross-check that it was
      // captured at the monthly amount (same anti-replay guarantee as new
      // subscriptions — a cheaper payment can't renew a subscription).
      if (razorpayPaymentId && razorpayOrderId && razorpaySignature) {
        const isValid = await PaymentService.verifySubscriptionPayment(
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          PaymentService.SUBSCRIPTION_AMOUNT
        );
        if (!isValid) {
          return NextResponse.json(
            { success: false, error: 'Payment verification failed' },
            { status: 400 }
          );
        }
      } else {
        // No payment provided — only allow admins to trigger free renewals
        if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
          return NextResponse.json(
            { success: false, error: 'Payment required for renewal. Please make a payment first.' },
            { status: 402 }
          );
        }
      }

      // Extend subscription
      const now = new Date();
      const newEndDate = new Date(now);
      newEndDate.setDate(newEndDate.getDate() + SUBSCRIPTION_DURATION_DAYS);

      const newGraceEndDate = new Date(newEndDate);
      newGraceEndDate.setDate(newGraceEndDate.getDate() + GRACE_PERIOD_DAYS);

      await prisma.$transaction(async (tx) => {
        // Update org plan
        await tx.organization.update({
          where: { id: session.user.organizationId! },
          data: { plan: 'PREMIUM' },
        });

        // Update subscription
        const updated = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            startDate: now,
            endDate: newEndDate,
            graceEndDate: newGraceEndDate,
            autoRenew: true,
            cancelledAt: null,
          },
        });

        // Record RENEWAL payment for accounting
        await tx.payment.create({
          data: {
            organizationId: session.user.organizationId!,
            userId: session.user.id,
            subscriptionId: subscription.id,
            razorpayOrderId: razorpayOrderId || null,
            razorpayPaymentId: razorpayPaymentId || null,
            razorpaySignature: razorpaySignature || null,
            amount: PaymentService.SUBSCRIPTION_AMOUNT,
            currency: 'INR',
            status: razorpayPaymentId ? 'SUCCESS' : 'PENDING',
            paymentType: 'RENEWAL',
            description: 'Premium Plan Renewal - 30 Days',
          },
        });

        return updated;
      });

      await EmailService.send({
        to: session.user.email!,
        subject: 'DocMint - Subscription Renewed',
        html: `<p>Your DocMint Premium subscription has been renewed!</p>
               <p>Your plan is now active until <strong>${newEndDate.toLocaleDateString()}</strong>.</p>`,
      });

      await prisma.auditLog.create({
        data: {
          organizationId: session.user.organizationId!,
          userId: session.user.id,
          action: 'SUBSCRIPTION_RENEWED',
          entity: 'Subscription',
          entityId: subscription.id,
          description: 'Premium subscription renewed',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Subscription renewed successfully',
        data: { endDate: newEndDate, graceEndDate: newGraceEndDate },
      });
    }
  } catch (error) {
    console.error('Subscription action error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process subscription action' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Try active/grace first
    let subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: session.user.organizationId!,
        userId: session.user.id,
        status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    // If no active sub, return the most recent expired/cancelled one (for history view)
    if (!subscription) {
      subscription = await prisma.subscription.findFirst({
        where: {
          organizationId: session.user.organizationId!,
          userId: session.user.id,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json({ success: true, data: subscription });
  } catch (error) {
    console.error('Subscription fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, planType } = body;

    // Determine if annual billing
    const isAnnual = planType === 'annual';
    const subscriptionAmount = isAnnual ? PaymentService.ANNUAL_SUBSCRIPTION_AMOUNT : PaymentService.SUBSCRIPTION_AMOUNT;
    const durationDays = isAnnual ? 365 : SUBSCRIPTION_DURATION_DAYS;
    const displayPrice = isAnnual ? ANNUAL_PREMIUM_PRICE : 299;
    const descriptionText = isAnnual ? 'Premium Plan - 1 Year' : 'Premium Plan - 30 Days';

    // Check if user already has an active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
      },
    });

    if (existingSubscription) {
      return NextResponse.json(
        { success: false, error: 'You already have an active subscription' },
        { status: 409 }
      );
    }

    // Verify payment end-to-end: HMAC signature + Razorpay API cross-check
    // that the payment was captured at exactly the subscription amount. This
    // is what stops a ₹9 instant payment from being replayed to activate a
    // full Premium subscription.
    const isValid = await PaymentService.verifySubscriptionPayment(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      subscriptionAmount
    );

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Payment verification failed' },
        { status: 400 }
      );
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const graceEndDate = new Date(endDate);
    graceEndDate.setDate(graceEndDate.getDate() + GRACE_PERIOD_DAYS);

    // Create subscription and payment in transaction
    const result = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          organizationId: session.user.organizationId!,
          userId: session.user.id,
          plan: 'PREMIUM',
          status: 'ACTIVE',
          amount: subscriptionAmount,
          currency: 'INR',
          startDate,
          endDate,
          graceEndDate,
          autoRenew: true,
          metadata: {
            billingPeriod: isAnnual ? 'ANNUAL' : 'MONTHLY',
            durationDays,
          },
        },
      });

      await tx.payment.create({
        data: {
          organizationId: session.user.organizationId!,
          userId: session.user.id,
          subscriptionId: subscription.id,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          amount: subscriptionAmount,
          currency: 'INR',
          status: 'SUCCESS',
          paymentType: 'SUBSCRIPTION',
          description: descriptionText,
        },
      });

      return subscription;
    });

    // Send confirmation email
    await EmailService.sendSubscriptionEmail(
      session.user.email!,
      'Premium',
      displayPrice,
      endDate.toLocaleDateString()
    );

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully',
      data: result,
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
