import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ─── Razorpay Production IP Ranges ───
// Source: https://razorpay.com/docs/webhooks/#test-webhook
const RAZORPAY_IPS = new Set([
  '3.6.117.55',
  '13.126.72.146',
  '13.127.115.153',
  '13.232.116.190',
  '15.206.19.82',
  '15.206.74.157',
  '3.7.18.108',
  '52.66.67.133',
  '65.2.34.105',
  '65.2.34.170',
]);

// ─── Rate Limiter (in-memory) ───
// Simple sliding-window rate limiter to protect against abuse
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if request comes from a whitelisted IP
 */
function isWhitelistedIP(ip: string): boolean {
  // Allow localhost and private IPs for testing
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) return true;
  
  return RAZORPAY_IPS.has(ip);
}

/**
 * Verify Razorpay webhook signature
 */
async function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const { createHmac } = await import('crypto');
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  // Razorpay sends signature prefixed with "sha256="
  const receivedSignature = signature.replace(/^sha256=/, '');
  return expectedSignature === receivedSignature;
}

/**
 * FIND: Find a payment by Razorpay order_id or payment_id
 */
async function findPaymentByRazorpayIds(razorpayOrderId?: string, razorpayPaymentId?: string) {
  if (!razorpayOrderId && !razorpayPaymentId) return null;
  
  const where: Record<string, string> = {};
  if (razorpayOrderId) where.razorpayOrderId = razorpayOrderId;
  if (razorpayPaymentId) where.razorpayPaymentId = razorpayPaymentId;
  
  return prisma.payment.findFirst({ where });
}

