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
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';

    const where: Record<string, unknown> = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { organization: { name: { contains: search, mode: 'insensitive' as const } } },
      ];
    }
    if (role) where.role = role;
    if (status === 'active') where.isActive = true;
    if (status === 'suspended') where.isActive = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true, slug: true, plan: true, status: true } },
          subscriptions: { where: { status: 'ACTIVE' }, take: 1, select: { id: true, endDate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        role: u.role,
        isActive: u.isActive,
        emailVerified: !!u.emailVerified,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString(),
        organization: u.organization,
        subscription: u.subscriptions[0] || null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, action } = body;

    if (!userId || !action) {
      return NextResponse.json({ success: false, error: 'Missing userId or action' }, { status: 400 });
    }

    switch (action) {
      case 'suspend':
        await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
        await prisma.auditLog.create({
          data: {
            organizationId: session.user.organizationId ?? '',
            userId: session.user.id,
            action: 'USER_SUSPENDED',
            entity: 'User',
            entityId: userId,
            description: `User ${userId} suspended by admin`,
          },
        });
        break;
      case 'activate':
        await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
        break;
      case 'delete':
        await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date(), isActive: false } });
        break;
      case 'make_admin':
        await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
        break;
      case 'make_user':
        await prisma.user.update({ where: { id: userId }, data: { role: 'USER' } });
        break;
      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `User ${action} successful` });
  } catch (error) {
    console.error('Admin user action error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process action' }, { status: 500 });
  }
}
