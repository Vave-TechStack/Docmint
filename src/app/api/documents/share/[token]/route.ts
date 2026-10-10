import { NextRequest, NextResponse } from 'next/server';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { cleanString } from '@/lib/security/request';
import {
  SHARE_PASSWORD_MAX_ATTEMPTS,
  SHARE_PASSWORD_WINDOW_MS,
  sharePasswordRateLimitKeys,
} from '@/lib/security/share-limit';

export const dynamic = 'force-dynamic';

function errorStatus(error: string): number {
  switch (error) {
    case 'Share link not found':
    case 'This share link has been revoked':
      return 404;
    case 'This share link has expired':
    case 'Maximum downloads reached':
      return 410;
    default:
      // Password errors (Invalid password, Password required) return 200 to preserve
      // the requiresPassword flow for the view endpoint.
      return 200;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(request.url);
    // Cap the submitted password: bcrypt ignores everything past 72 bytes, and
    // an unbounded value here is wasted work.
    const password = cleanString(searchParams.get('password'), 256) || undefined;

    // Throttle before any database work or bcrypt comparison.
    if (password) {
      const keys = sharePasswordRateLimitKeys(token, getClientIp(request));
      if (
        !checkRateLimit(keys.token, SHARE_PASSWORD_MAX_ATTEMPTS, SHARE_PASSWORD_WINDOW_MS) ||
        !checkRateLimit(keys.ip, SHARE_PASSWORD_MAX_ATTEMPTS * 4, SHARE_PASSWORD_WINDOW_MS)
      ) {
        return NextResponse.json(
          { success: false, error: 'Too many attempts. Try again later.' },
          { status: 429 }
        );
      }
    }

    const result = await DocumentEngine.getSharedDocument(token, password);

    // Map engine errors to appropriate HTTP status codes.
    if (!result.success) {
      return NextResponse.json(result, { status: errorStatus(result.error || '') });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Share access error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to access shared document' },
      { status: 500 }
    );
  }
}
