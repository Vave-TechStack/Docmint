import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || !ADMIN_ROLES.includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};

    // ── Download mode switch: Instant (₹1) ⇄ Premium ─────────────────────
    // One atomic switch that keeps isPremium + visibility consistent so a
    // template can never sit in a half-instant / half-premium state:
    //   instant → PUBLIC + non-premium (₹1 pay-per-download flow)
    //   premium → PUBLIC + isPremium  (subscription-gated flow)
    if (body.mode !== undefined) {
      if (body.mode === 'instant') {
        data.isPremium = false;
        data.visibility = 'PUBLIC';
      } else if (body.mode === 'premium') {
        data.isPremium = true;
        data.visibility = 'PUBLIC';
      } else {
        return NextResponse.json(
          { success: false, error: "mode must be 'instant' or 'premium'" },
          { status: 400 }
        );
      }
    }

    // ── Individual flags (kept consistent with the mode above) ────────────
    // Premium templates are PUBLIC + isPremium by convention; 'PREMIUM' was
    // previously offered as a visibility value, so normalize it to a flag.
    if (body.visibility !== undefined) {
      if (body.visibility === 'PREMIUM') {
        data.visibility = 'PUBLIC';
        data.isPremium = true;
      } else {
        data.visibility = body.visibility;
      }
    }
    if (body.isPremium !== undefined) data.isPremium = !!body.isPremium;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;

    // Invariant: a premium template is ALWAYS PUBLIC. Run this last so it wins
    // over any mode + visibility combination in the same request — otherwise a
    // premium-but-private row could leak into the library's Premium filter.
    if (data.isPremium === true) data.visibility = 'PUBLIC';

    const template = await prisma.template.update({ where: { id }, data });

    const description =
      body.mode === 'premium'
        ? `Template "${template.name}" switched to Premium (subscription-gated)`
        : body.mode === 'instant'
          ? `Template "${template.name}" switched to Instant ₹1 download`
          : `Template "${template.name}" updated by admin`;

    await prisma.auditLog.create({
      data: {
        organizationId: session.user.organizationId ?? '',
        userId: session.user.id,
        action: 'TEMPLATE_UPDATED',
        entity: 'Template',
        entityId: id,
        description,
      },
    });

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Admin template update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || !ADMIN_ROLES.includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const template = await prisma.template.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        organizationId: session.user.organizationId ?? '',
        userId: session.user.id,
        action: 'TEMPLATE_DELETED',
        entity: 'Template',
        entityId: id,
        description: `Template "${template.name}" deleted by admin`,
      },
    });

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Admin template delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 });
  }
}
