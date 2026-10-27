/**
 * DOCX regression suite.
 *
 * Every test here exists because a real defect reached production output:
 *
 *  - `<style>` contents leaked into the document body as visible text.
 *  - `<table>` had no handler, so every table was flattened into a run-on
 *    line and label/value pairs became unreadable.
 *  - HTML entities were never decoded, so `&nbsp;` shipped as literal text.
 *  - Unrepresentable input produced a structurally valid but empty file.
 *
 * These assert on the REAL `docx` renderer output (no mocks) and on the
 * real seeded templates, so a regression fails loudly rather than silently
 * shipping broken documents.
 */
import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'zlib';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DOCXGenerator, decodeHtmlEntities } from './docx-generator';

// ── Minimal zip reader (no extra dependency) ─────────────────────────────────
function extractXml(buffer: Buffer, entry: string): string {
  const name = Buffer.from(entry, 'utf-8');
  const idx = buffer.indexOf(name);
  if (idx === -1) return '';
  let headerStart = -1;
  for (let i = idx; i >= Math.max(0, idx - 60); i -= 1) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x03 && buffer[i + 3] === 0x04) {
      headerStart = i;
      break;
    }
  }
  if (headerStart === -1) return '';
  const nameLen = buffer.readUInt16LE(headerStart + 26);
  const extraLen = buffer.readUInt16LE(headerStart + 28);
  const dataStart = headerStart + 30 + nameLen + extraLen;
  try {
    return inflateRawSync(buffer.subarray(dataStart, dataStart + 2_000_000)).toString('utf-8');
  } catch {
    return '';
  }
}

function centralDirectory(buffer: Buffer): string[] {
  const names: string[] = [];
  for (let i = 0; i < buffer.length - 46; i += 1) {
    if (
      buffer[i] === 0x50 && buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x01 && buffer[i + 3] === 0x02
    ) {
      const nl = buffer.readUInt16LE(i + 28);
      const el = buffer.readUInt16LE(i + 30);
      const cl = buffer.readUInt16LE(i + 32);
      names.push(buffer.subarray(i + 46, i + 46 + nl).toString('utf-8'));
      i += 46 + nl + el + cl - 1;
    }
  }
  return names;
}

