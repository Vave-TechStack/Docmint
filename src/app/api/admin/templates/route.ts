import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !ADMIN_ROLES.includes(session.user.role ?? '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const visibility = searchParams.get('visibility') || '';
    const mode = searchParams.get('mode') || '';

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ];
    }
    if (category) where.documentCategory = category;
    if (visibility) where.visibility = visibility;
    // Download-mode filter: instant = PUBLIC + non-premium, premium = flagged.
    if (mode === 'instant') {
      where.visibility = 'PUBLIC';
      where.isPremium = false;
    } else if (mode === 'premium') {
      where.isPremium = true;
    }

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.template.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        documentCategory: t.documentCategory,
        visibility: t.visibility,
        isPremium: t.isPremium,
        // Derived download mode for display + admin switching. Legacy rows may
        // still carry visibility='PREMIUM' — treat that as the premium flag.
        mode: t.isPremium || t.visibility === 'PREMIUM'
          ? 'premium'
          : t.visibility === 'PUBLIC'
            ? 'instant'
            : t.visibility.toLowerCase(),
        isActive: t.isActive,
        isDefault: t.isDefault,
        usageCount: t.usageCount,
        version: t.version,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        user: t.user,
        organization: t.organization,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Admin templates list error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch templates' }, { status: 500 });
  }
}
