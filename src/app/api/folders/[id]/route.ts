import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserScope } from '@/lib/security/authorization';
import { assertSameOrigin, readJsonBody, cleanString, ValidationError } from '@/lib/security/request';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;
    const body = await readJsonBody(request);

    const folder = await prisma.folder.findFirst({
      where: { id, organizationId: scope.organizationId, userId: scope.userId },
      select: { id: true },
    });

    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 });
    }

    // `color` and `icon` are rendered into the UI as style values, so they are
    // length-capped and control-character stripped rather than passed through.
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = cleanString(body.name, 120, { required: true });
    if (body.description !== undefined) data.description = cleanString(body.description, 500) || null;
    if (body.color !== undefined) data.color = cleanString(body.color, 32) || null;
    if (body.icon !== undefined) data.icon = cleanString(body.icon, 64) || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Folder update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update folder' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;

    const folder = await prisma.folder.findFirst({
      where: { id, organizationId: scope.organizationId, userId: scope.userId },
      select: { id: true },
    });

    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 });
    }

    // Move documents to root before deleting folder. Scoped to the caller's org
    // so a delete can never reach across tenants.
    await prisma.document.updateMany({
      where: { folderId: folder.id, organizationId: scope.organizationId },
      data: { folderId: null },
    });

    // Re-parent any child folders instead of orphaning them: the self-relation
    // has no cascade, so a delete with children would otherwise fail or leave
    // them pointing at a row that no longer exists.
    await prisma.folder.updateMany({
      where: { parentId: folder.id, organizationId: scope.organizationId, userId: scope.userId },
      data: { parentId: null },
    });

    await prisma.folder.delete({ where: { id: folder.id } });

    return NextResponse.json({ success: true, message: 'Folder deleted' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Folder delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete folder' },
      { status: 500 }
    );
  }
}