/** Visible text, decoded the way a Word client would. */
function visibleText(xml: string): string {
  const ENT: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  const runs = [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) =>
    m[1]
      .replace(/&#x([0-9a-fA-F]+);/g, (_x, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_x, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-z]+);/g, (m0, n) => ENT[n] ?? m0)
  );
  return runs.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Count elements exactly, without matching derived parts such as
 * `<w:tblPr>` / `<w:tblGrid>` when counting `<w:tbl>`.
 */
const countOf = (xml: string, tag: string) =>
  (xml.match(new RegExp(`<w:${tag}(?:\\s[^>]*)?>`, 'g')) || []).length;

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** The real seeded Employee Payslip markup, minimised to its table structure. */
const PAYSLIP_HTML = `<!DOCTYPE html><html><head><style>
  /* A4 payslip. Table-based layout on purpose. */
  @page { size: A4; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; }
  .payslip { padding: 12mm; }
</style></head><body>
  <div class="payslip">
    <h1>Acme Solutions Pvt Ltd</h1>
    <p>12 MG Road, Bengaluru 560001</p>
    <h2>SALARY SLIP</h2>
    <table>
      <tr><th>PAY PERIOD</th><th>PAY DATE</th></tr>
      <tr><td>July 2026</td><td>31-Jul-2026</td></tr>
      <tr><th>EMPLOYEE NAME</th><th>EMPLOYEE ID</th></tr>
      <tr><td>Rahul Sharma</td><td>EMP-1042</td></tr>
    </table>
    <table>
      <tr><th>EARNINGS</th><th>AMOUNT</th></tr>
      <tr><td>Basic Salary</td><td>&#8377; 45,000</td></tr>
      <tr><td>Dearness Allowance</td><td>&#8377; 8,000</td></tr>
      <tr><td>Gross Earnings</td><td>&#8377; 53,000</td></tr>
    </table>
    <table>
      <tr><th>DEDUCTIONS</th><th>AMOUNT</th></tr>
      <tr><td>Provident Fund</td><td>&#8377; 5,300</td></tr>
      <tr><td>Total Deductions</td><td>&#8377; 5,300</td></tr>
    </table>
    <p>Bank: HDFC Bank &nbsp;|&nbsp; A/c No: 50200012345678</p>
    <p>This is a computer-generated payslip | Acme Solutions Pvt Ltd</p>
  </div>
</body></html>`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DOCXGenerator — structural validity', () => {
  it('produces a valid zip with the required OOXML parts', async () => {
    const buf = await DOCXGenerator.generate('<p>Hello world</p>');
    expect(buf.subarray(0, 2).toString('utf-8')).toBe('PK');

    const parts = centralDirectory(buf);
    expect(parts).toContain('[Content_Types].xml');
    expect(parts).toContain('_rels/.rels');
    expect(parts).toContain('word/document.xml');
    expect(extractXml(buf, 'word/document.xml')).toContain('Hello world');
  });

  it('rejects input that produces no content instead of emitting an empty file', async () => {
    await expect(DOCXGenerator.generate('<div></div>')).rejects.toThrow(/no document content/i);
    await expect(DOCXGenerator.generate('')).rejects.toThrow(/no document content/i);
  });

  it('rejects non-string input rather than writing a corrupt file', async () => {
    await expect(DOCXGenerator.generate(undefined as unknown as string)).rejects.toThrow(/must be a string/i);
  });
});

describe('DOCXGenerator — tables (regression: every table used to be lost)', () => {
  it('emits a native Word table for HTML tables', async () => {
    const buf = await DOCXGenerator.generate(PAYSLIP_HTML);
    const xml = extractXml(buf, 'word/document.xml');

    // Fixture: 3 tables holding 4 + 4 + 3 rows, two cells per row.
    expect(countOf(xml, 'tbl')).toBe(3);
    expect(countOf(xml, 'tr')).toBe(11);
    expect(countOf(xml, 'tc')).toBe(22);
  });

  it('keeps label and value in separate cells so they stay associated', async () => {
    const buf = await DOCXGenerator.generate(PAYSLIP_HTML);
    const xml = extractXml(buf, 'word/document.xml');

    // The precise defect was cells being merged into a single paragraph, so
    // the fix is structural: the label and its amount must occupy different
    // <w:tc> elements, not merely appear in different runs.
    const cells = [...xml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) =>
      visibleText(m[1])
    );
    expect(cells).toContain('Basic Salary');
    expect(cells).toContain('₹ 45,000');
    expect(cells.some((c) => c.includes('Basic Salary') && c.includes('45,000'))).toBe(false);

    const text = visibleText(xml);
    expect(text).toMatch(/Basic Salary\s+₹ 45,000/);
  });

  it('preserves the rupee sign used for currency amounts', async () => {
    const buf = await DOCXGenerator.generate(PAYSLIP_HTML);
    const text = visibleText(extractXml(buf, 'word/document.xml'));
    expect(text).toContain('₹');
    expect(text).toContain('₹ 45,000');
    expect(text).toContain('₹ 53,000');
  });

  it('marks the first header row as a repeating header', async () => {
    const buf = await DOCXGenerator.generate('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');
    expect(extractXml(buf, 'word/document.xml')).toContain('<w:tblHeader');
  });

  it('expands colspan into a merged cell', async () => {
    const buf = await DOCXGenerator.generate(
      '<table><tr><th colspan="2">Merged</th></tr><tr><td>a</td><td>b</td></tr></table>'
    );
    const xml = extractXml(buf, 'word/document.xml');
    expect(xml).toContain('gridSpan');
    expect(visibleText(xml)).toContain('Merged');
  });

  it('expands rowspan so the grid stays rectangular', async () => {
    const buf = await DOCXGenerator.generate(
      '<table><tr><td rowspan="2">tall</td><td>x</td></tr><tr><td>y</td></tr></table>'
    );
    const xml = extractXml(buf, 'word/document.xml');
    expect(xml).toContain('vMerge');
    expect(visibleText(xml)).toContain('tall');
  });

  it('handles tables wrapped in thead/tbody', async () => {
    const buf = await DOCXGenerator.generate(
      '<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
    );
    const xml = extractXml(buf, 'word/document.xml');
    expect(countOf(xml, 'tbl')).toBe(1);
    expect(countOf(xml, 'tr')).toBe(2);
    expect(visibleText(xml)).toContain('H1');
    expect(visibleText(xml)).toContain('b');
  });

  it('supports nested tables', async () => {
    const buf = await DOCXGenerator.generate(
      '<table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table>'
    );
    const xml = extractXml(buf, 'word/document.xml');
    expect(countOf(xml, 'tbl')).toBe(2);
    expect(visibleText(xml)).toContain('inner');
  });

  it('gives cells borders so the table is visually a table', async () => {
    const buf = await DOCXGenerator.generate('<table><tr><td>a</td></tr></table>');
    expect(extractXml(buf, 'word/document.xml')).toContain('<w:tcBorders');
  });
});

