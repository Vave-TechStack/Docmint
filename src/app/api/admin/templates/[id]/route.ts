import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, forbidden, type Guard } from '@/lib/security/authorization';
import {
  assertSameOrigin,
  readJsonBody,
  cleanString,
  enumValue,
  ValidationError,
} from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const TEMPLATE_VISIBILITIES = ['PUBLIC', 'PRIVATE', 'ORGANIZATION', 'PREMIUM', 'AI'] as const;

/**
 * Resolve a template the caller is actually allowed to mutate.
 *
 * `Template.organizationId` is nullable: `null` means a platform/seed template.
 * A tenant ADMIN may edit their own org's templates, but must not be able to
 * flip a platform template to PUBLIC/Premium (which would publish it to every
 * tenant) or delete it — so platform-owned rows require SUPER_ADMIN.
 */
type TemplateLookup =
  | { ok: true; template: { id: string; organizationId: string | null; name: string; isPremium: boolean; visibility: string } }
  | { ok: false; response: NextResponse };

async function resolveMutableTemplate(guard: Guard, id: string): Promise<TemplateLookup> {
  const template = await prisma.template.findUnique({
    where: { id },
    select: { id: true, organizationId: true, name: true, isPremium: true, visibility: true },
  });
  if (!template) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 }) };
  }

  if (guard.isSuperAdmin && !guard.organizationId) return { ok: true, template };
  if (template.organizationId && template.organizationId === guard.organizationId) return { ok: true, template };

  return {
    ok: false,
    response: template.organizationId
      ? forbidden('Template belongs to another organization')
      : forbidden('Only super admins can modify platform templates'),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;
    const body = await readJsonBody(request);

    const resolved = await resolveMutableTemplate(guard.guard, cleanString(id, 64, { required: true }));
    if (!resolved.ok) return resolved.response;
    const target = resolved.template;

    const data: Record<string, unknown> = {};

    // ── Download mode switch: Instant (₹9) ⇄ Premium ─────────────────────
    // One atomic switch that keeps isPremium + visibility consistent so a
    // template can never sit in a half-instant / half-premium state:
    //   instant → PUBLIC + non-premium (₹9 pay-per-download flow)
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
    // Previously the raw body value was written straight to the column, so any
    // string (or an object) reached the enum column and broke the update.
    if (body.visibility !== undefined) {
      const requested = enumValue(body.visibility, TEMPLATE_VISIBILITIES);
      if (!requested) {
        return NextResponse.json(
          { success: false, error: `visibility must be one of ${TEMPLATE_VISIBILITIES.join(', ')}` },
          { status: 400 }
        );
      }
      if (requested === 'PREMIUM') {
        data.visibility = 'PUBLIC';
        data.isPremium = true;
      } else {
        data.visibility = requested;
      }
    }
    if (body.isPremium !== undefined) {
      if (typeof body.isPremium !== 'boolean') {
        return NextResponse.json({ success: false, error: 'isPremium must be a boolean' }, { status: 400 });
      }
      data.isPremium = body.isPremium;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json({ success: false, error: 'isActive must be a boolean' }, { status: 400 });
      }
      data.isActive = body.isActive;
    }
    if (body.name !== undefined) data.name = cleanString(body.name, 200, { required: true });
    if (body.description !== undefined) data.description = cleanString(body.description, 1000);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    // Invariant: a premium template is ALWAYS PUBLIC. Run this last so it wins
    // over any mode + visibility combination in the same request — otherwise a
    // premium-but-private row could leak into the library's Premium filter.
    if (data.isPremium === true) data.visibility = 'PUBLIC';

    // Scoped update: the id is now known to belong to the caller, so the
    // plain update is safe, but we still guard on the owning org so a
    // concurrent reassignment cannot slip a cross-tenant write through.
    const updated = await prisma.template.updateMany({
      where:
        guard.guard.isSuperAdmin && !guard.guard.organizationId
          ? { id: target.id }
          : {
              id: target.id,
              OR: [{ organizationId: guard.guard.organizationId }, { organizationId: null }],
            },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    const template = await prisma.template.findUnique({ where: { id: target.id } });

    const description =
      body.mode === 'premium'
        ? `Template "${template?.name ?? target.name}" switched to Premium (subscription-gated)`
        : body.mode === 'instant'
          ? `Template "${template?.name ?? target.name}" switched to Instant ₹9 download`
          : `Template "${template?.name ?? target.name}" updated by admin`;

    await prisma.auditLog.create({
      data: {
        organizationId: target.organizationId ?? guard.guard.organizationId ?? '',
        userId: guard.guard.user.id,
        action: 'TEMPLATE_UPDATED',
        entity: 'Template',
        entityId: target.id,
        description,
      },
    });

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin template update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;

    const resolved = await resolveMutableTemplate(guard.guard, cleanString(id, 64, { required: true }));
    if (!resolved.ok) return resolved.response;
    const target = resolved.template;

    // Templates are referenced by saved documents, so deactivate rather than
    // hard-delete, and scope the update to the owning org.
    const { count } = await prisma.template.updateMany({
      where:
        guard.guard.isSuperAdmin && !guard.guard.organizationId
          ? { id: target.id }
          : {
              id: target.id,
              OR: [{ organizationId: guard.guard.organizationId }, { organizationId: null }],
            },
      data: { isActive: false },
    });
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: target.organizationId ?? guard.guard.organizationId ?? '',
        userId: guard.guard.user.id,
        action: 'TEMPLATE_DELETED',
        entity: 'Template',
        entityId: target.id,
        description: `Template "${target.name}" deactivated by admin`,
      },
    });

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin template delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 });
  }
}