export async function POST(request: NextRequest) {
  try {
    // ─── 0. Application-Level Security ───
    
    // 0a. Only allow POST method
    // (Already handled by Next.js route convention, but double-check)
    
    // 0b. IP Whitelist Check (defense in depth)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || request.headers.get('x-razorpay-forwarded-ip') || 'unknown';
    
    // Skip IP check if in dev mode
    if (process.env.NODE_ENV === 'production' && clientIp !== 'unknown') {
      if (!isWhitelistedIP(clientIp)) {
        console.warn(`[Webhook] Blocked request from unauthorized IP: ${clientIp}`);
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
    }
    
    // 0c. Rate limiting: max 10 requests per second per IP
    if (!checkRateLimit(`webhook:${clientIp}`, 10, 1000)) {
      console.warn(`[Webhook] Rate limit exceeded for IP: ${clientIp}`);
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }
    
    // 0d. Check for required signature header
    const signature = request.headers.get('x-razorpay-signature') || '';
    if (!signature) {
      console.warn('[Webhook] Missing x-razorpay-signature header');
      return NextResponse.json({ success: false, error: 'Missing signature' }, { status: 401 });
    }

    // ─── 1. Verify webhook signature ───
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured in .env');
      return NextResponse.json({ success: false, error: 'Webhook not configured' }, { status: 500 });
    }

    const bodyText = await request.text();

    const isValid = await verifyWebhookSignature(bodyText, signature, webhookSecret);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
    }

    // ─── 2. Parse webhook event ───
    const event = JSON.parse(bodyText);
    const { event: eventName, payload } = event;

    if (!eventName || !payload) {
      return NextResponse.json({ success: false, error: 'Invalid webhook payload' }, { status: 400 });
    }

    console.log(`[Webhook] Received: ${eventName}`);

    // ─── 3. Handle different event types ───
    switch (eventName) {
      // ═══════════════════════════════════════════════
      // PAYMENT EVENTS
      // ═══════════════════════════════════════════════
      case 'payment.captured': {
        const paymentEntity = payload.payment?.entity;
        if (!paymentEntity) break;

        const { id: razorpayPaymentId, order_id: razorpayOrderId, status } = paymentEntity;

        // Update payment record in database
        await prisma.payment.updateMany({
          where: {
            OR: [
              { razorpayPaymentId },
              { razorpayOrderId },
            ],
          },
          data: {
            razorpayPaymentId,
            status: status === 'captured' ? 'SUCCESS' : 'FAILED',
          },
        });

        // If this is a subscription payment, find and update/create the subscription
        if (paymentEntity.description?.includes('Subscription') || paymentEntity.notes?.payment_type === 'subscription') {
          const existingPayment = await findPaymentByRazorpayIds(razorpayOrderId, razorpayPaymentId);
          if (existingPayment?.subscriptionId) {
            await prisma.subscription.update({
              where: { id: existingPayment.subscriptionId },
              data: { status: 'ACTIVE' },
            });
          }
        }

        break;
      }

      case 'payment.failed': {
        const failedPayment = payload.payment?.entity;
        if (!failedPayment) break;

        await prisma.payment.updateMany({
          where: { razorpayPaymentId: failedPayment.id },
          data: { status: 'FAILED' },
        });

        console.log(`[Webhook] Payment failed: ${failedPayment.id}`);
        break;
      }

      // ═══════════════════════════════════════════════
      // SUBSCRIPTION EVENTS
      // ═══════════════════════════════════════════════
      case 'subscription.activated': {
        const subEntity = payload.subscription?.entity;
        if (!subEntity) break;

        const { id: razorpaySubId, status, start_at, end_at } = subEntity;

        // Find subscription in our DB
        const dbSubscription = await prisma.subscription.findFirst({
          where: { razorpaySubscriptionId: razorpaySubId },
        });

        if (!dbSubscription) break;

        await prisma.subscription.update({
          where: { id: dbSubscription.id },
          data: {
            status: status === 'active' ? 'ACTIVE' : dbSubscription.status,
            startDate: start_at ? new Date(start_at * 1000) : dbSubscription.startDate,
            endDate: end_at ? new Date(end_at * 1000) : dbSubscription.endDate,
          },
        });

        // Create payment record for the activation
        await prisma.payment.create({
          data: {
            organizationId: dbSubscription.organizationId,
            userId: dbSubscription.userId,
            subscriptionId: dbSubscription.id,
            amount: dbSubscription.amount,
            currency: dbSubscription.currency,
            status: 'SUCCESS',
            paymentType: 'SUBSCRIPTION',
            description: 'Subscription activated via webhook',
          },
        });

        console.log(`[Webhook] Subscription activated: ${razorpaySubId}`);
        break;
      }

      case 'subscription.charged': {
        const chargedSub = payload.subscription?.entity;
        if (!chargedSub) break;

        const existingSub = await prisma.subscription.findFirst({
          where: { razorpaySubscriptionId: chargedSub.id },
        });

        if (!existingSub) break;

        // Idempotency check: prevent duplicate renewal payments
        const recentRenewal = await prisma.payment.findFirst({
          where: {
            subscriptionId: existingSub.id,
            paymentType: 'RENEWAL',
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // last 1 hour
          },
        });
        if (recentRenewal) {
          console.log(`[Webhook] Skipping duplicate renewal for sub: ${chargedSub.id}`);
          break;
        }

        // Update subscription dates for the new billing period
        await prisma.subscription.update({
          where: { id: existingSub.id },
          data: {
            status: 'ACTIVE',
            startDate: chargedSub.current_start ? new Date(chargedSub.current_start * 1000) : existingSub.startDate,
            endDate: chargedSub.current_end ? new Date(chargedSub.current_end * 1000) : existingSub.endDate,
          },
        });

        // Record the recurring payment
        await prisma.payment.create({
          data: {
            organizationId: existingSub.organizationId,
            userId: existingSub.userId,
            subscriptionId: existingSub.id,
            amount: existingSub.amount,
            currency: existingSub.currency,
            status: 'SUCCESS',
            paymentType: 'RENEWAL',
            description: 'Auto-renewal via Razorpay',
          },
        });

        console.log(`[Webhook] Subscription charged (renewal): ${chargedSub.id}`);
        break;
      }

      case 'subscription.completed': {
        const completedSub = payload.subscription?.entity;
        if (!completedSub) break;

        await prisma.subscription.updateMany({
          where: { razorpaySubscriptionId: completedSub.id },
          data: { status: 'EXPIRED' },
        });

        console.log(`[Webhook] Subscription completed: ${completedSub.id}`);
        break;
      }

      case 'subscription.halted': {
        const haltedSub = payload.subscription?.entity;
        if (!haltedSub) break;

        await prisma.subscription.updateMany({
          where: { razorpaySubscriptionId: haltedSub.id },
          data: { status: 'SUSPENDED' },
        });

        console.log(`[Webhook] Subscription halted (payment failed): ${haltedSub.id}`);
        break;
      }

      case 'subscription.pending': {
        const pendingSub = payload.subscription?.entity;
        if (!pendingSub) break;

        await prisma.subscription.updateMany({
          where: { razorpaySubscriptionId: pendingSub.id },
          data: { status: 'GRACE_PERIOD' },
        });

        console.log(`[Webhook] Subscription pending (grace period): ${pendingSub.id}`);
        break;
      }

      // ═══════════════════════════════════════════════
      // REFUND EVENTS
      // ═══════════════════════════════════════════════
      case 'refund.created': {
        const refundEntity = payload.refund?.entity;
        if (!refundEntity) break;

        const { payment_id, id: refundId, amount: refundAmount, notes } = refundEntity;

        await prisma.payment.updateMany({
          where: { razorpayPaymentId: payment_id },
          data: {
            status: 'REFUNDED',
            refundId,
            refundAmount: refundAmount,
            refundReason: notes?.reason || 'Refunded via Razorpay',
          },
        });

        console.log(`[Webhook] Refund created: ${refundId} for payment: ${payment_id}`);
        break;
      }

      // ═══════════════════════════════════════════════
      // ORDER EVENTS
      // ═══════════════════════════════════════════════
      case 'order.paid': {
        const orderEntity = payload.order?.entity;
        if (!orderEntity) break;

        // Record instant download payment
        await prisma.payment.upsert({
          where: { razorpayOrderId: orderEntity.id },
          update: { status: 'SUCCESS' },
          create: {
            organizationId: 'webhook', // Will be updated when user claims
            userId: 'webhook',
            razorpayOrderId: orderEntity.id,
            amount: orderEntity.amount,
            currency: orderEntity.currency || 'INR',
            status: 'SUCCESS',
            paymentType: 'INSTANT_DOWNLOAD',
            description: 'Instant download - order paid',
          },
        });

        console.log(`[Webhook] Order paid: ${orderEntity.id}`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${eventName}`);
    }

    // ═══════════════════════════════════════════════
    // Always return 200 to acknowledge receipt
    // ═══════════════════════════════════════════════
    return NextResponse.json({ 
      success: true, 
      message: `Webhook processed: ${eventName || 'unknown'}`,
    });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Webhook processing failed' 
    }, { status: 500 });
  }
}
