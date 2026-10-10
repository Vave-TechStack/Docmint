import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserScope } from '@/lib/security/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  try {
    const documents = await prisma.document.findMany({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        deletedAt: null,
      },
      // Only the tag column is needed, and an unbounded row count is a
      // needless full scan of the tenant's document table on every keystroke.
      select: { tags: true },
    });

    // Aggregate all unique tags
    const tagCounts = new Map<string, number>();
    for (const doc of documents) {
      for (const tag of doc.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const tags = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    console.error('Tags list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}
