import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await prisma.systemSetting.findMany();
    const settingsMap: Record<string, unknown> = {};
    settings.forEach((s) => { settingsMap[s.key] = s.value; });

    return NextResponse.json({ success: true, data: settingsMap });
  } catch (error) {
    console.error('Admin settings fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { key, value, category } = body;

    if (!key) {
      return NextResponse.json({ success: false, error: 'Key is required' }, { status: 400 });
    }

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value, category: category || 'general' },
      create: { key, value, category: category || 'general' },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: session.user.organizationId ?? '',
        userId: session.user.id,
        action: 'SETTINGS_UPDATED',
        entity: 'SystemSetting',
        entityId: key,
        description: `Setting "${key}" updated`,
      },
    });

    return NextResponse.json({ success: true, message: 'Setting saved' });
  } catch (error) {
    console.error('Admin settings update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update setting' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (!key) {
      return NextResponse.json({ success: false, error: 'Key is required' }, { status: 400 });
    }

    await prisma.systemSetting.delete({ where: { key } });
    return NextResponse.json({ success: true, message: 'Setting deleted' });
  } catch (error) {
    console.error('Admin settings delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete setting' }, { status: 500 });
  }
}
