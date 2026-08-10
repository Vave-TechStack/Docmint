import type {
  DesignerDocument,
  DesignerElement,
  DesignerPage,
  PageSettings,
} from './types';

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
    `left:${Math.round(left)}px`,
    `top:${Math.round(top)}px`,
    `width:${Math.round(element.width)}px`,
    `height:${Math.round(element.height)}px`,
    `position:absolute`,
    `opacity:${element.opacity}`,
    `box-sizing:border-box`,
  ];
  if (element.rotation) parts.push(`transform:rotate(${element.rotation}deg)`);
  if (element.backgroundColor) parts.push(`background-color:${element.backgroundColor}`);
  if (element.borderWidth && element.borderWidth > 0) {
    parts.push(`border:${element.borderWidth}px solid ${element.borderColor || '#d1d5db'}`);
    if (element.borderRadius) parts.push(`border-radius:${element.borderRadius}px`);
  }
  if (element.shadow === 'sm') parts.push('box-shadow:0 1px 2px rgba(0,0,0,0.06)');
  if (element.shadow === 'md') parts.push('box-shadow:0 4px 8px rgba(0,0,0,0.10)');
  if (element.shadow === 'lg') parts.push('box-shadow:0 12px 24px rgba(0,0,0,0.14)');
  if (element.type === 'text' || element.type === 'icon') {
    parts.push(`font-family:${element.fontFamily || 'Inter'},sans-serif`);
    parts.push(`font-size:${element.fontSize ?? 11}px`);
    parts.push(`font-weight:${element.fontWeight ?? 400}`);
    if (element.fontStyle === 'italic') parts.push('font-style:italic');
    if (element.textDecoration === 'underline') parts.push('text-decoration:underline');
    parts.push(`text-align:${element.textAlign || 'left'}`);
    parts.push(`line-height:${element.lineHeight ?? 1.3}`);
    parts.push(`letter-spacing:${element.letterSpacing ?? 0}px`);
    parts.push(`color:${element.color || '#1f2937'}`);
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

function renderImageElement(element: DesignerElement, page: PageSettings, values?: Record<string, string>): string {
  let src = element.imageSrc ?? '';
  src = resolveTokens(src, values);
  const style = [
    `left:${Math.round(page.marginLeft + element.x)}px`,
    `top:${Math.round(page.marginTop + element.y)}px`,
    `width:${Math.round(element.width)}px`,
    `height:${Math.round(element.height)}px`,
    `position:absolute`,
    `opacity:${element.opacity}`,
    `object-fit:contain`,
    `box-sizing:border-box`,
  ].join(';');
  // Unresolved token -> broken image at render time; the document engine
  // resolves it later. Show a bordered placeholder so layout stays visible.
  const resolved = src.startsWith('data:') || src.startsWith('http') || !src.includes('{{');
  if (!resolved) {
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
  const pad = table.cellPadding;
  const fontPx = element.fontSize ?? 10;
  const headerBg = '#2563eb';
  const headerColor = '#ffffff';
  const totalBg = '#eff6ff';
  const totalColor = '#1d4ed8';
  const totalCol = table.totalColumn;

  const currencyPrefix = table.currency ? '₹ ' : '';
  const numeric = (content: string): boolean => /^-?\d[\d,]*$/.test(content.replace(/[₹,\s]/g, ''));

  const cellStyle = (isHeader: boolean, isTotal: boolean, col: number) => {
    const s = [
      `border:${border}`,
      `padding:${pad}px ${pad + 3}px`,
      `font-size:${fontPx}px`,
      `font-family:${element.fontFamily || 'Inter'},sans-serif`,
      `text-align:${col === totalCol ? 'right' : 'left'}`,
    ];
    if (isHeader) s.push(`background:${headerBg}`, `color:${headerColor}`, `font-weight:700`);
    if (isTotal) s.push(`background:${totalBg}`, `color:${totalColor}`, `font-weight:700`);
    return s.join(';');
  };

  let html = `<table style="position:absolute;left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(element.width)}px;border-collapse:collapse;opacity:${element.opacity};box-sizing:border-box">`;
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
  const radius = element.shape === 'circle' ? '50%' : `${element.borderRadius ?? 0}px`;
  const style = [
    `left:${Math.round(page.marginLeft + element.x)}px`,
    `top:${Math.round(page.marginTop + element.y)}px`,
    `width:${Math.round(element.width)}px`,
    `height:${Math.round(element.height)}px`,
    `position:absolute`,
    `opacity:${element.opacity}`,
    `background:${element.backgroundColor || '#eff6ff'}`,
    `border-radius:${radius}`,
  ];
  if (element.borderWidth && element.borderWidth > 0) {
    style.push(`border:${element.borderWidth}px solid ${element.borderColor || '#d1d5db'}`);
  }
  if (element.shadow === 'sm') style.push('box-shadow:0 1px 2px rgba(0,0,0,0.06)');
  if (element.shadow === 'md') style.push('box-shadow:0 4px 8px rgba(0,0,0,0.10)');
  if (element.shadow === 'lg') style.push('box-shadow:0 12px 24px rgba(0,0,0,0.14)');
  return `<div style="${style.join(';')}"></div>`;
}

function renderLineElement(element: DesignerElement, page: PageSettings): string {
  const horizontal = element.width >= element.height;
  const thickness = horizontal ? Math.max(1, element.height) : Math.max(1, element.width);
  const length = horizontal ? element.width : element.height;
  const dash = element.lineStyle === 'dashed' ? `${thickness * 3}px ${thickness * 2}px` : element.lineStyle === 'dotted' ? `${thickness}px ${thickness}px` : 'none';
  const style = [
    `left:${Math.round(page.marginLeft + element.x)}px`,
    `top:${Math.round(page.marginTop + element.y)}px`,
    horizontal
      ? `width:${Math.round(length)}px;height:${Math.max(1, element.height)}px`
      : `height:${Math.round(length)}px;width:${Math.max(1, element.width)}px`,
    `position:absolute`,
    `opacity:${element.opacity}`,
    `background:${element.backgroundColor || '#d1d5db'}`,
  ];
  if (dash !== 'none') style.push(`background-image:linear-gradient(${horizontal ? '90deg' : '180deg'},${element.backgroundColor || '#d1d5db'} 50%,transparent 50%);background-size:${dash}`);
  return `<div style="${style.join(';')}"></div>`;
}

function renderDividerElement(element: DesignerElement, page: PageSettings): string {
  const style = [
    `left:${Math.round(page.marginLeft + element.x)}px`,
    `top:${Math.round(page.marginTop + element.y)}px`,
    `width:${Math.round(element.width)}px`,
    `height:${Math.max(1, Math.round(element.height))}px`,
    `position:absolute`,
    `opacity:${element.opacity}`,
    `background:${element.backgroundColor || '#e5e7eb'}`,
  ];
  if (element.lineStyle === 'dashed') style.push(`background-image:repeating-linear-gradient(90deg,${element.backgroundColor || '#e5e7eb'} 0 6px,transparent 6px 12px)`);
  return `<div style="${style.join(';')}"></div>`;
}

function renderIconElement(element: DesignerElement, page: PageSettings): string {
  const style = [
    `left:${Math.round(page.marginLeft + element.x)}px`,
    `top:${Math.round(page.marginTop + element.y)}px`,
    `width:${Math.round(element.width)}px`,
    `height:${Math.round(element.height)}px`,
    `position:absolute`,
    `opacity:${element.opacity}`,
    `color:${element.color || '#6b7280'}`,
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
  return `<div style="${style.join(';')};display:flex;align-items:center;justify-content:center;font-size:${Math.min(element.width, element.height) * 0.7}px">${glyphs[iconName] ?? '▪'}</div>`;
}

function renderQrElement(element: DesignerElement, page: PageSettings, values?: Record<string, string>): string {
  const value = resolveTokens(element.qrValue ?? 'https://docmint.app', values);
  const style = [
    `left:${Math.round(page.marginLeft + element.x)}px`,
    `top:${Math.round(page.marginTop + element.y)}px`,
    `width:${Math.round(element.width)}px`,
    `height:${Math.round(element.height)}px`,
    `position:absolute`,
    `opacity:${element.opacity}`,
    `display:flex`,
    `align-items:center`,
    `justify-content:center`,
  ].join(';');
  return `<div style="${style}"><img src="https://api.qrserver.com/v1/create-qr-code/?size=${Math.round(Math.min(element.width, element.height) * 2)}x${Math.round(Math.min(element.width, element.height) * 2)}&data=${encodeURIComponent(value)}" alt="QR" style="width:100%;height:100%;object-fit:contain" /></div>`;
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
    `padding:${s.marginTop}px ${s.marginRight}px ${s.marginBottom}px ${s.marginLeft}px`,
    'position:relative',
  ].join(';');
  const header = s.headerElements.map((e) => renderElement(e, s, values)).join('');
  const footer = s.footerElements.map((e) => renderElement(e, s, values)).join('');
  const body = page.elements.map((e) => renderElement(e, s, values)).join('');
  return `
    <div class="page" style="width:${s.width}px;height:${s.height}px;background:${s.backgroundColor};position:relative;overflow:hidden">
      ${header}
      <div class="page-body" style="${marginBox}">${body}</div>
      ${footer}
    </div>`;
}

/**
 * Full standalone A4 document (one .page div per designer page). Use for
 * preview iframes, window.print(), jsPDF doc.html() and DOCX export.
 */
export function exportDesignHtml(document: DesignerDocument, values?: Record<string, string>): string {
  const pages = document.pages.map((p) => renderPageHtml(p, values)).join('\n');
  return `<!DOCTYPE html>
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
}
