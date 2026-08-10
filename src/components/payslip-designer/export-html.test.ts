import { describe, expect, it } from 'vitest';
import {
  exportDesignHtml,
  resolveTokens,
  safeColor,
  safeEnum,
  safeFontFamily,
  safeNumber,
} from './export-html';
import type { DesignerDocument, DesignerElement, DesignerPage } from './types';

const TEXT_ALIGNS = new Set(['left', 'center', 'right']);

function makePage(elements: DesignerElement[]): DesignerPage {
  return {
    id: 'p1',
    name: 'Page 1',
    settings: {
      width: 794,
      height: 1123,
      marginTop: 40,
      marginBottom: 40,
      marginLeft: 48,
      marginRight: 48,
      backgroundColor: '#ffffff',
      headerElements: [],
      footerElements: [],
    },
    elements,
  };
}

function makeTextElement(overrides: Partial<DesignerElement>): DesignerElement {
  return {
    id: 'e1',
    type: 'text',
    name: 'Text',
    x: 0,
    y: 0,
    width: 200,
    height: 30,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    text: 'Hello',
    binding: { kind: 'plain' },
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: 400,
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    color: '#1f2937',
    lineHeight: 1.3,
    letterSpacing: 0,
    backgroundColor: undefined,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#d1d5db',
    shadow: 'none',
    align: 'middle',
    ...overrides,
  };
}

function makeDocument(page: DesignerPage): DesignerDocument {
  return { version: 1, name: 'Test', pages: [page] };
}

function makeQrElement(value: string): DesignerElement {
  return {
    id: 'qr1',
    type: 'qr',
    name: 'QR',
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    qrValue: value,
    binding: { kind: 'plain' },
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: 400,
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    color: '#1f2937',
    lineHeight: 1.3,
    letterSpacing: 0,
    backgroundColor: undefined,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#d1d5db',
    shadow: 'none',
    align: 'middle',
  };
}

function makeImageElement(imageSrc: string): DesignerElement {
  return {
    id: 'img1',
    type: 'image',
    name: 'Logo',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    imageSrc,
    binding: { kind: 'plain' },
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: 400,
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    color: '#1f2937',
    lineHeight: 1.3,
    letterSpacing: 0,
    backgroundColor: undefined,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#d1d5db',
    shadow: 'none',
    align: 'middle',
  };
}

describe('safeColor', () => {
  it('keeps valid colors', () => {
    expect(safeColor('#fff')).toBe('#fff');
    expect(safeColor('#123ABC')).toBe('#123abc');
    expect(safeColor('#12345678')).toBe('#12345678');
    expect(safeColor('white')).toBe('white');
    expect(safeColor('transparent')).toBe('transparent');
    expect(safeColor('rgb(0, 0, 0)')).toBe('rgb(0, 0, 0)');
    expect(safeColor('rgba(37, 99, 235, 0.5)')).toBe('rgba(37, 99, 235, 0.5)');
    expect(safeColor('hsl(220, 50%, 50%)')).toBe('hsl(220, 50%, 50%)');
  });

  it('rejects CSS-injection payloads', () => {
    expect(safeColor('red;position:fixed')).toBeNull();
    expect(safeColor('url(https://evil.example)')).toBeNull();
    expect(safeColor('expression(alert(1))')).toBeNull();
    expect(safeColor('red;background:url(javascript:alert(1))')).toBeNull();
    expect(safeColor('#ff0000;width:100%')).toBeNull();
    expect(safeColor('')).toBeNull();
    expect(safeColor(undefined)).toBeNull();
    expect(safeColor(null)).toBeNull();
  });
});

describe('safeNumber', () => {
  it('coerces and clamps', () => {
    expect(safeNumber(18, 11)).toBe(18);
    expect(safeNumber('18', 11)).toBe(18);
    expect(safeNumber(50, 11, 0, 20)).toBe(20);
    expect(safeNumber(-5, 11, 0)).toBe(0);
    expect(safeNumber(0.55, 1, 0, 1)).toBe(0.55);
  });

  it('falls back on invalid input', () => {
    expect(safeNumber('abc', 11)).toBe(11);
    expect(safeNumber(Number.NaN, 11)).toBe(11);
    expect(safeNumber(undefined, 11)).toBe(11);
    expect(safeNumber(null, 11)).toBe(11);
    expect(safeNumber('red;position:fixed', 11)).toBe(11);
  });
});

