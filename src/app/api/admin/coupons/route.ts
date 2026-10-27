import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, scopeWhere } from '@/lib/security/authorization';
import {
  assertSameOrigin,
  readJsonBody,
  cleanString,
  enumValue,
  boundedInt,
  ValidationError,
} from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED'] as const;
const COUPON_APPLIES_TO = ['SUBSCRIPTION', 'INSTANT_DOWNLOAD', 'ALL'] as const;

const COUPON_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/**
 * `/api/admin/coupons` manages pricing discounts.
 *
 * `Coupon.organizationId` is nullable, which means a coupon is either
 * tenant-owned or platform-wide. The route previously ignored that column
 * entirely: every `ADMIN` could list every coupon in the system AND create
 * unlimited-use, 100%-off platform coupons that apply to `ALL` purchase types.
 * That is a direct revenue-impacting privilege escalation.
 *
 * Policy:
 *  - tenant `ADMIN`  → sees and creates coupons for their OWN organization only
 *                      (`organizationId` is always forced to their org, never
 *                      taken from the request body, so they cannot mint global
 *                      coupons).
 *  - `SUPER_ADMIN`   → platform-wide, and may explicitly create a global
 *                      coupon by passing `isGlobal: true`.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const coupons = await prisma.coupon.findMany({
      where: scopeWhere(guard.guard, {} as Record<string, unknown>),
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: coupons });
  } catch (error) {
    console.error('Admin coupons error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch coupons' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);

    const code = cleanString(body.code, 32, { required: true }).toUpperCase();
    if (!COUPON_CODE_RE.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Code must be 3-32 characters (A-Z, 0-9, _ or -)' },
        { status: 400 }
      );
    }

    const description = cleanString(body.description, 200);
    const discountType = enumValue(body.discountType ?? '', DISCOUNT_TYPES);
    const appliesTo = enumValue(body.appliesTo ?? '', COUPON_APPLIES_TO);

    if (!discountType || !appliesTo) {
      return NextResponse.json({ success: false, error: 'Invalid discountType or appliesTo' }, { status: 400 });
    }

    // Discount math is validated, not trusted: an unbounded or negative value
    // would otherwise let a coupon over-refund or invert a total. The bound
    // depends on the unit — a percentage is capped at 100, a fixed amount is
    // in paise and must stay within a sane ceiling.
    const discountValue =
      discountType === 'PERCENTAGE'
        ? boundedInt(body.discountValue, { min: 1, max: 100 })
        : boundedInt(body.discountValue, { min: 1, max: 10_000_00 });
    if (discountValue === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            discountType === 'PERCENTAGE'
              ? 'Percentage discount must be 1-100'
              : 'Fixed discount must be 1-1000000',
        },
        { status: 400 }
      );
    }

    const minAmount = boundedInt(body.minAmount, { min: 0, max: 100_000_000 }) ?? 0;
    const maxDiscount = boundedInt(body.maxDiscount, { min: 1, max: 100_000_000 });
    const maxUses = boundedInt(body.maxUses, { min: 1, max: 1_000_000 });

    // Only a super admin may mint a platform-wide coupon. For everyone else the
    // organization is pinned to the guard, ignoring whatever the body claimed.
    const wantsGlobal = body.isGlobal === true;
    if (wantsGlobal && !guard.guard.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only super admins can create platform-wide coupons' },
        { status: 403 }
      );
    }
    const organizationId = wantsGlobal ? null : guard.guard.organizationId;

    let startsAt = new Date();
    if (body.startsAt) {
      const parsed = new Date(String(body.startsAt));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid startsAt' }, { status: 400 });
      }
      startsAt = parsed;
    }
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const parsed = new Date(String(body.expiresAt));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid expiresAt' }, { status: 400 });
      }
      if (parsed <= startsAt) {
        return NextResponse.json({ success: false, error: 'expiresAt must be after startsAt' }, { status: 400 });
      }
      expiresAt = parsed;
    }

    // Guarded lookup first so a duplicate code is a 409 instead of a Prisma
    // P2002 bubbling up as a 500.
    const existing = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Coupon code already exists' }, { status: 409 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code,
        description: description || null,
        discountType,
        discountValue,
        minAmount,
        maxDiscount,
        maxUses,
        appliesTo,
        organizationId,
        startsAt,
        expiresAt,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: coupon });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin coupon create error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create coupon' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const id = cleanString(body.id, 64, { required: true });

    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ success: false, error: 'isActive must be a boolean' }, { status: 400 });
    }

    // Cross-tenant IDOR fix: `coupon.update({ where: { id } })` let any tenant
    // admin toggle any coupon. Resolve within the guard's scope first.
    const target = await prisma.coupon.findFirst({
      where: scopeWhere(guard.guard, { id } as Record<string, unknown>),
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    const coupon = await prisma.coupon.update({
      where: { id: target.id },
      data: { isActive: body.isActive },
    });

    return NextResponse.json({ success: true, data: coupon });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin coupon update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update coupon' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { searchParams } = new URL(request.url);
    const id = cleanString(searchParams.get('id'), 64, { required: true });

    const target = await prisma.coupon.findFirst({
      where: scopeWhere(guard.guard, { id } as Record<string, unknown>),
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    // Coupons are referenced by historical orders, so deactivate rather than
    // delete, keeping the audit trail intact.
    const coupon = await prisma.coupon.update({
      where: { id: target.id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: coupon });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin coupon delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete coupon' }, { status: 500 });
  }
}
