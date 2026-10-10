import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentService } from '@/lib/payment/razorpay';
import { requireAdmin, scopeWhere, type Guard } from '@/lib/security/authorization';
import { randomToken } from '@/lib/security/crypto';
import {
  assertSameOrigin,
  parsePagination,
  readJsonBody,
  enumValue,
  boundedInt,
  cleanString,
  ValidationError,
} from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const PLAN_TYPES = ['FREE', 'PREMIUM', 'ENTERPRISE'] as const;
const SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
  'GRACE_PERIOD',
  'SUSPENDED',
] as const;
const ACTIONS = ['cancel', 'activate', 'change_plan', 'refund'] as const;

type Action = (typeof ACTIONS)[number];

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePagination(searchParams, 20);
    const status = enumValue(searchParams.get('status') ?? '', SUBSCRIPTION_STATUSES);
    const plan = enumValue(searchParams.get('plan') ?? '', PLAN_TYPES);
    const search = cleanString(searchParams.get('search'), 120);

    const where = scopeWhere(guard.guard, {} as Record<string, unknown>);
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
        skip,
        take,
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
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const subscriptionId = cleanString(body.subscriptionId, 64, { required: true });
    const action = enumValue(body.action, ACTIONS) as Action | undefined;
    if (!subscriptionId || !action) {
      return NextResponse.json({ success: false, error: 'Missing or invalid subscriptionId/action' }, { status: 400 });
    }

    /**
     * Tenant-scoped lookup.
     *
     * This used to be `prisma.subscription.findUnique({ where: { id } })` with
     * no organization filter, so any tenant ADMIN could cancel, re-activate,
     * re-plan or REFUND another tenant's subscription by supplying its id —
     * including moving real money through Razorpay. `scopeWhere` pins the
     * query to the caller's own organization (a platform super admin with no
     * `?organizationId=` keeps the platform-wide scope).
     */
    const subscription = await prisma.subscription.findFirst({
      where: scopeWhere(guard.guard, { id: subscriptionId } as Record<string, unknown>),
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
        await writeAuditLog(guard.guard, subscription.organizationId, 'SUBSCRIPTION_CANCELLED', subscriptionId,
          `Subscription ${subscriptionId} cancelled by admin`);
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
        await writeAuditLog(guard.guard, subscription.organizationId, 'SUBSCRIPTION_ACTIVATED', subscriptionId,
          `Subscription ${subscriptionId} activated by admin`);
        break;
      }
      case 'change_plan': {
        // Previously any string was written straight into the enum column.
        const newPlan = enumValue(body.plan, PLAN_TYPES);
        if (!newPlan) {
          return NextResponse.json(
            { success: false, error: `Plan must be one of: ${PLAN_TYPES.join(', ')}` },
            { status: 400 }
          );
        }
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { plan: newPlan },
        });
        await writeAuditLog(guard.guard, subscription.organizationId, 'SUBSCRIPTION_PLAN_CHANGED', subscriptionId,
          `Subscription ${subscriptionId} plan changed to ${newPlan} by admin`);
        break;
      }
      case 'refund': {
        const refundPaymentId = cleanString(body.refundPaymentId, 64, { required: true });

        // The payment must belong to *this* subscription, which is already
        // pinned to the caller's tenant by the lookup above.
        const payment = await prisma.payment.findFirst({
          where: { id: refundPaymentId, subscriptionId },
        });

        if (!payment || !payment.razorpayPaymentId) {
          return NextResponse.json({ success: false, error: 'Payment not found or no Razorpay ID' }, { status: 404 });
        }

        /**
         * Refund amount validation.
         *
         * `refundAmount` used to be forwarded to Razorpay unvalidated, so a
         * negative value, a float, or a value larger than the captured amount
         * reached the payment gateway, and whatever came back was persisted as
         * `refundAmount` — leaving the ledger disagreeing with Razorpay.
         * Amounts here are minor units (paise), so it must be a positive
         * integer no greater than what was actually captured.
         */
        let refundAmount: number | undefined;
        if (body.refundAmount !== undefined && body.refundAmount !== null) {
          const parsed = boundedInt(body.refundAmount, { min: 1, max: payment.amount });
          if (parsed === undefined) {
            return NextResponse.json(
              {
                success: false,
                error: `refundAmount must be an integer between 1 and ${payment.amount} (the captured amount)`,
              },
              { status: 400 }
            );
          }
          refundAmount = parsed;
        }

        const refundReason = cleanString(body.refundReason, 200) || 'Refunded by admin';

        /**
         * Atomic refund claim.
         *
         * The old flow read the payment, checked `status === 'REFUNDED'`, then
         * called Razorpay, then wrote the row — a check-then-act race in which
         * two concurrent PATCHes both pass the check and issue TWO refunds for
         * one payment. Real money, so the claim has to be a single guarded
         * UPDATE: the row is only claimable while it is still refundable
         * (SUCCESS / PARTIALLY_REFUNDED) and has never been refunded
         * (`refundId IS NULL`), and the winner parks a random token in
         * `refundId` before touching the gateway. The token is replaced by the
         * real refund id on success, or cleared on failure so a genuine
         * gateway outage can be retried.
         *
         * `refundId` is used as the claim token rather than a new
         * `REFUNDING` enum member so no schema migration is required.
         */
        const claimToken = `pending:${randomToken(16)}`;
        const claimed = await prisma.payment.updateMany({
          where: {
            id: refundPaymentId,
            status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] },
            refundId: null,
          },
          data: { refundId: claimToken },
        });
        if (claimed.count === 0) {
          return NextResponse.json(
            { success: false, error: 'Payment is already refunded or a refund is in progress' },
            { status: 409 }
          );
        }

        try {
          const refundResult = await PaymentService.processRefund(
            payment.razorpayPaymentId,
            refundAmount ?? undefined
          );

          // Record what Razorpay actually refunded, not what was requested.
          const effectiveAmount = refundAmount ?? payment.amount;
          await prisma.payment.update({
            where: { id: refundPaymentId },
            data: {
              status: effectiveAmount >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
              refundId: refundResult.id,
              refundAmount: effectiveAmount,
              refundReason,
            },
          });

          // Cancel the subscription after refund
          await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { status: 'CANCELLED', autoRenew: false, cancelledAt: new Date() },
          });
          await writeAuditLog(guard.guard, subscription.organizationId, 'SUBSCRIPTION_REFUNDED', subscriptionId,
            `Payment ${refundPaymentId} refunded (${effectiveAmount}) for subscription ${subscriptionId}`);
        } catch (refundError) {
          // Release the claim so a genuine gateway failure can be retried.
          // Scoped to our own token so we never clear a refund that another
          // request completed in the meantime.
          await prisma.payment
            .updateMany({
              where: { id: refundPaymentId, refundId: claimToken },
              data: { refundId: null },
            })
            .catch(() => {});
          console.error('Refund processing failed:', refundError);
          return NextResponse.json({ success: false, error: 'Refund processing failed' }, { status: 500 });
        }
        break;

      }
    }

    return NextResponse.json({ success: true, message: `Subscription ${action} successful` });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Admin subscription action error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process action' }, { status: 500 });
  }
}

/**
 * Audit log helper.
 *
 * The cancel path already wrote one; activate / change_plan / refund did not,
 * so money-moving admin actions left no trace. Also guards against the empty
 * `organizationId: ''` the cancel path used to write when the acting admin had
 * no org on their session.
 */
async function writeAuditLog(
  guard: Guard,
  organizationId: string,
  action: string,
  entityId: string,
  description: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: organizationId || guard.organizationId || '',
      userId: guard.user.id,
      action,
      entity: 'Subscription',
      entityId,
      description,
    },
  });
}
