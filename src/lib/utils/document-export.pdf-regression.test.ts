/**
 * PDF export path regression tests.
 *
 * The PDF path is currently the highest-quality output DocMint produces, and
 * the DOCX defect class that was just fixed shows how easily a working path
 * can silently regress. These tests protect the parts of the PDF pipeline
 * that are pure and therefore verifiable in Node:
 *
 *  - buildDocumentExportHtml(), which supplies every CSS rule jsPDF needs to
 *    draw table borders, honour page-break markers and paginate.
 *  - PDFGenerator.getPageDimensions(), which drives page sizing.
 *  - cross-path consistency: the same resolved HTML must carry the same
 *    business content into the PDF wrapper and the DOCX writer.
 *
 * WHAT THIS DOES NOT COVER, deliberately
 * ---------------------------------------
 * jsPDF's `.html()` needs a browser DOM (it rasterises through html2canvas),
 * so the rendering itself cannot run under Vitest. Visual output — clipping,
 * overlap, font glyph coverage — is therefore NOT asserted here. That is
 * covered only by the Playwright suite in `e2e/`, which remains unexecuted
 * until it runs against a real HTTPS staging origin. Do not read a green run
 * of this file as evidence that a rendered PDF looks correct.
 */
import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'zlib';
import { buildDocumentExportHtml } from './document-export';
import { PDFGenerator } from '@/lib/pdf/pdf-generator';
import { DOCXGenerator } from '@/lib/docx/docx-generator';

function docxText(buffer: Buffer): string {
  const name = Buffer.from('word/document.xml', 'utf-8');
  const idx = buffer.indexOf(name);
  expect(idx).toBeGreaterThan(-1);
  let headerStart = -1;
  for (let i = idx; i >= Math.max(0, idx - 60); i -= 1) {
    if (buffer[i] === 0x50 && buffer[i+1] === 0x4b && buffer[i+2] === 0x03 && buffer[i+3] === 0x04) {
      headerStart = i;
      break;
    }
  }
  const nameLen = buffer.readUInt16LE(headerStart + 26);
  const extraLen = buffer.readUInt16LE(headerStart + 28);
  const xml = inflateRawSync(
    buffer.subarray(headerStart + 30 + nameLen + extraLen, headerStart + 30 + nameLen + extraLen + 2_000_000)
  ).toString('utf-8');
  const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) =>
      m[1]
        .replace(/&#x([0-9a-fA-F]+);/g, (_x, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_x, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&([a-z]+);/g, (m0, n) => ENT[n] ?? m0)
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAYSLIP_BODY = `<div>
  <h1>Acme Solutions Pvt Ltd</h1>
  <table>
    <tr><th>EARNINGS</th><th>AMOUNT</th></tr>
    <tr><td>Basic Salary</td><td>&#8377; 45,000</td></tr>
    <tr><td>Gross Earnings</td><td>&#8377; 45,000</td></tr>
  </table>
  <p>Bank: HDFC Bank &nbsp;|&nbsp; A/c No: 50200012345678</p>
  <div class="doc-page-break"></div>
  <p>Authorised signatory</p>
</div>`;

describe('buildDocumentExportHtml — the stylesheet jsPDF depends on', () => {
  const html = buildDocumentExportHtml(PAYSLIP_BODY);

  it('produces a complete standalone document', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain('</html>');
  });

  it('declares table borders so jsPDF draws a real table, not run-on text', () => {
    // This is the CSS the PDF path uses to render tables. The DOCX defect
    // class was tables collapsing into one line; if this rule is lost the PDF
    // path silently degrades the same way.
    expect(html).toMatch(/table\s*\{[^}]*border-collapse:\s*collapse/);
    expect(html).toMatch(/td,\s*th\s*\{[^}]*border:\s*1px solid/);
    expect(html).toMatch(/table\s*\{[^}]*width:\s*100%/);
  });

  it('turns the editor page-break marker into a real page break', () => {
    expect(html).toMatch(/\.doc-page-break\s*\{[^}]*page-break-after:\s*always/);
    expect(html).toContain('break-after: page');
  });

  it('forces print colour fidelity so brand colours survive', () => {
    expect(html).toContain('print-color-adjust: exact');
  });

  it('constrains the page so content is not rendered off-canvas', () => {
    expect(html).toMatch(/body\s*\{[^}]*max-width:\s*210mm/);
    expect(html).toMatch(/body\s*\{[^}]*padding:\s*12\.7mm/);
  });

  it('embeds the document body verbatim', () => {
    expect(html).toContain('Acme Solutions Pvt Ltd');
    expect(html).toContain('doc-page-break');
  });

  it('escapes nothing in the body it is handed, so callers must sanitise first', () => {
    // buildDocumentExportHtml is a wrapper, not a sanitiser. Callers pass
    // sanitised HTML; this test documents that contract explicitly rather
    // than leaving it implicit.
    const evil = buildDocumentExportHtml('<script>alert(1)</script>');
    expect(evil).toContain('<script>');
  });
});

