import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, scopeWhere } from '@/lib/security/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    /**
     * Tenant scoping.
     *
     * The dashboard ran every count/aggregate platform-wide, and `recentUsers`
     * returned the names, emails, roles and verification state of the ten most
     * recently created accounts ON THE WHOLE PLATFORM — a live feed of
     * competitor signups. `documentCategories` likewise summarised every
     * tenant's documents. All queries are now pinned to the caller's own
     * organization.
     */
    const userScope = () => scopeWhere(guard.guard, { deletedAt: null } as Record<string, unknown>);
    const docScope = () => scopeWhere(guard.guard, { deletedAt: null } as Record<string, unknown>);
    const paymentScope = () => scopeWhere(guard.guard, { status: 'SUCCESS' } as Record<string, unknown>);
    const subScope = () => scopeWhere(guard.guard, {} as Record<string, unknown>);

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
      prisma.user.count({ where: userScope() }),
      prisma.subscription.count({ where: { ...subScope(), status: 'ACTIVE' } }),
      prisma.document.count({ where: docScope() }),
      prisma.payment.aggregate({ where: paymentScope(), _sum: { amount: true } }),
      prisma.payment.findMany({
        where: { ...paymentScope(), createdAt: { gte: thirtyDaysAgo } },
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.payment.findMany({
        where: { ...paymentScope(), createdAt: { gte: startOfMonth } },
        select: { amount: true, createdAt: true },
      }),
      prisma.subscription.count({ where: { ...subScope(), status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { ...subScope(), status: 'EXPIRED' } }),
      prisma.user.findMany({
        where: userScope(),
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, email: true, image: true, role: true, organizationId: true, emailVerified: true, createdAt: true },
      }),
      prisma.document.groupBy({
        by: ['documentType'],
        where: docScope(),
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
          role: u.role,
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
