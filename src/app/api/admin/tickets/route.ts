import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes((session.user as any).role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const status = searchParams.get('status') || '';
    const priority = searchParams.get('priority') || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          organization: { select: { name: true } },
          _count: { select: { replies: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: tickets, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error('Admin tickets error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes((session.user as any).role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ticketId, status: newStatus, priority, reply } = body;

    if (reply) {
      await prisma.supportTicketReply.create({
        data: {
          ticketId,
          userId: session.user.id,
          message: reply,
          isStaff: true,
        },
      });
    }

    if (newStatus || priority) {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          ...(newStatus && { status: newStatus, ...(newStatus === 'RESOLVED' ? { resolvedAt: new Date() } : {}) }),
          ...(priority && { priority }),
        },
      });
    }

    return NextResponse.json({ success: true, message: 'Ticket updated' });
  } catch (error) {
    console.error('Admin ticket update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update ticket' }, { status: 500 });
  }
}
