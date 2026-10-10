import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/security/authorization';
import { parsePagination, enumValue, cleanString } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const TEMPLATE_VISIBILITIES = ['PUBLIC', 'PRIVATE', 'ORGANIZATION', 'PREMIUM', 'AI'] as const;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePagination(searchParams, 20);
    const search = cleanString(searchParams.get('search'), 120);
    const category = cleanString(searchParams.get('category'), 64);
    const visibility = enumValue(searchParams.get('visibility') ?? '', TEMPLATE_VISIBILITIES);
    const mode = searchParams.get('mode') ?? '';

    const where: Record<string, unknown> = {};

    /**
     * Tenant scoping: `Template.organizationId` is nullable (platform-seeded
     * rows), so the scope is "my own org OR platform-owned". Without this a
     * tenant admin browsed every other tenant's PRIVATE and ORGANIZATION
     * templates — including their unreleased designs and variable schemas.
     * A platform super admin still sees everything.
     */
    if (!guard.guard.isSuperAdmin || guard.guard.organizationId) {
      where.OR = [{ organizationId: guard.guard.organizationId }, { organizationId: null }];
    }

    if (search) {
      where.AND = [
        { OR: where.OR },
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        },
      ];
      delete where.OR;
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
        skip,
        take,
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
