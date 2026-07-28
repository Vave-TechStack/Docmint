import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DocumentEngine } from '@/lib/engine/document-engine';

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

    // Generate PDF from HTML
    const html = share.document.htmlContent;
    const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Inter', Arial, sans-serif; padding: 40px; line-height: 1.6; color: #333; }
          h1, h2, h3 { color: #111; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #ddd; padding: 8px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>${html}</body>
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
