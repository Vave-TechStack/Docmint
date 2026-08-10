import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PaymentService } from '@/lib/payment/razorpay';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const status = searchParams.get('status') || '';
    const plan = searchParams.get('plan') || '';
    const search = searchParams.get('search') || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' as const } } },
        { user: { email: { contains: search, mode: 'insensitive' as const } } },
        { organization: { name: { contains: search, mode: 'insensitive' as const } } },
      ];
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          organization: { select: { id: true, name: true, slug: true } },
          payments: {
            select: { id: true, amount: true, status: true, paymentType: true, createdAt: true, razorpayPaymentId: true, refundId: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          _count: { select: { payments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.subscription.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: subscriptions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Admin subscriptions error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subscriptionId, action, plan: newPlan, refundPaymentId, refundAmount, refundReason } = body;

    if (!subscriptionId || !action) {
      return NextResponse.json({ success: false, error: 'Missing subscriptionId or action' }, { status: 400 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { payments: { where: { status: 'SUCCESS' }, take: 1, orderBy: { createdAt: 'desc' } } },
    });

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'Subscription not found' }, { status: 404 });
    }

    switch (action) {
      case 'cancel': {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { status: 'CANCELLED', autoRenew: false, cancelledAt: new Date() },
        });
        await prisma.auditLog.create({
          data: {
            organizationId: session.user.organizationId ?? '',
            userId: session.user.id,
            action: 'SUBSCRIPTION_CANCELLED',
            entity: 'Subscription',
            entityId: subscriptionId,
            description: `Subscription ${subscriptionId} cancelled by admin`,
          },
        });
        break;
      }
      case 'activate': {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 30);
        const graceEndDate = new Date(endDate);
        graceEndDate.setDate(graceEndDate.getDate() + 7);

        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'ACTIVE',
            startDate: now,
            endDate,
            graceEndDate,
            autoRenew: true,
            cancelledAt: null,
          },
        });
        break;
      }
      case 'change_plan': {
        if (!newPlan) return NextResponse.json({ success: false, error: 'Plan is required' }, { status: 400 });
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { plan: newPlan },
        });
        break;
      }
      case 'refund': {
        if (!refundPaymentId) {
          return NextResponse.json({ success: false, error: 'Payment ID required for refund' }, { status: 400 });
        }

        const payment = await prisma.payment.findFirst({
          where: { id: refundPaymentId, subscriptionId },
        });

        if (!payment || !payment.razorpayPaymentId) {
          return NextResponse.json({ success: false, error: 'Payment not found or no Razorpay ID' }, { status: 404 });
        }

        if (payment.status === 'REFUNDED') {
          return NextResponse.json({ success: false, error: 'Payment already refunded' }, { status: 400 });
        }

        try {
          const refundResult = await PaymentService.processRefund(
            payment.razorpayPaymentId,
            refundAmount || undefined
          );

          await prisma.payment.update({
            where: { id: refundPaymentId },
            data: {
              status: 'REFUNDED',
              refundId: refundResult.id,
              refundAmount: refundAmount || payment.amount,
              refundReason: refundReason || 'Refunded by admin',
            },
          });

          // Cancel the subscription after refund
          await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { status: 'CANCELLED', autoRenew: false, cancelledAt: new Date() },
          });
        } catch (refundError) {
          console.error('Refund processing failed:', refundError);
          return NextResponse.json({ success: false, error: 'Refund processing failed' }, { status: 500 });
        }
        break;
      }
      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Subscription ${action} successful` });
  } catch (error) {
    console.error('Admin subscription action error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process action' }, { status: 500 });
  }
}
