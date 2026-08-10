import { describe, it, expect } from 'vitest';
import {
  buildCustomSectionsHtml,
  buildCustomHeaderHtml,
  buildCustomFieldsHtml,
  buildCustomFooterHtml,
  injectCustomSections,
  sanitizeCustomSections,
} from './custom-sections';

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('buildCustomSectionsHtml', () => {
  it('returns empty string for empty input', () => {
    expect(buildCustomSectionsHtml(undefined)).toBe('');
    expect(buildCustomSectionsHtml(null)).toBe('');
    expect(buildCustomSectionsHtml({})).toBe('');
    expect(buildCustomSectionsHtml({ logo: '', header: '', footer: '', fields: [] })).toBe('');
  });

  it('builds a header block with logo + text', () => {
    const html = buildCustomHeaderHtml({ logo: LOGO, header: 'Approved by Management' });
    expect(html).toContain('custom-header');
    expect(html).toContain('<img');
    expect(html).toContain('Approved by Management');
  });

  it('skips empty header pieces', () => {
    expect(buildCustomHeaderHtml({ header: '   ' })).toBe('');
    expect(buildCustomHeaderHtml({})).toBe('');
  });

  it('builds extra field rows', () => {
    const html = buildCustomFieldsHtml({
      fields: [
        { label: 'Reference', value: 'REF-2026-001' },
        { label: 'Note', value: 'Paid in full' },
      ],
    });
    expect(html).toContain('custom-fields');
    expect(html).toContain('REF-2026-001');
    expect(html).toContain('Paid in full');
  });

  it('ignores fields with missing label or value', () => {
    expect(
      buildCustomFieldsHtml({ fields: [{ label: '', value: 'x' }, { label: 'y', value: '' }] })
    ).toBe('');
  });

  it('builds a footer block', () => {
    const html = buildCustomFooterHtml({ footer: 'Computer generated document' });
    expect(html).toContain('custom-footer');
    expect(html).toContain('Computer generated document');
  });
});

describe('escaping', () => {
  it('escapes HTML in text values', () => {
    const html = buildCustomSectionsHtml({
      header: '<b>Header</b>',
      footer: '<script>alert(1)</script>',
      fields: [{ label: 'A&B', value: '"quoted" & <tag>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Header</b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Header&lt;/b&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('&lt;tag&gt;');
  });
});

describe('sanitizeCustomSections', () => {
  it('returns null for non-object payloads', () => {
    expect(sanitizeCustomSections(undefined)).toBeNull();
    expect(sanitizeCustomSections(null)).toBeNull();
    expect(sanitizeCustomSections('x')).toBeNull();
    expect(sanitizeCustomSections(42)).toBeNull();
    expect(sanitizeCustomSections([])).toBeNull();
  });

  it('keeps only string header/footer and data-URL logos', () => {
    const s = sanitizeCustomSections({
      logo: 'https://evil.example/x.png',
      header: 'H',
      footer: 42,
      fields: [],
    });
    expect(s).not.toBeNull();
    expect(s!.logo).toBeUndefined();
    expect(s!.header).toBe('H');
    expect(s!.footer).toBeUndefined();

    const withLogo = sanitizeCustomSections({ logo: LOGO, header: 'H' });
    expect(withLogo!.logo).toBe(LOGO);
  });

  it('coerces field values and caps the count', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: i, value: `v${i}` }));
    const s = sanitizeCustomSections({ fields: many });
    expect(s!.fields!.length).toBe(20);
    expect(s!.fields![0].label).toBe('0');

    const withJunk = sanitizeCustomSections({ fields: ['junk', { label: 'L', value: 7 }, null] });
    expect(withJunk!.fields!.length).toBe(1);
    expect(withJunk!.fields![0]).toEqual({ label: 'L', value: '7' });
  });
});

describe('non-string coercion', () => {
  it('does not crash on non-string header/footer/field values', () => {
    // Odd API payloads must never throw — coerce with String().
    expect(() =>
      buildCustomSectionsHtml({
        header: 5 as unknown as string,
        footer: { nested: true } as unknown as string,
        fields: [{ label: 123 as unknown as string, value: 'x' }],
      })
    ).not.toThrow();
    const html = buildCustomSectionsHtml({
      header: 5 as unknown as string,
      fields: [{ label: 123 as unknown as string, value: 'x' }],
    });
    expect(html).toContain('5');
    expect(html).toContain('123');
  });
});

describe('injectCustomSections', () => {
  it('returns the body unchanged without sections', () => {
    expect(injectCustomSections('<p>Body</p>', undefined)).toBe('<p>Body</p>');
    expect(injectCustomSections('<p>Body</p>', {})).toBe('<p>Body</p>');
  });

  it('places header before, fields + footer after the body', () => {
    const result = injectCustomSections('<p>BODY</p>', {
      logo: LOGO,
      header: 'Header line',
      footer: 'Footer line',
      fields: [{ label: 'Ref', value: '1' }],
    });
    expect(result.indexOf('custom-header')).toBeLessThan(result.indexOf('<p>BODY</p>'));
    expect(result.indexOf('<p>BODY</p>')).toBeLessThan(result.indexOf('custom-fields'));
    expect(result.indexOf('custom-fields')).toBeLessThan(result.indexOf('custom-footer'));
  });

  it('works with header only', () => {
    const result = injectCustomSections('<p>BODY</p>', { header: 'H' });
    expect(result).toBe('<div class="custom-header" style="margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #2563eb;"><table style="width:100%;border:none;border-collapse:collapse;"><tbody><tr><td style="border:none;padding:0;width:140px;vertical-align:middle;"></td><td style="border:none;padding:0 0 0 12px;vertical-align:middle;"><div style="font-size:14px;font-weight:600;color:#1f2937;line-height:1.4;">H</div></td></tr></tbody></table></div><p>BODY</p>');
  });
});
