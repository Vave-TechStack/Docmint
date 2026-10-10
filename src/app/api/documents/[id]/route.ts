import { NextRequest, NextResponse } from 'next/server';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { requireUserScope } from '@/lib/security/authorization';
import { assertSameOrigin, readJsonBody, isPlainObject } from '@/lib/security/request';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  try {
    const { id } = await params;
    const document = await DocumentEngine.getById(id, scope.organizationId);
    if (!document) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error('Document fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

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
    if (!isPlainObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const document = await DocumentEngine.update(
      id,
      body,
      scope.organizationId,
      scope.userId
    );

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error('Document update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update document' },
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
    await DocumentEngine.delete(id, scope.organizationId, scope.userId);

    return NextResponse.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('Document delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;
    const document = await DocumentEngine.duplicate(id, scope.organizationId, scope.userId);

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error('Document duplicate error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to duplicate document' },
      { status: 500 }
    );
  }
}
