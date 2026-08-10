import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { DocumentEngine } from '@/lib/engine/document-engine';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const options = {
      status: searchParams.get('status') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      folderId: searchParams.get('folderId') || undefined,
      isFavorite: searchParams.get('isFavorite') === 'true' ? true : undefined,
      isArchived: searchParams.get('isArchived') === 'true' ? true : undefined,
      search: searchParams.get('search') || undefined,
      tags: searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '20'),
      sortBy: searchParams.get('sortBy') || 'updatedAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    };

    const orgId = session.user.organizationId!;
    const result = await DocumentEngine.list(
      orgId,
      session.user.id,
      options
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Documents list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch documents' },
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
    const document = await DocumentEngine.create(
      body,
      session.user.organizationId!,
      session.user.id
    );

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error('Document creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create document' },
      { status: 500 }
    );
  }
}