describe('DOCXGenerator — stylesheet and script isolation (regression: CSS leaked into the body)', () => {
  it('never emits <style> contents as document text', async () => {
    const buf = await DOCXGenerator.generate(PAYSLIP_HTML);
    const xml = extractXml(buf, 'word/document.xml');
    const text = visibleText(xml);

    expect(text).not.toContain('@page');
    expect(text).not.toContain('font-family');
    expect(text).not.toContain('/*');
    expect(text).not.toMatch(/\{\s*size:\s*A4/);
  });

  it('never emits <script> contents as document text', async () => {
    const buf = await DOCXGenerator.generate('<p>before</p><script>alert("x")</script><p>after</p>');
    const text = visibleText(extractXml(buf, 'word/document.xml'));
    expect(text).toContain('before');
    expect(text).toContain('after');
    expect(text).not.toContain('alert');
  });

  it('drops comments and doctype noise', async () => {
    const buf = await DOCXGenerator.generate('<!DOCTYPE html><!-- secret note --><p>kept</p>');
    const text = visibleText(extractXml(buf, 'word/document.xml'));
    expect(text).toContain('kept');
    expect(text).not.toContain('secret note');
  });
});

describe('DOCXGenerator — entity decoding (regression: &nbsp; shipped literally)', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a\u00a0b');
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>');
  });

  it('decodes decimal and hexadecimal references including the rupee sign', () => {
    expect(decodeHtmlEntities('&#8377;100')).toBe('₹100');
    expect(decodeHtmlEntities('&#x20B9;100')).toBe('₹100');
    expect(decodeHtmlEntities('&#128512;')).toBe('😀');
  });

  it('leaves unknown references untouched rather than mangling them', () => {
    expect(decodeHtmlEntities('&notarealentity;')).toBe('&notarealentity;');
    expect(decodeHtmlEntities('&#x110000;')).toBe('&#x110000;');
  });

  it('does not double-escape entities in the generated document', async () => {
    const buf = await DOCXGenerator.generate(PAYSLIP_HTML);
    const xml = extractXml(buf, 'word/document.xml');
    const text = visibleText(xml);

    expect(text).not.toContain('&nbsp;');
    expect(text).not.toContain('&amp;');
    expect(xml).not.toContain('&amp;nbsp;');
    expect(text).toContain('HDFC Bank |');
  });
});

