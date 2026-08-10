import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'zlib';
import { DOCXGenerator } from './docx-generator';

/**
 * Read a file from a .docx buffer (a zip archive) without extra deps:
 * scan the raw buffer for the entry name followed by its local header,
 * then locate the compressed data via the signature. Falls back to
 * returning '' when the entry can't be located.
 */
function extractXml(buffer: Buffer, entry: string): string {
  // Local file header: signature 'PK\x03\x04', then name length (2 bytes)
  // at offset 26 and extra length (2 bytes) at offset 28.
  const name = Buffer.from(entry, 'utf-8');
  const idx = buffer.indexOf(name);
  if (idx === -1) return '';
  // Walk backwards a little to find the local header signature before the name.
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
  // Compressed data starts right after; assume deflate (docx always uses it).
  const raw = buffer.subarray(dataStart, dataStart + 200000);
  try {
    return inflateRawSync(raw).toString('utf-8');
  } catch {
    return '';
  }
}

describe('DOCXGenerator page breaks', () => {
  it('generates a valid docx (zip magic) from plain HTML', async () => {
    const buffer = await DOCXGenerator.generate('<p>Hello world</p>');
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 2).toString('utf-8')).toBe('PK');
  });

  it('converts .doc-page-break divs into real Word page breaks', async () => {
    const buffer = await DOCXGenerator.generate(
      '<p>Page one</p><div class="doc-page-break" data-auto="true"></div><p>Page two</p>'
    );
    const xml = extractXml(buffer, 'word/document.xml');
    // A page break in WordML is <w:br w:type="page"/> inside a run
    expect(xml).toContain('Page one');
    expect(xml).toContain('Page two');
    expect(xml).toContain('w:br');
    expect(xml).toMatch(/w:type="page"/);
  });

  it('does not emit page breaks when there are no markers', async () => {
    const buffer = await DOCXGenerator.generate('<p>Only one page</p>');
    const xml = extractXml(buffer, 'word/document.xml');
    expect(xml).toContain('Only one page');
    expect(xml).not.toMatch(/w:type="page"/);
  });

  it('keeps content order around page-break markers', async () => {
    const buffer = await DOCXGenerator.generate(
      '<h2>Heading A</h2><div class="doc-page-break"></div><p>After break</p>'
    );
    const xml = extractXml(buffer, 'word/document.xml');
    expect(xml.indexOf('Heading A')).toBeLessThan(xml.indexOf('After break'));
  });
});
