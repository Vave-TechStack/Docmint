import { NextRequest, NextResponse } from 'next/server';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { requireUserScope } from '@/lib/security/authorization';
import { readJsonBody, assertSameOrigin, isPlainObject } from '@/lib/security/request';

export async function GET(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  try {
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

    const result = await DocumentEngine.list(scope.organizationId, scope.userId, options);

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
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    if (!isPlainObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    /**
     * `DocumentCreateInput` requires a title and a document type. The old code
     * passed the raw `request.json()` result straight through, so the compiler
     * never checked the shape and a body missing `title` reached the engine.
     * Validate the two required fields here rather than trusting the client.
     */
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : '';
    if (!title || title.length > 200) {
      return NextResponse.json({ success: false, error: 'A valid title is required' }, { status: 400 });
    }
    if (!documentType || documentType.length > 64) {
      return NextResponse.json({ success: false, error: 'A valid documentType is required' }, { status: 400 });
    }

    const document = await DocumentEngine.create(
      { ...body, title, documentType } as Parameters<typeof DocumentEngine.create>[0],
      scope.organizationId,
      scope.userId
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