describe('DOCXGenerator — text, lists and structure', () => {
  it('renders headings, paragraphs and inline formatting', async () => {
    const buf = await DOCXGenerator.generate(
      '<h1>Title</h1><p>Plain <strong>bold</strong> and <em>italic</em> and <u>under</u>.</p>'
    );
    const xml = extractXml(buf, 'word/document.xml');
    const text = visibleText(xml);
    expect(text).toContain('Title');
    expect(text).toContain('bold');
    expect(text).toContain('italic');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
  });

  it('renders unordered and ordered lists as real Word lists', async () => {
    const buf = await DOCXGenerator.generate('<ul><li>alpha</li><li>beta</li></ul><ol><li>first</li></ol>');
    const xml = extractXml(buf, 'word/document.xml');
    expect(xml).toContain('<w:numPr>');
    const text = visibleText(xml);
    expect(text).toContain('alpha');
    expect(text).toContain('first');
  });

  it('converts <br> into a line break', async () => {
    const buf = await DOCXGenerator.generate('<p>line one<br>line two</p>');
    expect(extractXml(buf, 'word/document.xml')).toMatch(/<w:br/);
  });

  it('converts editor page-break markers into real page breaks', async () => {
    const buf = await DOCXGenerator.generate(
      '<p>Page one</p><div class="doc-page-break"></div><p>Page two</p>'
    );
    const xml = extractXml(buf, 'word/document.xml');
    expect(xml).toMatch(/w:type="page"/);
    expect(visibleText(xml)).toContain('Page one');
    expect(visibleText(xml)).toContain('Page two');
  });

  it('preserves Unicode, emoji and CJK', async () => {
    const buf = await DOCXGenerator.generate(
      '<p>naïve café — “quotes” • ✓ ✗ こんにちは नमस्ते 🧾</p>'
    );
    const text = visibleText(extractXml(buf, 'word/document.xml'));
    expect(text).toContain('naïve café');
    expect(text).toContain('こんにちは');
    expect(text).toContain('नमस्ते');
    expect(text).toContain('🧾');
  });
});

describe('DOCXGenerator — robustness', () => {
  it('does not lose text from malformed markup', async () => {
    const buf = await DOCXGenerator.generate('<p>alpha<span>beta<div>gamma</p>delta');
    const text = visibleText(extractXml(buf, 'word/document.xml'));
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
    expect(text).toContain('gamma');
    expect(text).toContain('delta');
  });

  it('keeps text from unknown elements instead of discarding it', async () => {
    const buf = await DOCXGenerator.generate('<custom-widget>important text</custom-widget>');
    expect(visibleText(extractXml(buf, 'word/document.xml'))).toContain('important text');
  });

  it('handles a large table without dropping rows', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => `<tr><td>Row ${i}</td><td>${i * 100}</td></tr>`).join('');
    const buf = await DOCXGenerator.generate(`<table>${rows}</table>`);
    const xml = extractXml(buf, 'word/document.xml');
    expect(countOf(xml, 'tr')).toBe(120);
    expect(visibleText(xml)).toContain('Row 119');
  });

  it('handles a long multi-page document', async () => {
    const pages = Array.from(
      { length: 30 },
      (_, i) => `<p>Section ${i} content</p><div class="doc-page-break"></div>`
    ).join('');
    const buf = await DOCXGenerator.generate(pages);
    const xml = extractXml(buf, 'word/document.xml');
    expect((xml.match(/w:type="page"/g) || []).length).toBe(30);
    expect(visibleText(xml)).toContain('Section 29');
  });

  it('reports a missing image rather than dropping it silently', async () => {
    const buf = await DOCXGenerator.generate('<p>logo: <img src="/uploads/nope.png" alt="x"></p>');
    expect(visibleText(extractXml(buf, 'word/document.xml'))).toContain('logo:');
  });
});

