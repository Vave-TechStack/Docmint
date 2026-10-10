import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserScope } from '@/lib/security/authorization';
import { assertSameOrigin, readJsonBody, cleanString, ValidationError } from '@/lib/security/request';

export async function GET(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  try {
    const folders = await prisma.folder.findMany({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
      },
      include: {
        _count: { select: { documents: true } },
      },
      orderBy: { displayOrder: 'asc' },
    });

    return NextResponse.json({ success: true, data: folders });
  } catch (error) {
    console.error('Folders list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch folders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const name = cleanString(body.name, 120, { required: true });

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Folder name is required' },
        { status: 400 }
      );
    }

    /**
     * `parentId` is a self-relation. It was previously copied straight from the
     * body, so a caller could set it to a folder id belonging to another
     * organization (or another user in this one) and graft their subtree onto
     * it. Verify the parent exists within the caller's own scope first.
     */
    const parentId = cleanString(body.parentId, 64);
    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, organizationId: scope.organizationId, userId: scope.userId },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: 'Parent folder not found' },
          { status: 404 }
        );
      }
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'folder';

    const folder = await prisma.folder.create({
      data: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        name,
        slug: `${slug}-${Date.now().toString(36)}`,
        parentId: parentId || null,
        description: cleanString(body.description, 500) || null,
        color: cleanString(body.color, 32) || null,
        icon: cleanString(body.icon, 64) || null,
      },
    });

    return NextResponse.json({ success: true, data: folder });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Folder creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}
