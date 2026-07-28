import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes((session.user as any).role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all queries in parallel
    const [
      totalUsers,
      premiumUsers,
      totalDocuments,
      totalRevenue,
      dailyRevenue,
      monthlyRevenue,
      activeSubscriptions,
      expiredUsers,
      recentUsers,
      documentCategories,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.document.count({ where: { deletedAt: null } }),
      prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
      prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: thirtyDaysAgo } },
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: startOfMonth } },
        select: { amount: true, createdAt: true },
      }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, email: true, image: true, role: true, organizationId: true, emailVerified: true, createdAt: true },
      }),
      prisma.document.groupBy({
        by: ['documentType'],
        _count: true,
        orderBy: { _count: { documentType: 'desc' } },
        take: 10,
      }),
    ]);

    // Calculate daily revenue aggregation
    const dailyRevenueMap = new Map<string, number>();
    dailyRevenue.forEach((payment) => {
      const dateKey = payment.createdAt.toISOString().split('T')[0];
      dailyRevenueMap.set(dateKey, (dailyRevenueMap.get(dateKey) || 0) + payment.amount);
    });

    const dailyRevenueData = Array.from(dailyRevenueMap.entries()).map(([date, amount]) => ({
      date,
      amount: amount / 100, // Convert paise to rupees
    }));

    // Calculate monthly revenue
    const monthlyTotal = monthlyRevenue.reduce((sum, p) => sum + p.amount, 0);
    const monthlyRevenueData = [
      {
        month: now.toLocaleString('default', { month: 'short', year: 'numeric' }),
        amount: monthlyTotal / 100,
      },
    ];

    const totalRevenueRupees = (totalRevenue._sum.amount || 0) / 100;
    const mrr = monthlyTotal / 100; // Monthly Recurring Revenue
    const arr = mrr * 12; // Annual Run Rate

    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        premiumUsers,
        totalDocuments,
        totalRevenue: totalRevenueRupees,
        mrr,
        arr,
        activeSubscriptions,
        expiredUsers,
        dailyRevenue: dailyRevenueData,
        monthlyRevenue: monthlyRevenueData,
        recentUsers: recentUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          image: u.image || undefined,
          role: u.role as any,
          organizationId: u.organizationId,
          emailVerified: !!u.emailVerified,
          twoFactorEnabled: false,
        })),
        documentCategories: documentCategories.map((dc) => ({
          category: dc.documentType,
          count: dc._count,
        })),
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
