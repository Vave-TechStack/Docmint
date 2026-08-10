'use client';

import type { DesignerDocument } from './types';

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

export function downloadHtml(html: string, filename: string) {
  downloadBlob(html, `${filename}.html`, 'text/html;charset=utf-8');
}

export function downloadDesignJson(document: DesignerDocument, filename?: string) {
  const name = filename || document.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'payslip';
  downloadBlob(JSON.stringify(document, null, 2), `${name}.json`, 'application/json;charset=utf-8');
}

/** Open the design in a new window and trigger the browser's print dialog. */
export function printDesign(html: string) {
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

/** Client-side PDF export via jsPDF's html() renderer (A4, 12.7mm margins). */
export async function exportPdf(html: string, title: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
  doc.setProperties({ title, creator: 'DocMint Payslip Designer' });
  await new Promise<void>((resolve, reject) => {
    try {
      doc.html(html, {
        callback: () => {
          doc.save(`${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'payslip'}.pdf`);
          resolve();
        },
        x: 15,
        y: 15,
        width: 180,
        windowWidth: 794,
        autoPaging: 'text',
        margin: [10, 10, 10, 10],
      });
    } catch (e) {
      reject(e);
    }
  });
}

/** DOCX export via the existing DocMint DOCXGenerator (HTML → .docx). */
export async function exportDocx(html: string, title: string): Promise<void> {
  const { DOCXGenerator } = await import('@/lib/docx/docx-generator');
  const buffer = await DOCXGenerator.generate(html, { title });
  downloadBlob(
    new Blob([buffer as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'payslip'}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

/** Read a file (JSON import / HTML open) as text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