describe('safeFontFamily', () => {
  it('keeps plain font names', () => {
    expect(safeFontFamily('Inter')).toBe('Inter');
    expect(safeFontFamily('Times New Roman')).toBe('Times New Roman');
    expect(safeFontFamily("'Courier New'")).toBe("'Courier New'");
    expect(safeFontFamily(undefined)).toBe('Inter');
  });

  it('rejects injection payloads and overly long values', () => {
    expect(safeFontFamily('Inter;color:red')).toBe('Inter');
    expect(safeFontFamily('x,monospace;} body{display:none')).toBe('Inter');
    expect(safeFontFamily('A'.repeat(100))).toBe('Inter');
  });
});

describe('safeEnum', () => {
  it('restricts string unions to known values', () => {
    expect(safeEnum('center', TEXT_ALIGNS, 'left')).toBe('center');
    expect(safeEnum('center;position:fixed', TEXT_ALIGNS, 'left')).toBe('left');
    expect(safeEnum('garbage', TEXT_ALIGNS, 'left')).toBe('left');
    expect(safeEnum(42, TEXT_ALIGNS, 'left')).toBe('left');
  });
});

describe('resolveTokens', () => {
  it('resolves known tokens and leaves unknowns intact', () => {
    expect(resolveTokens('Hello {{Name}}!', { Name: 'Rahul' })).toBe('Hello Rahul!');
    expect(resolveTokens('{{Missing}}', { Name: 'Rahul' })).toBe('{{Missing}}');
    expect(resolveTokens('plain', undefined)).toBe('plain');
  });
});

describe('exportDesignHtml CSS injection defense', () => {
  it('neutralizes hostile style values while keeping valid ones', async () => {
    // Hostile values arrive via untrusted JSON (strings, junk), so build the
    // element as raw data to simulate a tampered design.
    const element = makeTextElement({
      text: '<script>alert(1)</script>',
      color: 'red;position:fixed',
      backgroundColor: 'url(https://evil.example/x)',
      fontFamily: 'Inter;color:red',
      fontSize: 'abc',
      textAlign: 'center;position:fixed',
      fontStyle: 'italic;position:fixed',
      opacity: 900,
      rotation: '90',
    } as unknown as Partial<DesignerElement>);
    const html = await exportDesignHtml(makeDocument(makePage([element])));

    // Hostile CSS never reaches the output…
    expect(html).not.toContain('position:fixed');
    expect(html).not.toContain('url(');
    expect(html).not.toContain('expression');
    // …the text payload is escaped…
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // …and values fall back to safe defaults.
    expect(html).toContain('font-family:Inter');
    expect(html).toContain('text-align:left');
    expect(html).toContain('opacity:1');
    expect(html).toContain('transform:rotate(90deg)');
    expect(html).toContain('font-size:11px'); // invalid "abc" -> default
  });

  it('never renders javascript: image sources', async () => {
    const html = await exportDesignHtml(makeDocument(makePage([makeImageElement('javascript:alert(1)')])));
    expect(html).not.toMatch(/<img[^>]*src="javascript:/);
  });

  it('keeps safe image sources', async () => {
    const html = await exportDesignHtml(makeDocument(makePage([makeImageElement('https://example.com/logo.png')])));
    expect(html).toContain('<img src="https://example.com/logo.png"');
  });

  it('does not crash when header/footer element collections are not arrays', async () => {
    const page = makePage([]);
    page.settings.headerElements = 'oops' as unknown as typeof page.settings.headerElements;
    page.settings.footerElements = 42 as unknown as typeof page.settings.footerElements;
    await expect(exportDesignHtml(makeDocument(page))).resolves.not.toThrow();
    expect(await exportDesignHtml(makeDocument(page))).toContain('class="page"');
  });

  it('renders QR codes without any external API', async () => {
    const html = await exportDesignHtml(
      makeDocument(makePage([makeQrElement('https://pay.example.com/EMP-1042')]))
    );
    // The external qrserver API is gone entirely…
    expect(html).not.toContain('api.qrserver.com');
    expect(html).not.toContain('create-qr-code');
    // …and the QR marker carries the encoded value for inline embedding.
    expect(html).toContain('class="docmint-qr"');
    expect(html).toContain('data-qr-value=');
    expect(html).toContain(encodeURIComponent('https://pay.example.com/EMP-1042'));
  });

  it('keeps valid styling intact', async () => {
    const element = makeTextElement({
      color: '#123ABC',
      fontSize: 22,
      fontWeight: 800,
      backgroundColor: '#059669',
      textAlign: 'center',
      lineHeight: 1.5,
    });
    const html = await exportDesignHtml(makeDocument(makePage([element])));

    expect(html).toContain('color:#123abc');
    expect(html).toContain('font-size:22px');
    expect(html).toContain('font-weight:800');
    expect(html).toContain('background-color:#059669');
    expect(html).toContain('text-align:center');
    expect(html).toContain('line-height:1.5');
  });
});
