import DOMPurify from 'dompurify';
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';
import type {
  DesignerDocument,
  DesignerElement,
  DesignerPage,
  PageSettings,
} from './types';

// ─── CSS value sanitization ─────────────────────────────────────────
// Designer-supplied style values are interpolated into the exported HTML,
// which is saved to templates and rendered in other users' browsers (and
// loaded back via JSON import). Validate/coerce every interpolated value so
// a tampered design cannot inject CSS. DOMPurify below adds a second,
// browser-side hardening layer.

const SAFE_HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_NAMED_COLOR_RE = /^[a-zA-Z]{3,30}$/;
const SAFE_FUNCTION_COLOR_RE = /^(?:rgba?|hsla?)\([\d.%,\s]+\)$/;

/** Return a sanitized CSS color, or null so the caller drops the declaration. */
export function safeColor(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v === 'transparent') return v;
  if (SAFE_HEX_COLOR_RE.test(v)) return v.toLowerCase();
  if (SAFE_NAMED_COLOR_RE.test(v)) return v.toLowerCase();
  if (SAFE_FUNCTION_COLOR_RE.test(v)) return v;
  return null;
}

/** Coerce to a finite number clamped to [min, max]; fallback when invalid. */
export function safeNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Font families may be quoted ('Times New Roman') — plain text characters only. */
export function safeFontFamily(value: string | undefined | null, fallback = 'Inter'): string {
  if (!value) return fallback;
  const v = value.trim();
  return /^[a-zA-Z0-9 ,'"-]{1,64}$/.test(v) ? v : fallback;
}

const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const FONT_STYLES = new Set(['normal', 'italic']);
const TEXT_DECORATIONS = new Set(['none', 'underline']);

/** Restrict string-union style fields to their known safe values. */
export function safeEnum(value: unknown, allowed: ReadonlySet<string>, fallback: string): string {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

/** Resolve {{Key}} tokens against a values map (leave unresolved tokens intact). */
export function resolveTokens(text: string, values?: Record<string, string>): string {
  if (!values) return text;
  return text.replace(/\{\{([\w.-]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleOf(element: DesignerElement, page: PageSettings): string {
  const left = page.marginLeft + element.x;
  const top = page.marginTop + element.y;
  const parts: string[] = [
    `left:${Math.round(safeNumber(left, 0))}px`,
    `top:${Math.round(safeNumber(top, 0))}px`,
    `width:${Math.round(safeNumber(element.width, 0, 0))}px`,
    `height:${Math.round(safeNumber(element.height, 0, 0))}px`,
    `position:absolute`,
    `opacity:${safeNumber(element.opacity, 1, 0, 1)}`,
    `box-sizing:border-box`,
  ];
  const rotation = safeNumber(element.rotation, 0);
  if (rotation) parts.push(`transform:rotate(${rotation}deg)`);
  const backgroundColor = safeColor(element.backgroundColor);
  if (backgroundColor) parts.push(`background-color:${backgroundColor}`);
  const borderWidth = safeNumber(element.borderWidth, 0, 0);
  if (borderWidth > 0) {
    parts.push(`border:${borderWidth}px solid ${safeColor(element.borderColor) ?? '#d1d5db'}`);
    const borderRadius = safeNumber(element.borderRadius, 0, 0);
    if (borderRadius) parts.push(`border-radius:${borderRadius}px`);
  }
  if (element.shadow === 'sm') parts.push('box-shadow:0 1px 2px rgba(0,0,0,0.06)');
  if (element.shadow === 'md') parts.push('box-shadow:0 4px 8px rgba(0,0,0,0.10)');
  if (element.shadow === 'lg') parts.push('box-shadow:0 12px 24px rgba(0,0,0,0.14)');
  if (element.type === 'text' || element.type === 'icon') {
    parts.push(`font-family:${safeFontFamily(element.fontFamily)},sans-serif`);
    parts.push(`font-size:${safeNumber(element.fontSize, 11, 0)}px`);
    parts.push(`font-weight:${safeNumber(element.fontWeight, 400, 0)}`);
    if (safeEnum(element.fontStyle, FONT_STYLES, 'normal') === 'italic') parts.push('font-style:italic');
    if (safeEnum(element.textDecoration, TEXT_DECORATIONS, 'none') === 'underline') parts.push('text-decoration:underline');
    parts.push(`text-align:${safeEnum(element.textAlign, TEXT_ALIGNS, 'left')}`);
    parts.push(`line-height:${safeNumber(element.lineHeight, 1.3, 0)}`);
    parts.push(`letter-spacing:${safeNumber(element.letterSpacing, 0)}px`);
    parts.push(`color:${safeColor(element.color) ?? '#1f2937'}`);
    parts.push('display:flex');
    parts.push('flex-direction:column');
    parts.push('justify-content:center');
    parts.push('overflow:hidden');
    parts.push('white-space:pre-wrap');
    parts.push('word-break:break-word');
  }
  return parts.join(';');
}

function renderTextElement(element: DesignerElement, page: PageSettings, values?: Record<string, string>): string {
  const content = resolveTokens(element.text ?? '', values);
  return `<div style="${styleOf(element, page)}">${escapeHtml(content)}</div>`;
}

/** Only render image sources with safe schemes (designer-supplied or token-resolved). */
function isSafeImageSrc(src: string): boolean {
  if (/^https?:\/\//i.test(src)) return true;
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(src)) return true;
  if (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) return true;
  return false;
}

function renderImageElement(element: DesignerElement, page: PageSettings, values?: Record<string, string>): string {
  let src = element.imageSrc ?? '';
  src = resolveTokens(src, values);
  const style = [
    `left:${Math.round(safeNumber(page.marginLeft + element.x, 0))}px`,
    `top:${Math.round(safeNumber(page.marginTop + element.y, 0))}px`,
    `width:${Math.round(safeNumber(element.width, 0, 0))}px`,
    `height:${Math.round(safeNumber(element.height, 0, 0))}px`,
    `position:absolute`,
    `opacity:${safeNumber(element.opacity, 1, 0, 1)}`,
    `object-fit:contain`,
    `box-sizing:border-box`,
  ].join(';');
  // Unresolved token or unsafe scheme -> show a bordered placeholder so
  // layout stays visible; the document engine resolves tokens later.
  if (!src || src.includes('{{') || !isSafeImageSrc(src)) {
    return `<div style="${style};display:flex;align-items:center;justify-content:center;background:#f9fafb;border:1px dashed #d1d5db;color:#9ca3af;font-size:9px;font-family:Inter,sans-serif">${escapeHtml(src)}</div>`;
  }
  return `<img src="${escapeHtml(src)}" alt="" style="${style}" />`;
}

function renderTableElement(element: DesignerElement, page: PageSettings, values?: Record<string, string>): string {
  const table = element.table;
  if (!table) return '';
  const left = page.marginLeft + element.x;
  const top = page.marginTop + element.y;
  const border = table.borders ? `1px solid #e5e7eb` : 'none';
  const pad = safeNumber(table.cellPadding, 4, 0);
  const fontPx = safeNumber(element.fontSize, 10, 0);
  const headerBg = '#2563eb';
  const headerColor = '#ffffff';
  const totalBg = '#eff6ff';
  const totalColor = '#1d4ed8';
  const totalCol = safeNumber(table.totalColumn, 0, 0);

  const currencyPrefix = table.currency ? '₹ ' : '';
  const numeric = (content: string): boolean => /^-?\d[\d,]*$/.test(content.replace(/[₹,\s]/g, ''));

  const cellStyle = (isHeader: boolean, isTotal: boolean, col: number) => {
    const s = [
      `border:${border}`,
      `padding:${pad}px ${pad + 3}px`,
      `font-size:${fontPx}px`,
      `font-family:${safeFontFamily(element.fontFamily)},sans-serif`,
      `text-align:${col === totalCol ? 'right' : 'left'}`,
    ];
    if (isHeader) s.push(`background:${headerBg}`, `color:${headerColor}`, `font-weight:700`);
    if (isTotal) s.push(`background:${totalBg}`, `color:${totalColor}`, `font-weight:700`);
    return s.join(';');
  };

  let html = `<table style="position:absolute;left:${Math.round(safeNumber(left, 0))}px;top:${Math.round(safeNumber(top, 0))}px;width:${Math.round(safeNumber(element.width, 0, 0))}px;border-collapse:collapse;opacity:${safeNumber(element.opacity, 1, 0, 1)};box-sizing:border-box">`;
  const rows = table.cells;
  rows.forEach((row, r) => {
    const isHeaderRow = table.headerRow && r === 0;
    const isTotalRow = table.totalRow && r === rows.length - 1;
    let rowHtml = '<tr>';
    row.forEach((cell, c) => {
      let content = resolveTokens(cell.content, values);
      const isTotalCell = isTotalRow && c === totalCol;
      if (isTotalCell && table.currency && numeric(content) && !content.startsWith('₹')) {
        content = `${currencyPrefix}${content}`;
      }
      rowHtml += `<td style="${cellStyle(isHeaderRow, isTotalCell, c)}">${escapeHtml(content)}</td>`;
    });
    rowHtml += '</tr>';
    html += rowHtml;
  });
  html += '</table>';
  return html;
}

function renderShapeElement(element: DesignerElement, page: PageSettings): string {
  const radius = element.shape === 'circle' ? '50%' : `${safeNumber(element.borderRadius, 0, 0)}px`;
  const style = [
    `left:${Math.round(safeNumber(page.marginLeft + element.x, 0))}px`,
    `top:${Math.round(safeNumber(page.marginTop + element.y, 0))}px`,
    `width:${Math.round(safeNumber(element.width, 0, 0))}px`,
    `height:${Math.round(safeNumber(element.height, 0, 0))}px`,
    `position:absolute`,
    `opacity:${safeNumber(element.opacity, 1, 0, 1)}`,
    `background:${safeColor(element.backgroundColor) ?? '#eff6ff'}`,
    `border-radius:${radius}`,
  ];
  const borderWidth = safeNumber(element.borderWidth, 0, 0);
  if (borderWidth > 0) {
    style.push(`border:${borderWidth}px solid ${safeColor(element.borderColor) ?? '#d1d5db'}`);
  }
  if (element.shadow === 'sm') style.push('box-shadow:0 1px 2px rgba(0,0,0,0.06)');
  if (element.shadow === 'md') style.push('box-shadow:0 4px 8px rgba(0,0,0,0.10)');
  if (element.shadow === 'lg') style.push('box-shadow:0 12px 24px rgba(0,0,0,0.14)');
  return `<div style="${style.join(';')}"></div>`;
}

function renderLineElement(element: DesignerElement, page: PageSettings): string {
  const width = safeNumber(element.width, 0, 0);
  const height = safeNumber(element.height, 0, 0);
  const horizontal = width >= height;
  const thickness = horizontal ? Math.max(1, height) : Math.max(1, width);
  const length = horizontal ? width : height;
  const color = safeColor(element.backgroundColor) ?? '#d1d5db';
  const dash = element.lineStyle === 'dashed' ? `${thickness * 3}px ${thickness * 2}px` : element.lineStyle === 'dotted' ? `${thickness}px ${thickness}px` : 'none';
  const style = [
    `left:${Math.round(safeNumber(page.marginLeft + element.x, 0))}px`,
    `top:${Math.round(safeNumber(page.marginTop + element.y, 0))}px`,
    horizontal
      ? `width:${Math.round(length)}px;height:${Math.max(1, height)}px`
      : `height:${Math.round(length)}px;width:${Math.max(1, width)}px`,
    `position:absolute`,
    `opacity:${safeNumber(element.opacity, 1, 0, 1)}`,
    `background:${color}`,
  ];
  if (dash !== 'none') style.push(`background-image:linear-gradient(${horizontal ? '90deg' : '180deg'},${color} 50%,transparent 50%);background-size:${dash}`);
  return `<div style="${style.join(';')}"></div>`;
}

function renderDividerElement(element: DesignerElement, page: PageSettings): string {
  const style = [
    `left:${Math.round(safeNumber(page.marginLeft + element.x, 0))}px`,
    `top:${Math.round(safeNumber(page.marginTop + element.y, 0))}px`,
    `width:${Math.round(safeNumber(element.width, 0, 0))}px`,
    `height:${Math.max(1, Math.round(safeNumber(element.height, 1, 0)))}px`,
    `position:absolute`,
    `opacity:${safeNumber(element.opacity, 1, 0, 1)}`,
    `background:${safeColor(element.backgroundColor) ?? '#e5e7eb'}`,
  ];
  if (element.lineStyle === 'dashed') style.push(`background-image:repeating-linear-gradient(90deg,${safeColor(element.backgroundColor) ?? '#e5e7eb'} 0 6px,transparent 6px 12px)`);
  return `<div style="${style.join(';')}"></div>`;
}

function renderIconElement(element: DesignerElement, page: PageSettings): string {
  const style = [
    `left:${Math.round(safeNumber(page.marginLeft + element.x, 0))}px`,
    `top:${Math.round(safeNumber(page.marginTop + element.y, 0))}px`,
    `width:${Math.round(safeNumber(element.width, 0, 0))}px`,
    `height:${Math.round(safeNumber(element.height, 0, 0))}px`,
    `position:absolute`,
    `opacity:${safeNumber(element.opacity, 1, 0, 1)}`,
    `color:${safeColor(element.color) ?? '#6b7280'}`,
  ];
  const iconName = (element.iconName || 'Building2').toLowerCase();
  const glyphs: Record<string, string> = {
    landmark: '🏛',
    building2: '🏢',
    user: '👤',
    calendardays: '📅',
    banknote: '💵',
    wallet: '👛',
    receipt: '🧾',
    rupee: '₹',
  };
  const fontSize = safeNumber(Math.min(element.width, element.height) * 0.7, 16, 0);
  return `<div style="${style.join(';')};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px">${glyphs[iconName] ?? '▪'}</div>`;
}

function renderQrElement(element: DesignerElement, page: PageSettings, values?: Record<string, string>): string {
  const value = resolveTokens(element.qrValue ?? 'https://docmint.app', values);
  const style = [
    `left:${Math.round(safeNumber(page.marginLeft + element.x, 0))}px`,
    `top:${Math.round(safeNumber(page.marginTop + element.y, 0))}px`,
    `width:${Math.round(safeNumber(element.width, 0, 0))}px`,
    `height:${Math.round(safeNumber(element.height, 0, 0))}px`,
    `position:absolute`,
    `opacity:${safeNumber(element.opacity, 1, 0, 1)}`,
    `display:flex`,
    `align-items:center`,
    `justify-content:center`,
  ].join(';');
  // Marker replaced with an inline data-URL <img> by embedQrCodes (async).
  return `<img class="docmint-qr" data-qr-value="${encodeURIComponent(value)}" alt="QR" style="${style};width:100%;height:100%;object-fit:contain" />`;
}

function renderElement(element: DesignerElement, page: PageSettings, values?: Record<string, string>): string {
  switch (element.type) {
    case 'text': return renderTextElement(element, page, values);
    case 'image': return renderImageElement(element, page, values);
    case 'signature': return renderImageElement(element, page, values);
    case 'table': return renderTableElement(element, page, values);
    case 'shape': return renderShapeElement(element, page);
    case 'line': return renderLineElement(element, page);
    case 'divider': return renderDividerElement(element, page);
    case 'icon': return renderIconElement(element, page);
    case 'qr': return renderQrElement(element, page, values);
    default: return '';
  }
}

export function renderPageHtml(page: DesignerPage, values?: Record<string, string>): string {
  const s = page.settings;
  const marginBox = [
    `padding:${safeNumber(s.marginTop, 40, 0)}px ${safeNumber(s.marginRight, 48, 0)}px ${safeNumber(s.marginBottom, 40, 0)}px ${safeNumber(s.marginLeft, 48, 0)}px`,
    'position:relative',
  ].join(';');
  // Guard against tampered JSON shapes (non-array element collections).
  const header = Array.isArray(s.headerElements) ? s.headerElements.map((e) => renderElement(e, s, values)).join('') : '';
  const footer = Array.isArray(s.footerElements) ? s.footerElements.map((e) => renderElement(e, s, values)).join('') : '';
  const body = Array.isArray(page.elements) ? page.elements.map((e) => renderElement(e, s, values)).join('') : '';
  return `
    <div class="page" style="width:${safeNumber(s.width, 794, 0)}px;height:${safeNumber(s.height, 1123, 0)}px;background:${safeColor(s.backgroundColor) ?? '#ffffff'};position:relative;overflow:hidden">
      ${header}
      <div class="page-body" style="${marginBox}">${body}</div>
      ${footer}
    </div>`;
}

/**
 * DOMPurify hardening pass. Runs in browsers only (needs a DOM); the CSS
 * validators above already neutralize the known vectors, and SSR/tests have
 * no DOM to render into anyway.
 */
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['style'], // keep the generated print/pagination <style> block
  });
}

/**
 * Renders qrcode.react's QRCodeCanvas and reports the painted PNG data URL.
 * The canvas is read inside an effect — QRCodeCanvas paints in its own
 * effect (child effects run before parent effects), so by the time this
 * runs the QR is actually drawn. Reading the canvas in a ref callback would
 * capture a blank canvas (refs attach before paint), and querying the host
 * DOM avoids passing a ref to the component entirely.
 */
function QrDataUrlCapture({ value, size, onData, host }: { value: string; size: number; onData: (url: string) => void; host: HTMLElement }) {
  useEffect(() => {
    const canvas = host.querySelector('canvas');
    onData(canvas?.toDataURL('image/png') ?? '');
    // host/onData are stable per render — run once.
  }, [host, onData]);
  return createElement(QRCodeCanvas, {
    value,
    size,
    bgColor: '#ffffff',
    fgColor: '#000000',
    marginSize: 1,
  });
}

/**
 * Render a QR code to an inline PNG data URL using qrcode.react's
 * QRCodeCanvas — fully client-side, no network. Returns '' where there is
 * no DOM (SSR/tests); callers fall back to a marker/placeholder then.
 */
export async function renderQrDataUrl(value: string, size: number): Promise<string> {
  if (typeof document === 'undefined') return '';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    return await new Promise<string>((resolve) => {
      try {
        root.render(createElement(QrDataUrlCapture, { value, size, onData: resolve, host }));
      } catch {
        resolve('');
      }
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

const QR_MARKER_RE = /data-qr-value="([^"]*)"/g;

/** Replace every QR marker with an inline data-URL image (deduped per value). */
async function embedQrCodes(html: string): Promise<string> {
  const cache = new Map<string, string>();
  for (const match of html.matchAll(QR_MARKER_RE)) {
    const encoded = match[1];
    if (cache.has(encoded)) continue;
    const value = decodeURIComponent(encoded);
    cache.set(encoded, await renderQrDataUrl(value, 256));
  }
  for (const [encoded, url] of cache) {
    if (!url) continue; // no DOM (SSR/tests) — keep the marker for later embedding
    html = html.replaceAll(`data-qr-value="${encoded}"`, `src="${url}"`);
  }
  return html;
}

/**
 * Full standalone A4 document (one .page div per designer page). Use for
 * preview iframes, window.print(), jsPDF doc.html() and DOCX export.
 * QR codes are embedded as inline data URLs (no external API).
 */
export async function exportDesignHtml(document: DesignerDocument, values?: Record<string, string>): Promise<string> {
  const pages = document.pages.map((p) => renderPageHtml(p, values)).join('\n');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #e5e7eb; }
    @media print {
      html, body { background: #ffffff; }
      .page { page-break-after: always; }
    }
    .page { margin: 0 auto 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,0.12); }
    @media print {
      .page { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
${pages}
</body>
</html>`;
  const withQr = await embedQrCodes(html);
  return sanitizeHtml(withQr);
}
