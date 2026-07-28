import { NextRequest, NextResponse } from 'next/server';
import { DocumentEngine } from '@/lib/engine/document-engine';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(_request.url);
    const password = searchParams.get('password') || undefined;

    const result = await DocumentEngine.getSharedDocument(token, password);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Share access error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to access shared document' },
      { status: 500 }
    );
  }
}
