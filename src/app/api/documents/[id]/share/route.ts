import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { DocumentEngine } from '@/lib/engine/document-engine';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const shares = await DocumentEngine.getShares(id, session.user.organizationId);
    return NextResponse.json({ success: true, data: shares });
  } catch (error) {
    console.error('Shares list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shares' },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const share = await DocumentEngine.createShare(
      id,
      session.user.organizationId,
      session.user.id,
      {
        shareType: body.shareType || 'LINK',
        recipient: body.recipient,
        password: body.password,
        expiresInDays: body.expiresInDays ? parseInt(body.expiresInDays) : undefined,
        maxDownloads: body.maxDownloads ? parseInt(body.maxDownloads) : undefined,
      }
    );

    return NextResponse.json({ success: true, data: share });
  } catch (error) {
    console.error('Share creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create share link' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('shareId');

    if (!shareId) {
      return NextResponse.json(
        { success: false, error: 'shareId is required' },
        { status: 400 }
      );
    }

    await DocumentEngine.revokeShare(shareId, session.user.organizationId);
    return NextResponse.json({ success: true, message: 'Share link revoked' });
  } catch (error) {
    console.error('Share revoke error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revoke share link' },
      { status: 500 }
    );
  }
}
