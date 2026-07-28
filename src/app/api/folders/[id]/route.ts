import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const folder = await prisma.folder.findFirst({
      where: { id, organizationId: session.user.organizationId, userId: session.user.id },
    });

    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 });
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: {
        name: body.name?.trim() || undefined,
        description: body.description !== undefined ? body.description : undefined,
        color: body.color !== undefined ? body.color : undefined,
        icon: body.icon !== undefined ? body.icon : undefined,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Folder update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update folder' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const folder = await prisma.folder.findFirst({
      where: { id, organizationId: session.user.organizationId, userId: session.user.id },
    });

    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 });
    }

    // Move documents to root before deleting folder
    await prisma.document.updateMany({
      where: { folderId: id, organizationId: session.user.organizationId },
      data: { folderId: null },
    });

    await prisma.folder.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Folder deleted' });
  } catch (error) {
    console.error('Folder delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete folder' },
      { status: 500 }
    );
  }
}
