import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const folders = await prisma.folder.findMany({
      where: {
        organizationId: session.user.organizationId,
        userId: session.user.id,
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
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, parentId } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Folder name is required' },
        { status: 400 }
      );
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const folder = await prisma.folder.create({
      data: {
        organizationId: session.user.organizationId,
        userId: session.user.id,
        name: name.trim(),
        slug: `${slug}-${Date.now()}`,
        parentId: parentId || null,
      },
    });

    return NextResponse.json({ success: true, data: folder });
  } catch (error) {
    console.error('Folder creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}
