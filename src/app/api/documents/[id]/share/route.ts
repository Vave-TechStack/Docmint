import { NextRequest, NextResponse } from 'next/server';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { requireUserScope } from '@/lib/security/authorization';
import {
  assertSameOrigin,
  readJsonBody,
  isPlainObject,
  cleanString,
  boundedInt,
  ValidationError,
} from '@/lib/security/request';

const SHARE_TYPES = ['LINK', 'EMAIL', 'WHATSAPP'] as const;

/**
 * bcrypt silently ignores everything past the first 72 bytes of a password.
 * Without an explicit cap a caller can append junk to a weak password and the
 * tail contributes nothing to the hash, so the stored digest reflects a
 * shorter secret than the user believes they set.
 */
const MAX_SHARE_PASSWORD_BYTES = 72;
const MAX_SHARE_PASSWORD_CHARS = 128;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  try {
    const { id } = await params;
    const shares = await DocumentEngine.getShares(id, scope.organizationId);
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

    // `shareType` is a Prisma enum. It was previously passed through raw, so an
    // unknown value raised a database error surfaced as an opaque 500.
    const shareType = cleanString(body.shareType, 20).toUpperCase();
    if (!SHARE_TYPES.includes(shareType as (typeof SHARE_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: `shareType must be one of: ${SHARE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Reject out-of-range / non-numeric values rather than silently dropping
    // them: `maxDownloads: -1` would make every request report "maximum
    // downloads reached", and a negative expiry would mint an already-expired
    // link.
    const maxDownloads = boundedInt(body.maxDownloads, { min: 1, max: 1_000_000 });
    if (body.maxDownloads !== undefined && body.maxDownloads !== null && maxDownloads === undefined) {
      return NextResponse.json(
        { success: false, error: 'maxDownloads must be a whole number between 1 and 1000000' },
        { status: 400 }
      );
    }

    const expiresInDays = boundedInt(body.expiresInDays, { min: 1, max: 3650 });
    if (body.expiresInDays !== undefined && body.expiresInDays !== null && expiresInDays === undefined) {
      return NextResponse.json(
        { success: false, error: 'expiresInDays must be a whole number between 1 and 3650' },
        { status: 400 }
      );
    }

    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length > MAX_SHARE_PASSWORD_CHARS) {
      return NextResponse.json(
        { success: false, error: `Share password must be at most ${MAX_SHARE_PASSWORD_CHARS} characters` },
        { status: 400 }
      );
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_SHARE_PASSWORD_BYTES) {
      return NextResponse.json(
        { success: false, error: `Share password must be at most ${MAX_SHARE_PASSWORD_BYTES} bytes` },
        { status: 400 }
      );
    }

    const share = await DocumentEngine.createShare(id, scope.organizationId, scope.userId, {
      shareType: shareType as (typeof SHARE_TYPES)[number],
      recipient: cleanString(body.recipient, 200) || undefined,
      password: password || undefined,
      expiresInDays,
      maxDownloads,
    });

    return NextResponse.json({ success: true, data: share });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Share creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create share link' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { searchParams } = new URL(request.url);
    const shareId = cleanString(searchParams.get('shareId'), 64);

    if (!shareId) {
      return NextResponse.json(
        { success: false, error: 'shareId is required' },
        { status: 400 }
      );
    }

    await DocumentEngine.revokeShare(shareId, scope.organizationId);
    return NextResponse.json({ success: true, message: 'Share link revoked' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Share revoke error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revoke share link' },
      { status: 500 }
    );
  }
}
