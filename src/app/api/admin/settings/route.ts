import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/security/authorization';
import { assertSameOrigin, readJsonBody, cleanString, ValidationError } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

/**
 * `/api/admin/settings` reads and writes `SystemSetting`, which is a GLOBAL
 * table — it has no `organizationId` and is shared by every tenant.
 *
 * Previously GET and PUT accepted `['SUPER_ADMIN','ADMIN']` while DELETE was
 * already SUPER_ADMIN-only. That inconsistency was the bug: a tenant-scoped
 * ADMIN could rewrite global platform configuration (and read back every
 * non-public setting, which is the natural home for SMTP/API credentials),
 * even though the same admin was denied the ability to delete a key.
 *
 * Policy: `SystemSetting` is platform-level, so all three verbs now require
 * `SUPER_ADMIN`. Tenant configuration belongs in the `Organization` model.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
    const settingsMap: Record<string, unknown> = {};
    settings.forEach((s) => { settingsMap[s.key] = s.value; });

    return NextResponse.json({ success: true, data: settingsMap });
  } catch (error) {
    console.error('Admin settings fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const key = cleanString(body.key, 128, { required: true, minLength: 1 });
    // Settings are `Json`; the client may legitimately send objects/arrays, so
    // the value is length-capped as a string but otherwise passed through.
    const raw = body.value;
    if (raw === undefined || raw === null) {
      return NextResponse.json({ success: false, error: 'Value is required' }, { status: 400 });
    }
    const value = JSON.stringify(raw).slice(0, 10_000) as unknown;
    const category = cleanString(body.category, 64) || 'general';

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as never, category },
      create: { key, value: value as never, category },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: guard.guard.organizationId ?? '',
        userId: guard.guard.user.id,
        action: 'SETTINGS_UPDATED',
        entity: 'SystemSetting',
        entityId: key,
        description: `Setting "${key}" updated`,
      },
    });

    return NextResponse.json({ success: true, message: 'Setting saved' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin settings update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update setting' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { searchParams } = new URL(request.url);
    const key = cleanString(searchParams.get('key'), 128, { required: true });

    // Guarded delete: a missing key is a 404 rather than a thrown P2025 -> 500.
    const { count } = await prisma.systemSetting.deleteMany({ where: { key } });
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Setting not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Setting deleted' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin settings delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete setting' }, { status: 500 });
  }
}