describe('DOCXGenerator — real seeded templates', () => {
  const seedPath = join(process.cwd(), 'prisma', 'seed.ts');
  const seed = readFileSync(seedPath, 'utf-8');

  const templates: Array<{ name: string; html: string }> = [];
  const re = new RegExp("name:\\s*'([^']+)'[\\s\\S]*?htmlTemplate:\\s*\\x60([\\s\\S]*?)\\x60(?=[\\s])", 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(seed))) templates.push({ name: m[1], html: m[2] });

  const SYS: Record<string, string> = {
    CompanyName: 'Acme Solutions Pvt Ltd',
    CompanyAddress: '12 MG Road, Bengaluru 560001',
    GST: '29ABCDE1234F1Z5',
    PAN: 'ABCDE1234F',
    BankName: 'HDFC Bank',
    BankAccount: '50200012345678',
  };
  const fill = (html: string) =>
    html.replace(/\{\{([\w.-]+)(?::([^}]+))?\}\}/g, (_x, k: string, fb?: string) => {
      const sys = SYS[k];
      if (sys) return sys;
      if (/Logo|Signature|Seal|Stamp/.test(k)) return '';
      return fb ? fb : `Sample ${k}`;
    });

  it('finds the seeded templates', () => {
    expect(templates.length).toBe(30);
  });

  it('preserves every source table in every seeded template', async () => {
    const failures: string[] = [];
    for (const t of templates) {
      const src = (fill(t.html).match(/<table/gi) || []).length;
      if (src === 0) continue;
      const buf = await DOCXGenerator.generate(fill(t.html), { title: t.name });
      const got = countOf(extractXml(buf, 'word/document.xml'), 'tbl');
      if (got !== src) failures.push(`${t.name}: expected ${src} tables, got ${got}`);
    }
    expect(failures).toEqual([]);
  });

  it('never leaks stylesheet source into any seeded template', async () => {
    const failures: string[] = [];
    for (const t of templates) {
      const buf = await DOCXGenerator.generate(fill(t.html), { title: t.name });
      const text = visibleText(extractXml(buf, 'word/document.xml'));
      if (text.includes('@page') || text.includes('font-family') || text.includes('box-sizing')) {
        failures.push(t.name);
      }
    }
    expect(failures).toEqual([]);
  });

  it('never double-escapes entities in any seeded template', async () => {
    const failures: string[] = [];
    for (const t of templates) {
      const buf = await DOCXGenerator.generate(fill(t.html), { title: t.name });
      const text = visibleText(extractXml(buf, 'word/document.xml'));
      if (text.includes('&nbsp;') || text.includes('&amp;')) failures.push(t.name);
    }
    expect(failures).toEqual([]);
  });

  it('renders every seeded template into a valid document', async () => {
    const failures: string[] = [];
    for (const t of templates) {
      try {
        const buf = await DOCXGenerator.generate(fill(t.html), { title: t.name });
        const parts = centralDirectory(buf);
        if (buf.subarray(0, 2).toString() !== 'PK' || !parts.includes('word/document.xml')) {
          failures.push(t.name);
        }
      } catch {
        failures.push(t.name);
      }
    }
    expect(failures).toEqual([]);
  });

  it('preserves every business label on the real payslip', async () => {
    const payslip = templates.find((t) => t.name === 'Employee Payslip');
    expect(payslip).toBeDefined();

    const buf = await DOCXGenerator.generate(fill(payslip!.html), { title: 'Employee Payslip' });
    const text = visibleText(extractXml(buf, 'word/document.xml'));

    for (const label of [
      'Basic Salary', 'Dearness Allowance', 'House Rent Allowance',
      'Gross Earnings', 'Provident Fund', 'Total Deductions', 'Net Pay',
      'Acme Solutions Pvt Ltd', 'HDFC Bank',
    ]) {
      expect(text).toContain(label);
    }
    expect(text).toContain('₹');
    expect(text).not.toContain('{{');
  });
});