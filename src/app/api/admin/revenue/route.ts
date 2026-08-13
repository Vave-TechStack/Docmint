import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month'; // day, week, month, year, all
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const now = new Date();
    let fromDate: Date;
    let toDate: Date = now;

    if (fromParam && toParam) {
      fromDate = new Date(fromParam);
      toDate = new Date(toParam);
    } else {
      switch (period) {
        case 'day':
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          fromDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
          break;
        case 'all':
          fromDate = new Date(0);
          break;
        case 'month':
        default:
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
    }

    const from30DaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ─── Parallel queries ───
    const [
      totalRevenue,
      periodRevenue,
      dailyRevenueRaw,
      revenueByType,
      , // revenueByPlan — unused; empty slot keeps positional alignment with Promise.all
      paymentCounts,
      refundStats,
      subscriptionStats,
      instantStats,
      userCounts,
      conversionData,
    ] = await Promise.all([
      // Total all-time revenue
      prisma.payment.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true },
        _count: true,
      }),

      // Revenue for selected period
      prisma.payment.aggregate({
        where: { status: 'SUCCESS', createdAt: { gte: fromDate, lte: toDate } },
        _sum: { amount: true },
        _count: true,
      }),

      // Daily revenue for last 30 days
      prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: from30DaysAgo } },
        select: { amount: true, paymentType: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // Revenue by payment type (period)
      prisma.payment.groupBy({
        by: ['paymentType'],
        where: { status: 'SUCCESS', createdAt: { gte: fromDate, lte: toDate } },
        _sum: { amount: true },
        _count: true,
      }),

      // Revenue by plan (via subscription)
      prisma.payment.groupBy({
        by: ['paymentType'],
        where: {
          status: 'SUCCESS',
          paymentType: 'SUBSCRIPTION',
          createdAt: { gte: fromDate, lte: toDate },
        },
        _sum: { amount: true },
        _count: true,
      }),

      // Payment status counts
      prisma.payment.groupBy({
        by: ['status'],
        _count: true,
      }),

      // Refund stats
      prisma.payment.aggregate({
        where: { status: 'REFUNDED' },
        _sum: { amount: true, refundAmount: true },
        _count: true,
      }),

      // Subscription stats
      Promise.all([
        prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        prisma.subscription.count({ where: { status: 'GRACE_PERIOD' } }),
        prisma.subscription.count({ where: { status: 'EXPIRED' } }),
        prisma.subscription.count({ where: { status: 'CANCELLED' } }),
        prisma.subscription.aggregate({ where: { status: 'ACTIVE' }, _sum: { amount: true } }),
        prisma.subscription.groupBy({
          by: ['plan'],
          _count: true,
          where: { status: 'ACTIVE' },
        }),
        prisma.subscription.count({
          where: { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
        }),
      ]),

      // Instant download stats
      Promise.all([
        prisma.payment.count({
          where: { paymentType: 'INSTANT_DOWNLOAD', createdAt: { gte: fromDate, lte: toDate } },
        }),
        prisma.payment.aggregate({
          where: { paymentType: 'INSTANT_DOWNLOAD', status: 'SUCCESS', createdAt: { gte: fromDate, lte: toDate } },
          _sum: { amount: true },
        }),
      ]),

      // User counts
      Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: null, createdAt: { gte: fromDate } } }),
        prisma.user.count({
          where: { deletedAt: null, role: { not: 'SUPER_ADMIN' } },
        }),
      ]),

      // Conversion: users who have made a payment vs total. Anonymous
      // instant-download payments have no userId (nullable) and must not
      // count as a paying user.
      prisma.payment.groupBy({
        by: ['userId'],
        where: { status: 'SUCCESS', userId: { not: null } },
        _count: true,
      }),
    ]);

    // ─── Process daily revenue ───
    const dailyRevenueMap = new Map<string, { subscription: number; instant: number; total: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      dailyRevenueMap.set(key, { subscription: 0, instant: 0, total: 0 });
    }
    dailyRevenueRaw.forEach((payment) => {
      const key = payment.createdAt.toISOString().split('T')[0];
      if (dailyRevenueMap.has(key)) {
        const entry = dailyRevenueMap.get(key)!;
        const amountInr = payment.amount / 100;
        entry.total += amountInr;
        if (payment.paymentType === 'INSTANT_DOWNLOAD') {
          entry.instant += amountInr;
        } else {
          entry.subscription += amountInr;
        }
      }
    });

    const dailyRevenue = Array.from(dailyRevenueMap.entries()).map(([date, data]) => ({
      date,
      total: Math.round(data.total * 100) / 100,
      subscription: Math.round(data.subscription * 100) / 100,
      instant: Math.round(data.instant * 100) / 100,
    }));

    // ─── Monthly revenue (last 12 months) ───
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const monthlyPayments = await prisma.payment.findMany({
      where: { status: 'SUCCESS', createdAt: { gte: twelveMonthsAgo } },
      select: { amount: true, paymentType: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthlyRevenueMap = new Map<string, { subscription: number; instant: number; total: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenueMap.set(key, { subscription: 0, instant: 0, total: 0 });
    }
    monthlyPayments.forEach((payment) => {
      const key = `${payment.createdAt.getFullYear()}-${String(payment.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyRevenueMap.has(key)) {
        const entry = monthlyRevenueMap.get(key)!;
        const amountInr = payment.amount / 100;
        entry.total += amountInr;
        if (payment.paymentType === 'INSTANT_DOWNLOAD') {
          entry.instant += amountInr;
        } else {
          entry.subscription += amountInr;
        }
      }
    });

    const monthlyRevenue = Array.from(monthlyRevenueMap.entries()).map(([month, data]) => {
      const [y, m] = month.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        month: `${monthNames[parseInt(m) - 1]} ${y}`,
        key: month,
        total: Math.round(data.total * 100) / 100,
        subscription: Math.round(data.subscription * 100) / 100,
        instant: Math.round(data.instant * 100) / 100,
      };
    });

    // ─── Compute metrics ───
    const totalRevenueRupees = (totalRevenue._sum.amount || 0) / 100;
    const periodRevenueRupees = (periodRevenue._sum.amount || 0) / 100;
    const totalTransactions = totalRevenue._count;

    // MRR: Average monthly revenue over last 3 months
    const last3MonthsRevenue = monthlyRevenue.slice(-3).reduce((sum, m) => sum + m.total, 0);
    const mrr = Math.round((last3MonthsRevenue / Math.max(monthlyRevenue.slice(-3).length, 1)) * 100) / 100;
    const arr = Math.round(mrr * 12 * 100) / 100;

    // Revenue by type
    const subscriptionRevenue = revenueByType.find(r => r.paymentType === 'SUBSCRIPTION');
    const instantRevenue = revenueByType.find(r => r.paymentType === 'INSTANT_DOWNLOAD');
    const renewalRevenue = revenueByType.find(r => r.paymentType === 'RENEWAL');

    const revenueBreakdown = {
      subscription: Math.round(((subscriptionRevenue?._sum.amount || 0) / 100) * 100) / 100,
      instant: Math.round(((instantRevenue?._sum.amount || 0) / 100) * 100) / 100,
      renewal: Math.round(((renewalRevenue?._sum.amount || 0) / 100) * 100) / 100,
      subscriptionCount: subscriptionRevenue?._count || 0,
      instantCount: instantRevenue?._count || 0,
      renewalCount: renewalRevenue?._count || 0,
    };

    // Payment status breakdown
    const paymentBreakdown = {
      success: paymentCounts.find(s => s.status === 'SUCCESS')?._count || 0,
      failed: paymentCounts.find(s => s.status === 'FAILED')?._count || 0,
      refunded: paymentCounts.find(s => s.status === 'REFUNDED')?._count || 0,
      pending: paymentCounts.find(s => s.status === 'PENDING')?._count || 0,
    };

    // Refund stats
    const refundData = {
      totalRefunded: Math.round(((refundStats._sum.amount || 0) / 100) * 100) / 100,
      totalRefundAmount: Math.round(((refundStats._sum.refundAmount || 0) / 100) * 100) / 100,
      refundCount: refundStats._count,
      refundRate: totalTransactions > 0
        ? Math.round((refundStats._count / totalTransactions) * 10000) / 100
        : 0,
    };

    // Subscription stats
    const [
      activeSubs,
      graceSubs,
      expiredSubs,
      cancelledSubs,
      activeRevenue,
      planDistribution,
      newSubs30d,
    ] = subscriptionStats;

    const subsByPlan = planDistribution.reduce((acc: Record<string, number>, p) => {
      acc[p.plan] = p._count;
      return acc;
    }, {});

    const subData = {
      active: activeSubs,
      gracePeriod: graceSubs,
      expired: expiredSubs,
      cancelled: cancelledSubs,
      total: activeSubs + graceSubs + expiredSubs + cancelledSubs,
      activeMrr: Math.round(((activeRevenue._sum.amount || 0) / 100) * 100) / 100,
      byPlan: subsByPlan,
      newLast30Days: newSubs30d,
    };

    // Instant download stats
    const [instantCount, instantRev] = instantStats;
    const instantData = {
      count: instantCount,
      revenue: Math.round(((instantRev._sum.amount || 0) / 100) * 100) / 100,
      avgPerDownload: instantCount > 0
        ? Math.round(((instantRev._sum.amount || 0) / instantCount) / 100 * 100) / 100
        : 0,
    };

    // User stats
    const [totalUsers, newUsers, nonAdminUsers] = userCounts;
    const userData = {
      total: totalUsers,
      newInPeriod: newUsers,
      nonAdmin: nonAdminUsers,
      payingUsers: conversionData.length,
      conversionRate: totalUsers > 0
        ? Math.round((conversionData.length / totalUsers) * 10000) / 100
        : 0,
    };

    // Growth rates
    const prevMonthRevenue = monthlyRevenue.length >= 2
      ? monthlyRevenue[monthlyRevenue.length - 2].total
      : 0;
    const currentMonthRevenue = monthlyRevenue.length >= 1
      ? monthlyRevenue[monthlyRevenue.length - 1].total
      : 0;
    const revenueGrowth = prevMonthRevenue > 0
      ? Math.round(((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 10000) / 100
      : 0;

    // Average revenue per user (ARPU)
    const arpu = userData.payingUsers > 0
      ? Math.round((totalRevenueRupees / userData.payingUsers) * 100) / 100
      : 0;

    // Customer Lifetime Value (estimated: MRR * avg lifetime months)
    const churnRate = subData.total > 0
      ? Math.round((subData.cancelled / (subData.total + subData.cancelled)) * 10000) / 100
      : 0;
    const avgLifetimeMonths = churnRate > 0 ? Math.round(100 / churnRate * 10) / 10 : 12;
    const estimatedLtv = Math.round(mrr * avgLifetimeMonths * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalRevenue: Math.round(totalRevenueRupees * 100) / 100,
          periodRevenue: periodRevenueRupees,
          periodTransactions: periodRevenue._count,
          totalTransactions,
          mrr,
          arr,
          revenueGrowth,
          arpu,
          estimatedLtv,
          churnRate,
        },
        dailyRevenue,
        monthlyRevenue,
        revenueBreakdown,
        paymentBreakdown,
        refunds: refundData,
        subscriptions: subData,
        instantDownloads: instantData,
        users: userData,
      },
    });
  } catch (error) {
    console.error('Admin revenue API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch revenue data' },
      { status: 500 }
    );
  }
}
