import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, scopeWhere } from '@/lib/security/authorization';
import {
  assertSameOrigin,
  readJsonBody,
  parsePagination,
  enumValue,
  cleanString,
  ValidationError,
} from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePagination(searchParams, 20);
    const status = enumValue(searchParams.get('status') ?? '', TICKET_STATUSES);
    const priority = enumValue(searchParams.get('priority') ?? '', TICKET_PRIORITIES);
    const search = cleanString(searchParams.get('search'), 120);

    /**
     * Tenant scoping: support tickets carry the submitting user's contact
     * details and message body. Without `organizationId` a tenant admin's
     * support queue showed every other customer's tickets and replies.
     */
    const where = scopeWhere(guard.guard, {} as Record<string, unknown>);
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' as const } },
        { user: { name: { contains: search, mode: 'insensitive' as const } } },
        { user: { email: { contains: search, mode: 'insensitive' as const } } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          organization: { select: { name: true } },
          _count: { select: { replies: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
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
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const ticketId = cleanString(body.ticketId, 64, { required: true });
    const newStatus = enumValue(body.status ?? '', TICKET_STATUSES);
    const priority = enumValue(body.priority ?? '', TICKET_PRIORITIES);
    const reply = typeof body.reply === 'string' ? cleanString(body.reply, 5000) : null;

    if (!newStatus && !priority && !reply) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    /**
     * Cross-tenant IDOR fix: both the reply insert and the status/priority
     * update keyed off a bare `ticketId`. Any tenant ADMIN could therefore
     * (a) post staff replies into another customer's ticket, and (b) close or
     * re-prioritise it. Resolve the ticket through the guard's scope first;
     * a cross-tenant id now resolves to nothing and yields 404.
     */
    const ticket = await prisma.supportTicket.findFirst({
      where: scopeWhere(guard.guard, { id: ticketId } as Record<string, unknown>),
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
    }

    if (reply) {
      await prisma.supportTicketReply.create({
        data: {
          ticketId: ticket.id,
          userId: guard.guard.user.id,
          message: reply,
          isStaff: true,
        },
      });
    }

    if (newStatus || priority) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          ...(newStatus && { status: newStatus, ...(newStatus === 'RESOLVED' ? { resolvedAt: new Date() } : {}) }),
          ...(priority && { priority }),
        },
      });
    }

    return NextResponse.json({ success: true, message: 'Ticket updated' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin ticket update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update ticket' }, { status: 500 });
  }
}
