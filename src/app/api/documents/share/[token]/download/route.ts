import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DocumentEngine, extractBodyContent } from '@/lib/engine/document-engine';
import { replaceSvgDataUris } from '@/lib/utils/image-placeholders';
import { sanitizeHtmlFragment } from '@/lib/security/sanitize-html';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  SHARE_PASSWORD_MAX_ATTEMPTS,
  SHARE_PASSWORD_WINDOW_MS,
  sharePasswordRateLimitKeys,
} from '@/lib/security/share-limit';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Verify share is valid
    const share = await prisma.documentShare.findUnique({
      where: { token },
      include: {
        document: {
          select: { id: true, title: true, htmlContent: true, organizationId: true, deletedAt: true, status: true },
        },
      },
    });

    if (!share || !share.isActive) {
      return NextResponse.json(
        { success: false, error: 'Share link not found or revoked' },
        { status: 404 }
      );
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Share link has expired' },
        { status: 410 }
      );
    }

    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
      return NextResponse.json(
        { success: false, error: 'Maximum downloads reached' },
        { status: 410 }
      );
    }

    // Defense in depth: reject if the underlying document has been soft-deleted
    if (!share.document || share.document.deletedAt || share.document.status === 'DELETED') {
      return NextResponse.json(
        { success: false, error: 'Share link not found or revoked' },
        { status: 404 }
      );
    }

    // ─── Password gate ───
    // The view route verifies the share password, so the download endpoint
    // must too — otherwise a password-protected share could be downloaded by
    // anyone holding the token (the whole point of the password is defeated).
    const body = (await request.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';

    if (share.password) {
      if (!password) {
        return NextResponse.json(
          {
            success: false,
            error: 'Password required to download this document',
            requiresPassword: true,
          },
          { status: 401 }
        );
      }

      /**
       * Throttle guesses before running bcrypt.
       *
       * This endpoint is public and the token is the only secret, so without
       * a budget the share password was brute-forceable at network speed. The
       * budget is keyed on the share token and the client IP together: per-token
       * alone lets one attacker lock out the legitimate recipient, per-IP alone
       * does not stop a distributed attempt.
       */
      const clientIp = getClientIp(request);
      const keys = sharePasswordRateLimitKeys(share.token, clientIp);
      if (
        !checkRateLimit(keys.token, SHARE_PASSWORD_MAX_ATTEMPTS, SHARE_PASSWORD_WINDOW_MS) ||
        !checkRateLimit(keys.ip, SHARE_PASSWORD_MAX_ATTEMPTS * 4, SHARE_PASSWORD_WINDOW_MS)
      ) {
        return NextResponse.json(
          { success: false, error: 'Too many attempts. Try again later.' },
          { status: 429 }
        );
      }

      const valid = await DocumentEngine.verifySharePassword(password, share.password);
      if (!valid) {
        return NextResponse.json(
          { success: false, error: 'Invalid password' },
          { status: 401 }
        );
      }
    }

    if (!share.document.htmlContent) {
      return NextResponse.json(
        { success: false, error: 'Document has no content' },
        { status: 400 }
      );
    }

    // Generate PDF from HTML with 0.5in (12.7mm) margins on A4
    let html = share.document.htmlContent;

    // Strip outer <html>/<body> boilerplate to avoid invalid nested HTML
    html = extractBodyContent(html);

    /**
     * Sanitize before anything else.
     *
     * The document body is attacker-controlled (template HTML plus raw
     * interpolation of document variable values) and this response is served
     * as `text/html` from the DocMint origin, unsandboxed — a public share
     * link was a stored-XSS endpoint that ran script in every visitor's
     * session. The sanitizer must run *before* SVG inlining, because
     * `replaceSvgDataUris` promotes an inert <img src="data:image/svg+xml"> to
     * live inline <svg>; the onerror handler below is added afterwards so the
     * application's own attribute is never stripped.
     */
    html = sanitizeHtmlFragment(html);

    /**
     * Convert SVG data URI <img> tags to inline <svg> elements.
     *
     * Chrome/Chromium cannot load SVG data URIs in <img> tags inside
     * sandboxed iframes (sandbox="allow-same-origin"), causing persistent
     * "Error loading svg data:..." console errors. Converting to inline
     * <svg> eliminates the loading step — SVGs render directly in the DOM.
     * Each inlined payload is independently sanitized by `cleanSvgMarkup`.
     *
     * @see replaceSvgDataUris in lib/utils/image-placeholders.ts
     */
    html = replaceSvgDataUris(html);

    // Add onerror fallback to remaining img tags for non-SVG broken images
    html = html.replace(
      /(<img\s[^>]*?)(?:(\s+onerror\s*=\s*['"][^'"]*['"]))?([^>]*>)/gi,
      (match, before, existingOnerror, after) => {
        if (existingOnerror) return match;
        return `${before} onerror="this.style.display='none'"${after}`;
      }
    );

    const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body {
            font-family: 'Inter', Arial, sans-serif;
            padding: 12.7mm;
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            line-height: 1.6;
            color: #333;
            overflow: hidden;
            word-wrap: break-word;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          h1, h2, h3 { color: #111; margin-top: 16px; margin-bottom: 8px; }
          p { margin-bottom: 8px; }
          table { border-collapse: collapse; width: 100%; margin: 12px 0; table-layout: fixed; }
          td, th { border: 1px solid #ddd; padding: 6px 8px; text-align: left; word-wrap: break-word; }
          th { background: #f8f9fa; font-weight: 600; }
          img { max-width: 100%; height: auto; }
          .page-content { max-width: 184.6mm; margin: 0 auto; }
          @media print { body { padding: 12.7mm; overflow: visible; } }
        </style>
      </head>
      <body><div class="page-content">${html}</div></body>
      </html>
    `;

    // For now return HTML, in production use PDF generation
    //
    // The counter is claimed atomically inside recordShareDownload, so the
    // maxDownloads limit is enforced by the database rather than by the
    // racy read at the top of this handler. If the allowance was consumed by a
    // concurrent request in the meantime, nothing is served.
    const recorded = await DocumentEngine.recordShareDownload(token);
    if (!recorded) {
      return NextResponse.json(
        { success: false, error: 'Maximum downloads reached' },
        { status: 410 }
      );
    }

    return new NextResponse(styledHtml, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${share.document.title.replace(/[^a-zA-Z0-9]/g, '_')}.html"`,
      },
    });
  } catch (error) {
    console.error('Share download error:', error);
    return NextResponse.json(
      { success: false, error: 'Download failed' },
      { status: 500 }
    );
  }
}
