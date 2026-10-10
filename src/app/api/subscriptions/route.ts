import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentService } from '@/lib/payment/razorpay';
import { SUBSCRIPTION_DURATION_DAYS, GRACE_PERIOD_DAYS, ANNUAL_PREMIUM_PRICE } from '@/lib/utils/constants';
import { EmailService } from '@/lib/email/email-service';
import { requireUserScope } from '@/lib/security/authorization';
import { assertSameOrigin, readJsonBody, isPlainObject, cleanString, ValidationError } from '@/lib/security/request';

/**
 * PATCH — Cancel or Renew a subscription
 */
export async function PATCH(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    if (!isPlainObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const action = cleanString(body.action, 20);
    if (action !== 'cancel' && action !== 'renew') {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "cancel" or "renew".' },
        { status: 400 }
      );
    }

    const razorpayPaymentId = cleanString(body.razorpayPaymentId, 100);
    const razorpayOrderId = cleanString(body.razorpayOrderId, 100);
    const razorpaySignature = cleanString(body.razorpaySignature, 200);

    // All three parts of a Razorpay checkout callback are required together;
    // a partial triplet is never legitimate and is rejected by the
    // "Incomplete payment details" branch in the renew path below.
    if (body.razorpayPaymentId !== undefined || body.razorpayOrderId !== undefined || body.razorpaySignature !== undefined) {
      if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        return NextResponse.json(
          { success: false, error: 'Incomplete payment details' },
          { status: 400 }
        );
      }
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: scope.userId,
        organizationId: scope.organizationId,
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

    // `email` is nullable on the user row. Resolve it once and fail loudly if it
    // is genuinely absent rather than asserting non-null (`!`) and mailing
    // "undefined" to a subscriber.
    const accountEmail = cleanString(scope.guard.user.email, 200, { required: true });

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
        to: accountEmail,
        subject: 'DocMint - Subscription Cancelled',
        html: `<p>Your DocMint Premium subscription has been cancelled.</p>
               <p>You will continue to have access until <strong>${subscription.endDate.toLocaleDateString()}</strong>.</p>`,
      });

      await prisma.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          userId: scope.userId,
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

    // action === 'renew'
    //
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
      // No payment provided at all — only allow admins to trigger free renewals.
      // `isAdmin` reflects the revalidated database role, not the JWT claim, so
      // a demoted admin cannot use a stale token to renew for free.
      if (!scope.guard.isAdmin) {
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
        where: { id: scope.organizationId },
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
          organizationId: scope.organizationId,
          userId: scope.userId,
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
      to: accountEmail,
      subject: 'DocMint - Subscription Renewed',
      html: `<p>Your DocMint Premium subscription has been renewed!</p>
             <p>Your plan is now active until <strong>${newEndDate.toLocaleDateString()}</strong>.</p>`,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        userId: scope.userId,
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
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Subscription action error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process subscription action' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  try {
    // Try active/grace first
    let subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    // If no active sub, return the most recent expired/cancelled one (for history view)
    if (!subscription) {
      subscription = await prisma.subscription.findFirst({
        where: {
          organizationId: scope.organizationId,
          userId: scope.userId,
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
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    if (!isPlainObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // All three Razorpay callback fields are mandatory for a new subscription.
    const razorpayPaymentId = cleanString(body.razorpayPaymentId, 100, { required: true });
    const razorpayOrderId = cleanString(body.razorpayOrderId, 100, { required: true });
    const razorpaySignature = cleanString(body.razorpaySignature, 200, { required: true });

    // Determine if annual billing. `planType` selects the amount that is then
    // verified against the amount Razorpay actually captured, so it cannot be
    // used to buy a year for the price of a month.
    const isAnnual = cleanString(body.planType, 20).toLowerCase() === 'annual';
    const subscriptionAmount = isAnnual ? PaymentService.ANNUAL_SUBSCRIPTION_AMOUNT : PaymentService.SUBSCRIPTION_AMOUNT;
    const durationDays = isAnnual ? 365 : SUBSCRIPTION_DURATION_DAYS;
    const displayPrice = isAnnual ? ANNUAL_PREMIUM_PRICE : 299;
    const descriptionText = isAnnual ? 'Premium Plan - 1 Year' : 'Premium Plan - 30 Days';

    // Check if this ORGANIZATION already has an active subscription.
    //
    // The check is scoped by `organizationId` as well as `userId`. A user can
    // belong to more than one organization, so keying on the user alone let the
    // same payment activate Premium across every org the user belongs to.
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: scope.userId,
        organizationId: scope.organizationId,
        status: 'ACTIVE',
      },
    });

    if (existingSubscription) {
      return NextResponse.json(
        { success: false, error: 'You already have an active subscription' },
        { status: 409 }
      );
    }

    // Replay guard: a Razorpay payment id is single-use. The subscription
    // activation below runs in a transaction, but nothing until that point
    // stops the same captured payment from being submitted twice, which would
    // mint a second subscription. Claim the payment id atomically first.
    const claimedPayment = await prisma.payment.findFirst({
      where: { razorpayPaymentId },
      select: { id: true, status: true, subscriptionId: true },
    });
    if (claimedPayment?.subscriptionId) {
      return NextResponse.json(
        { success: false, error: 'This payment has already been used' },
        { status: 409 }
      );
    }

    // Verify payment end-to-end: HMAC signature + Razorpay API cross-check
    // that the payment was captured at exactly the subscription amount. This
    // is what stops a ₹9 instant payment from being replayed here to activate
    // (or renew) a full Premium subscription.
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
          organizationId: scope.organizationId,
          userId: scope.userId,
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
          organizationId: scope.organizationId,
          userId: scope.userId,
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
      cleanString(scope.guard.user.email, 200, { required: true }),
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
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Subscription creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
