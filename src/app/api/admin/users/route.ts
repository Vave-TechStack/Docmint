import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, scopeWhere, invalidateUserCache } from '@/lib/security/authorization';
import {
  assertSameOrigin,
  readJsonBody,
  parsePagination,
  enumValue,
  cleanString,
  ValidationError,
} from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const USER_ROLES = ['USER', 'ADMIN', 'SUPER_ADMIN'] as const;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePagination(searchParams, 20);
    const search = cleanString(searchParams.get('search'), 120);
    const role = enumValue(searchParams.get('role') ?? '', USER_ROLES);
    const status = searchParams.get('status') ?? '';

    /**
     * Tenant scoping.
     *
     * The PATCH handler below was already tenant-scoped, but GET was not: its
     * `where` never mentioned `organizationId`, so any tenant ADMIN's user
     * list returned EVERY user on the platform — names, emails, mobile numbers,
     * org names and subscription state for competing tenants. `scopeWhere`
     * pins the query to the caller's own organization; a platform SUPER_ADMIN
     * with no `?organizationId=` keeps the platform-wide view.
     */
    const where = scopeWhere(guard.guard, { deletedAt: null } as Record<string, unknown>);
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
        skip,
        take,
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
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const userId = cleanString(body.userId, 64, { required: true });
    const action = cleanString(body.action, 32, { required: true });

    if (!userId || !action) {
      return NextResponse.json({ success: false, error: 'Missing userId or action' }, { status: 400 });
    }

    const isSuperAdmin = guard.guard.isSuperAdmin && !guard.guard.organizationId;

    // Load the target user so mutations can be scoped and privileged accounts
    // protected. Previously any ADMIN could act on users of ANY organization
    // (cross-tenant mutation) and even promote others to ADMIN.
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Non-super-admins (ADMIN role) may only manage users in their OWN org,
    // and may never act on other admins or super-admins.
    if (!isSuperAdmin) {
      if (target.organizationId !== guard.guard.organizationId) {
        return NextResponse.json(
          { success: false, error: 'Cannot manage users outside your organization' },
          { status: 403 }
        );
      }
      if (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Cannot modify administrator accounts' },
          { status: 403 }
        );
      }
    }

    // Role changes (promote/demote) are a system-level privilege: only
    // SUPER_ADMIN may grant or revoke the ADMIN role.
    if ((action === 'make_admin' || action === 'make_user') && !isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only super admins can change user roles' },
        { status: 403 }
      );
    }

    switch (action) {
      case 'suspend':
        await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
        invalidateUserCache(userId);
        await prisma.auditLog.create({
          data: {
            organizationId: target.organizationId ?? guard.guard.organizationId ?? '',
            userId: guard.guard.user.id,
            action: 'USER_SUSPENDED',
            entity: 'User',
            entityId: userId,
            description: `User ${userId} suspended by admin`,
          },
        });
        break;
      case 'activate':
        await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
        invalidateUserCache(userId);
        break;
      case 'delete':
        await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date(), isActive: false } });
        invalidateUserCache(userId);
        break;
      case 'make_admin':
        await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
        invalidateUserCache(userId);
        break;
      case 'make_user':
        await prisma.user.update({ where: { id: userId }, data: { role: 'USER' } });
        invalidateUserCache(userId);
        break;
      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `User ${action} successful` });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin user action error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process action' }, { status: 500 });
  }
}
