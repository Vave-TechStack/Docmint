'use client';

import { replaceSvgDataUris, rasterizeSvgPlaceholders } from '@/lib/utils/image-placeholders';

function downloadBlob(content: Blob | string, filename: string, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeFileName(title: string, fallback: string): string {
  const name = title.replace(/[^\w-]+/g, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '');
  return name || fallback;
}

/**
 * Wrap the editor's content fragment in a standalone, styled document.
 *
 * The editor stores its auto/manual page breaks as `<div class="doc-page-break">`
 * markers. This wrapper adds print CSS that:
 *   • turns each marker into a REAL page break in every renderer that honors
 *     `page-break-after` / `break-after` (jsPDF doc.html(), browser print);
 *   • collapses the marker to zero size (it must stay in the layout — jsPDF's
 *     break detection reads computed styles, so `display:none` would skip it);
 *   • hides the editor's dashed "New Page" separator / label.
 */
export function buildDocumentExportHtml(html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', Arial, sans-serif;
      padding: 12.7mm;
      max-width: 210mm;
      margin: 0 auto;
      line-height: 1.6;
      color: #333;
      word-wrap: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3 { color: #111; margin-top: 16px; margin-bottom: 8px; }
    p { margin-bottom: 8px; }
    ul, ol { margin: 8px 0; padding-left: 24px; }
    blockquote { border-left: 3px solid #e5e7eb; padding-left: 12px; color: #6b7280; margin: 8px 0; }
    code { background: #f3f4f6; padding: 1px 4px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; table-layout: fixed; }
    td, th { border: 1px solid #ddd; padding: 6px 8px; text-align: left; word-wrap: break-word; }
    th { background: #f8f9fa; font-weight: 600; }
    img { max-width: 100%; height: auto; }

    /* Editor page-break markers become real page breaks */
    .doc-page-break {
      page-break-after: always;
      break-after: page;
      height: 0;
      margin: 0;
      border: 0;
    }
    .doc-page-break::before,
    .doc-page-break::after { content: none; display: none; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

/**
 * Client-side PDF export for documents (jsPDF doc.html() → html2canvas).
 *
 * Runs the same SVG-safe pipeline as the template/instant flows: SVG data
 * URIs and inline SVGs are rasterized to PNGs because html2canvas cannot load
 * SVG images in any form. Falls back to the browser print dialog if jsPDF
 * hangs (large docs / data URIs), mirroring the template page behavior.
 */
export async function exportDocumentPdf(html: string, title: string): Promise<void> {
  let safeHtml = replaceSvgDataUris(html || '');
  safeHtml = await rasterizeSvgPlaceholders(safeHtml);
  safeHtml = safeHtml.replace(
    /(<img\s[^>]*?)(?:(\s+onerror\s*=\s*['"][^'"]*['"]))?([^>]*>)/gi,
    (match, before, existingOnerror, after) => {
      if (existingOnerror) return match;
      return `${before} onerror="this.style.display='none'"${after}`;
    }
  );

  const fullHtml = buildDocumentExportHtml(safeHtml);
  const fileName = `${safeFileName(title, 'document')}.pdf`;
  const { jsPDF } = await import('jspdf');

  return new Promise((resolve) => {
    let resolved = false;
    const fallbackToPrint = () => {
      if (resolved) return;
      resolved = true;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
      resolve();
    };
    const timeout = setTimeout(fallbackToPrint, 15000);
    try {
      const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
      doc.setProperties({ title, creator: 'DocMint' });
      doc.html(fullHtml, {
        callback: (d) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;
          try {
            const pdfBlob = d.output('blob');
            downloadBlob(pdfBlob, fileName, 'application/pdf');
            resolve();
          } catch {
            fallbackToPrint();
          }
        },
        // Body padding (12.7mm) already provides the margin in the rendered
        // HTML — a jsPDF margin on top would double it to ~25mm.
        x: 0,
        y: 0,
        width: 210,
        windowWidth: 794,
        autoPaging: 'text',
        margin: [0, 0, 0, 0],
      });
    } catch {
      clearTimeout(timeout);
      fallbackToPrint();
    }
  });
}

/** DOCX export for documents via the shared HTML → .docx generator. */
export async function exportDocumentDocx(html: string, title: string): Promise<void> {
  const { DOCXGenerator } = await import('@/lib/docx/docx-generator');
  const buffer = await DOCXGenerator.generate(html || '', { title });
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  downloadBlob(
    blob,
    `${safeFileName(title, 'document')}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

/** Standalone HTML export for documents (styled, page-break markers intact). */
export function exportDocumentHtml(html: string, title: string): void {
  downloadBlob(
    buildDocumentExportHtml(html || ''),
    `${safeFileName(title, 'document')}.html`,
    'text/html;charset=utf-8'
  );
}