describe('PDFGenerator.getPageDimensions', () => {
  it('returns A4 portrait dimensions', () => {
    expect(PDFGenerator.getPageDimensions({ size: 'A4', orientation: 'portrait' } as never))
      .toEqual({ width: 210, height: 297 });
  });

  it('swaps axes for landscape', () => {
    expect(PDFGenerator.getPageDimensions({ size: 'A4', orientation: 'landscape' } as never))
      .toEqual({ width: 297, height: 210 });
  });

  it('supports the other advertised page sizes', () => {
    expect(PDFGenerator.getPageDimensions({ size: 'A3', orientation: 'portrait' } as never))
      .toEqual({ width: 297, height: 420 });
    expect(PDFGenerator.getPageDimensions({ size: 'A5', orientation: 'portrait' } as never))
      .toEqual({ width: 148, height: 210 });
    expect(PDFGenerator.getPageDimensions({ size: 'LETTER', orientation: 'portrait' } as never))
      .toEqual({ width: 215.9, height: 279.4 });
    expect(PDFGenerator.getPageDimensions({ size: 'LEGAL', orientation: 'portrait' } as never))
      .toEqual({ width: 215.9, height: 355.6 });
  });

  it('falls back to A4 for an unknown size rather than producing NaN', () => {
    expect(PDFGenerator.getPageDimensions({ size: 'BOGUS', orientation: 'portrait' } as never))
      .toEqual({ width: 210, height: 297 });
  });
});

describe('PDF and DOCX carry the same business content', () => {
  it('keeps every business field present in both outputs', async () => {
    const wrapped = buildDocumentExportHtml(PAYSLIP_BODY);
    const docx = docxText(await DOCXGenerator.generate(PAYSLIP_BODY, { title: 'Payslip' }));

    // Fields that must survive into the DOCX path.
    for (const field of ['Acme Solutions Pvt Ltd', 'Basic Salary', '45,000', 'Gross Earnings', 'HDFC Bank', '50200012345678']) {
      expect(docx, `missing from DOCX: ${field}`).toContain(field);
      expect(wrapped, `missing from PDF wrapper: ${field}`).toContain(field);
    }

// The rupee sign must survive both paths, each in the form that path
// produces. The DOCX writer decodes the entity into a literal glyph; the PDF
    // wrapper passes HTML through untouched so the browser decodes it at
    // render time. \u20B9 is used rather than a literal glyph so the
    // assertion cannot be corrupted by a file-encoding round trip.
    const RUPEE = '\u20B9';
    expect(docx).toContain(RUPEE);
    expect(docx).not.toContain('&amp;nbsp;');
    expect(wrapped).toContain('&#8377;');
    expect(wrapped).not.toContain('{{');
  });

  it('renders the table structure identically in intent for both paths', async () => {
    const wrapped = buildDocumentExportHtml(PAYSLIP_BODY);
    expect((wrapped.match(/<table/gi) || []).length).toBe(1);

    const buf = await DOCXGenerator.generate(PAYSLIP_BODY, { title: 'Payslip' });
    const name = Buffer.from('word/document.xml', 'utf-8');
    const idx = buf.indexOf(name);
    let hs = -1;
    for (let i = idx; i >= Math.max(0, idx - 60); i -= 1) {
      if (buf[i] === 0x50 && buf[i+1] === 0x4b && buf[i+2] === 0x03 && buf[i+3] === 0x04) { hs = i; break; }
    }
    const nl = buf.readUInt16LE(hs + 26);
    const el = buf.readUInt16LE(hs + 28);
    const xml = inflateRawSync(buf.subarray(hs + 30 + nl + el, hs + 30 + nl + el + 2_000_000)).toString('utf-8');
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(1);
  });
});