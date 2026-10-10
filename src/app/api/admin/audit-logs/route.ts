import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, scopeWhere } from '@/lib/security/authorization';
import { parsePagination, cleanString } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePagination(searchParams, 50);
    const action = cleanString(searchParams.get('action'), 64);
    const entity = cleanString(searchParams.get('entity'), 64);

    /**
     * Tenant scoping: audit rows carry the acting user's email and the org name
     * in the joined payload, so an unscoped list leaked another tenant's staff
     * directory through the audit trail. Pinned to the caller's own org; a
     * platform SUPER_ADMIN keeps the global view.
     */
    const where = scopeWhere(guard.guard, {} as Record<string, unknown>);
    if (action) where.action = action;
    if (entity) where.entity = entity;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, image: true } },
          organization: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error('Admin audit logs error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
