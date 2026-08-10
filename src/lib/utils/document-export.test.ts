import { describe, it, expect } from 'vitest';
import { buildDocumentExportHtml } from './document-export';

const SAMPLE = `<p>First page content</p><div class="doc-page-break" data-auto="true"></div><p>Second page content</p>`;

describe('buildDocumentExportHtml', () => {
  it('wraps the fragment in a full document with a charset', () => {
    const html = buildDocumentExportHtml(SAMPLE);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<meta charset="utf-8"');
    expect(html).toContain('<body>');
  });

  it('preserves the original content', () => {
    const html = buildDocumentExportHtml(SAMPLE);
    expect(html).toContain('First page content');
    expect(html).toContain('Second page content');
    expect(html).toContain('class="doc-page-break"');
  });

  it('forces a real page break on the marker div (print + break-after)', () => {
    const html = buildDocumentExportHtml(SAMPLE);
    // css rule must use both legacy and modern break properties
    expect(html).toMatch(/\.doc-page-break\s*{[^}]*page-break-after:\s*always/);
    expect(html).toMatch(/\.doc-page-break\s*{[^}]*break-after:\s*page/);
  });

  it('collapses the marker to zero size so it takes no visible space', () => {
    const html = buildDocumentExportHtml(SAMPLE);
    expect(html).toMatch(/\.doc-page-break\s*{[^}]*height:\s*0/);
    expect(html).toMatch(/\.doc-page-break\s*{[^}]*margin:\s*0/);
  });

  it('hides the editor "New Page" pseudo-element label', () => {
    const html = buildDocumentExportHtml(SAMPLE);
    expect(html).toMatch(/\.doc-page-break::before/);
    expect(html).toMatch(/content:\s*none/);
  });

  it('includes base typography and table styles', () => {
    const html = buildDocumentExportHtml(SAMPLE);
    expect(html).toContain('font-family');
    expect(html).toMatch(/td,\s*th\s*{[^}]*border:\s*1px solid #ddd/);
  });

  it('handles empty input without crashing', () => {
    const html = buildDocumentExportHtml('');
    expect(html).toContain('<body></body>');
  });
});
