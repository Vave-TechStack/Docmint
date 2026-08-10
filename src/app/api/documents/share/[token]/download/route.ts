import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DocumentEngine, extractBodyContent } from '@/lib/engine/document-engine';
import { replaceSvgDataUris } from '@/lib/utils/image-placeholders';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Verify share is valid
    const share = await prisma.documentShare.findUnique({
      where: { token },
      include: {
        document: {
          select: { id: true, title: true, htmlContent: true, organizationId: true },
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
     * Convert SVG data URI <img> tags to inline <svg> elements.
     *
     * Chrome/Chromium cannot load SVG data URIs in <img> tags inside
     * sandboxed iframes (sandbox="allow-same-origin"), causing persistent
     * "Error loading svg data:..." console errors. Converting to inline
     * <svg> eliminates the loading step — SVGs render directly in the DOM.
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
    await DocumentEngine.recordShareDownload(token);

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
