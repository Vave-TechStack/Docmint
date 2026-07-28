import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { DocumentEngine } from '@/lib/engine/document-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const document = await DocumentEngine.getById(id, session.user.organizationId);
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
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const document = await DocumentEngine.update(
      id,
      body,
      session.user.organizationId,
      session.user.id
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
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await DocumentEngine.delete(id, session.user.organizationId, session.user.id);

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const document = await DocumentEngine.duplicate(id, session.user.organizationId, session.user.id);

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error('Document duplicate error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to duplicate document' },
      { status: 500 }
    );
  }
}
