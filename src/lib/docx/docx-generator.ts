import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  ImageRun,
  PageBreak,
  LevelFormat,
  VerticalAlign,
} from 'docx';

import type { ExportOptions } from '@/types';

/**
 * DocMint DOCX Generator
 *
 * Converts the editor's / template's HTML into native Office Open XML.
 *
 * WHY THIS EXISTS
 * ---------------
 * The previous implementation was a character-by-character scanner with a
 * switch over tag names. It had three defects that made every generated
 * document unusable:
 *
 *  1. `<style>` tags were skipped but their CONTENTS were not, so every
 *     exported document opened with a screen of raw CSS as body text
 *     (723-3,659 characters across the 30 seeded templates).
 *  2. `<table>` had no branch at all. Cell text was concatenated into the
 *     surrounding paragraph, so a payslip rendered as
 *     `Basic Salary₹ 45,000` on one run-on line. All 17 table-bearing
 *     templates lost every table.
 *  3. HTML entities were never decoded, so `&nbsp;` shipped as the literal
 *     text `&nbsp;` (the `docx` writer then escaped the `&` again).
 *
 * This implementation parses HTML into a tree, renders that tree into an
 * intermediate document model, then converts the model to Word constructs in
 * one pass. It is deliberately a small, predictable parser rather than a
 * browser: it covers the element set the templates actually use (verified
 * against prisma/seed.ts) and never silently discards content it does not
 * understand.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Intermediate document model
// ─────────────────────────────────────────────────────────────────────────────

type Align = 'left' | 'center' | 'right' | 'justify';

interface TextRunModel {
  kind: 'text';
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  size?: number; // half-points
  font?: string;
}

interface ImageRunModel {
  kind: 'image';
  buffer: Buffer;
  mimeType: string;
}

type RunModel = TextRunModel | ImageRunModel;

interface ParaModel {
  kind: 'para';
  runs: RunModel[];
  align?: Align;
  before?: number;
  after?: number;
  indentLeft?: number;
  listLevel?: number;
  ordered?: boolean;
  mono?: boolean;
}

interface CellModel {
  blocks: BlockModel[];
  colSpan: number;
  rowSpan: number;
  isHeader: boolean;
  fill?: string;
  widthDxa?: number;
  align?: Align;
  valign?: 'top' | 'center' | 'bottom';
}

interface RowModel {
  cells: CellModel[];
  isHeaderRow: boolean;
}

interface TableModel {
  kind: 'table';
  rows: RowModel[];
}

interface PageBreakModel {
  kind: 'pagebreak';
}

type BlockModel = ParaModel | TableModel | PageBreakModel;

// ─────────────────────────────────────────────────────────────────────────────
// HTML parsing
// ─────────────────────────────────────────────────────────────────────────────

interface TextNode {
  kind: 'text';
  value: string;
}
interface ElementNode {
  kind: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}
type Node = TextNode | ElementNode;

const VOID_TAGS = new Set([
  'img', 'br', 'hr', 'meta', 'link', 'input', 'source', 'area', 'base', 'col', 'wbr', 'embed', 'param',
]);

/** Elements whose text content is code, never prose. */
const RAW_TEXT_TAGS = new Set(['script', 'style']);

/** Elements whose content is never rendered. */
const DROPPED_TAGS = new Set(['head', 'title', 'meta', 'link', 'noscript', 'template', 'iframe', 'object']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', minus: '−',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bull: '•', middot: '·', deg: '°',
  euro: '€', pound: '£', yen: '¥', rupee: '₹',
  times: '×', divide: '÷', laquo: '«', raquo: '»',
  sect: '§', para: '¶', dagger: '†', permil: '‰', prime: '′',
  frac12: '½', frac14: '¼', frac34: '¾', micro: 'µ',
};

/**
 * Decode HTML character references.
 *
 * Handles named entities, decimal (`&#8377;`) and hexadecimal (`&#x20B9;`)
 * numeric references. Unknown references are left verbatim so nothing is
 * silently mangled.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || input.indexOf('&') === -1) return input;

  return input.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.charCodeAt(0) === 35 /* # */) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match; // lone surrogate
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[name] = decodeHtmlEntities(value);
  }
  return attrs;
}

/**
 * Parse an HTML fragment into a node tree.
 *
 * Void elements never receive children; `<script>`/`<style>` are consumed
 * and dropped whole (including their text) so stylesheet source can never
 * reach the document body. Unclosed tags close implicitly at the end of
 * their parent and stray closing tags are ignored, so malformed input
 * degrades to "less structure" rather than "lost content".
 */
export function parseHtml(html: string): Node[] {
  const root: ElementNode = { kind: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  let i = 0;

  const top = () => stack[stack.length - 1];

  while (i < html.length) {
    const lt = html.indexOf('<', i);

    if (lt === -1) {
      const text = html.slice(i);
      if (text) top().children.push({ kind: 'text', value: decodeHtmlEntities(text) });
      break;
    }
    if (lt > i) {
      top().children.push({ kind: 'text', value: decodeHtmlEntities(html.slice(i, lt)) });
    }

    // Comments, doctype and CDATA are dropped.
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<![CDATA[', lt)) {
      const end = html.indexOf(']]>', lt);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const gt = html.indexOf('>', lt);
    if (gt === -1) {
      top().children.push({ kind: 'text', value: decodeHtmlEntities(html.slice(lt)) });
      break;
    }

    const raw = html.slice(lt + 1, gt).trim();
    i = gt + 1;

    const closing = raw.startsWith('/');
    const selfClosing = raw.endsWith('/');
    const body = closing ? raw.slice(1).trim() : selfClosing ? raw.slice(0, -1).trim() : raw;
    const spaceAt = body.search(/[\s/]/);
    const tag = (spaceAt === -1 ? body : body.slice(0, spaceAt)).toLowerCase();
    if (!tag) continue;

    if (closing) {
      const idx = stack.findIndex((n, k) => k > 0 && n.tag === tag);
      if (idx > 0) stack.length = idx;
      continue;
    }

    // script/style: consume the raw text and drop it entirely.
    if (RAW_TEXT_TAGS.has(tag)) {
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = html.slice(i);
      const m = closeRe.exec(rest);
      i = m ? i + m.index + m[0].length : html.length;
      continue;
    }

    const node: ElementNode = {
      kind: 'element',
      tag,
      attrs: parseAttributes(spaceAt === -1 ? '' : body.slice(spaceAt)),
      children: [],
    };
    top().children.push(node);

    if (VOID_TAGS.has(tag) || selfClosing) continue;
    stack.push(node);
  }

  return root.children;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style helpers
// ─────────────────────────────────────────────────────────────────────────────

function styleProp(node: ElementNode, prop: string): string | undefined {
  const style = node.attrs.style;
  if (!style) return undefined;
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    if (decl.slice(0, idx).trim().toLowerCase() === prop) {
      return decl.slice(idx + 1).trim().toLowerCase();
    }
  }
  return undefined;
}

const ALIGN_MAP: Record<string, Align> = {
  left: 'left', center: 'center', centre: 'center', right: 'right',
  justify: 'justify', start: 'left', end: 'right',
};

function alignmentOf(node: ElementNode): Align | undefined {
  const fromStyle = styleProp(node, 'text-align');
  if (fromStyle && ALIGN_MAP[fromStyle]) return ALIGN_MAP[fromStyle];
  const attr = (node.attrs.align || '').toLowerCase();
  return ALIGN_MAP[attr];
}

function valignOf(node: ElementNode): 'top' | 'center' | 'bottom' | undefined {
  const v = (node.attrs.valign || styleProp(node, 'vertical-align') || '').toLowerCase();
  if (v === 'middle' || v === 'center') return 'center';
  if (v === 'bottom') return 'bottom';
  if (v === 'top' || v === 'baseline') return 'top';
  return undefined;
}

function parseColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!hex) return undefined;
  const h = hex[1];
  return h.length === 3 ? h.split('').map((c) => c + c).join('').toUpperCase() : h.toUpperCase();
}

/** Convert a CSS length to twips. Accepts px/pt/mm/cm/in/%; undefined otherwise. */
function cssLength(raw: string | undefined, percentBasis: number): number | undefined {
  if (!raw) return undefined;
  const m = /^(-?[\d.]+)\s*(px|pt|mm|cm|in|%)?$/.exec(raw.trim().toLowerCase());
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return undefined;
  switch (m[2]) {
    case '%': return Math.round((n / 100) * percentBasis);
    case 'in': return Math.round(n * 1440);
    case 'cm': return Math.round((n / 2.54) * 1440);
    case 'mm': return Math.round((n / 25.4) * 1440);
    case 'pt': return Math.round(n * 20);
    default: return Math.round((n / 96) * 1440); // px at 96dpi
  }
}

/** Usable width inside 2cm margins on A4. */
const CONTENT_WIDTH_DXA = 9026;

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const TABLE_BORDERS = {
  top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER,
  insideHorizontal: CELL_BORDER, insideVertical: CELL_BORDER,
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline rendering
// ─────────────────────────────────────────────────────────────────────────────

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  size?: number;
  font?: string;
}

const BOLD_TAGS = new Set(['strong', 'b']);
const ITALIC_TAGS = new Set(['em', 'i']);
const UNDERLINE_TAGS = new Set(['u', 'ins']);

function mergeStyle(base: InlineStyle, node: ElementNode): InlineStyle {
  const next: InlineStyle = { ...base };
  if (BOLD_TAGS.has(node.tag)) next.bold = true;
  if (ITALIC_TAGS.has(node.tag)) next.italics = true;
  if (UNDERLINE_TAGS.has(node.tag)) next.underline = true;
  if (node.tag === 's' || node.tag === 'strike' || node.tag === 'del') next.strike = true;

  const color = parseColor(styleProp(node, 'color'));
  if (color) next.color = color;

  const weight = styleProp(node, 'font-weight');
  if (weight === 'bold' || (weight && /^[6-9]00$/.test(weight))) next.bold = true;
  if (weight === 'normal') next.bold = false;

  const fontSize = styleProp(node, 'font-size');
  if (fontSize) {
    const pt = /^([\d.]+)pt$/.exec(fontSize);
    if (pt) next.size = Math.max(4, Math.min(192, Math.round(parseFloat(pt[1]) * 2)));
    else {
      const px = /^([\d.]+)px$/.exec(fontSize);
      if (px) next.size = Math.max(4, Math.min(192, Math.round((parseFloat(px[1]) / 96) * 72 * 2)));
    }
  }
  const font = styleProp(node, 'font-family');
  if (font) {
    const first = font.split(',')[0]?.replace(/["']/g, '').trim();
    if (first) next.font = first;
  }
  return next;
}

function decodeDataUri(src: string): ImageRunModel | null {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(src.trim());
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  try {
    const buffer = m[2]
      ? Buffer.from(m[3].replace(/\s/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(m[3]), 'binary');
    if (buffer.length === 0) return null;
    return { kind: 'image', buffer, mimeType };
  } catch {
    return null;
  }
}

/** Measure PNG/GIF/JPEG so images keep their real aspect ratio. */
function imageDimensions(buf: Buffer, mimeType: string): { width: number; height: number } | null {
  try {
    if (mimeType.includes('png') && buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mimeType.includes('gif') && buf.length > 10 && buf.subarray(0, 3).toString('latin1') === 'GIF') {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) { off++; continue; }
        const marker = buf[off + 1];
        const len = buf.readUInt16BE(off + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        }
        off += 2 + len;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

const MAX_IMAGE_WIDTH_EMU = 4_500_000;

/**
 * Flatten nodes into runs, collapsing HTML whitespace the way a browser
 * would: runs of whitespace collapse to a single space, and a single space
 * is preserved between adjacent inline items so words do not fuse.
 */
function renderInline(nodes: Node[], style: InlineStyle, out: RunModel[]): void {
  const pushText = (text: string) => {
    const collapsed = text.replace(/\s+/g, ' ');
    if (!collapsed) return;
    if (collapsed.trim() === '') {
      const last = out[out.length - 1];
      if (last && last.kind === 'text' && !last.text.endsWith(' ')) last.text += ' ';
      return;
    }
    out.push({ kind: 'text', text: collapsed, ...pick(style) });
  };

  for (const node of nodes) {
    if (node.kind === 'text') {
      pushText(node.value);
      continue;
    }

    const { tag } = node;

    if (DROPPED_TAGS.has(tag)) continue;

    if (tag === 'br') {
      out.push({ kind: 'text', text: '\n' });
      continue;
    }
    if (tag === 'hr') {
      out.push({ kind: 'text', text: '\n', color: '999999' });
      continue;
    }
    if (tag === 'img') {
      const img = decodeDataUri(node.attrs.src || '');
      // A broken image is reported rather than silently dropped.
      out.push(img ?? { kind: 'text', text: '[image]', italics: true, color: '888888' });
      continue;
    }
    renderInline(node.children, mergeStyle(style, node), out);
  }
}

function pick(s: InlineStyle): InlineStyle {
  return {
    bold: s.bold, italics: s.italics, underline: s.underline,
    strike: s.strike, color: s.color, size: s.size, font: s.font,
  };
}

function trimRuns(runs: RunModel[]): RunModel[] {
  const out = runs.slice();
  const isBlank = (r: RunModel | undefined): boolean =>
    !!r && r.kind === 'text' && r.text.trim() === '';
  while (out.length && isBlank(out[0])) {
    const head = out[0];
    // Preserve an intentional leading line break inside a cell.
    if (head.kind === 'text' && head.text.includes('\n')) break;
    out.shift();
  }
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

interface GridCell {
  node: ElementNode;
  colSpan: number;
  rowSpan: number;
  isHeader: boolean;
}

function collectRows(tableNode: ElementNode): ElementNode[] {
  const rows: ElementNode[] = [];
  const walk = (n: ElementNode) => {
    for (const c of n.children) {
      if (c.kind !== 'element') continue;
      if (c.tag === 'tr') rows.push(c);
      else if (['thead', 'tbody', 'tfoot', 'div'].includes(c.tag)) walk(c);
    }
  };
  walk(tableNode);
  return rows;
}

function collectCells(rowNode: ElementNode): ElementNode[] {
  const cells: ElementNode[] = [];
  const walk = (n: ElementNode) => {
    for (const c of n.children) {
      if (c.kind !== 'element') continue;
      if (c.tag === 'td' || c.tag === 'th') cells.push(c);
      else walk(c);
    }
  };
  walk(rowNode);
  return cells;
}

/**
 * Lay a `<table>` out as a rectangular grid, expanding colspan/rowspan.
 * Word's grid must be uniform: a short row renders misaligned.
 */
function buildTable(tableNode: ElementNode, base: InlineStyle): TableModel | null {
  const rowNodes = collectRows(tableNode);
  if (rowNodes.length === 0) return null;

  const occupied = new Set<string>();
  const grid: (GridCell | null)[][] = [];
  let colCount = 0;

  rowNodes.forEach((row, r) => {
    const cells = collectCells(row);
    const line: (GridCell | null)[] = [];
    let c = 0;
    for (const cell of cells) {
      while (occupied.has(`${r}:${c}`)) c++;
      const colSpan = Math.max(1, parseInt(cell.attrs.colspan ?? '1', 10) || 1);
      const rowSpan = Math.max(1, parseInt(cell.attrs.rowspan ?? '1', 10) || 1);
      const isHeader = cell.tag === 'th';
      line[c] = { node: cell, colSpan, rowSpan, isHeader };
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) occupied.add(`${r + dr}:${c + dc}`);
      }
      c += colSpan;
      if (c > colCount) colCount = c;
    }
    grid.push(line);
  });

  if (colCount === 0) return null;

  // Column widths: honour explicit widths from the first row when present.
  const explicit: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const cell = grid[0]?.[c];
    const w = cell
      ? cssLength(styleProp(cell.node, 'width'), CONTENT_WIDTH_DXA) ?? cssLength(cell.node.attrs.width, CONTENT_WIDTH_DXA)
      : undefined;
    explicit.push(w && w > 0 ? w : 0);
  }
  const anyExplicit = explicit.some((w) => w > 0);
  const totalExplicit = explicit.reduce((a, b) => a + b, 0);
  const widths = anyExplicit
    ? explicit.map((w) => (w > 0 ? Math.max(400, Math.round((w / totalExplicit) * CONTENT_WIDTH_DXA)) : 400))
    : explicit.map(() => Math.floor(CONTENT_WIDTH_DXA / colCount));

  const headerBg = parseColor(styleProp(tableNode, 'background') ?? styleProp(tableNode, 'background-color'));

  const rows: RowModel[] = grid.map((line, r) => {
    const cells: CellModel[] = [];
    for (let c = 0; c < colCount; c++) {
      const cell = line[c];
      if (!cell) {
        // Slot covered by a rowspan from an earlier row: emit an empty cell so
        // the row keeps a uniform width.
        cells.push({ blocks: [{ kind: 'para', runs: [] }], colSpan: 1, rowSpan: 1, isHeader: false, widthDxa: widths[c] });
        continue;
      }
      const ownBg = parseColor(styleProp(cell.node, 'background-color') ?? styleProp(cell.node, 'background'));
      cells.push({
        blocks: renderBlock(cell.node.children, { ...base, bold: base.bold || cell.isHeader }),
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
        isHeader: cell.isHeader,
        fill: cell.isHeader ? ownBg ?? headerBg ?? undefined : ownBg,
        widthDxa: widths[c],
        align: alignmentOf(cell.node),
        valign: valignOf(cell.node),
      });
    }
    return { cells, isHeaderRow: r === 0 && grid[0]?.some((x) => x?.isHeader) === true };
  });

  return { kind: 'table', rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block rendering
// ─────────────────────────────────────────────────────────────────────────────

const HEADING_SIZES: Record<string, number> = { h1: 36, h2: 30, h3: 26, h4: 24, h5: 22, h6: 22 };

const BLOCK_TAGS = new Set([
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'table', 'thead', 'tbody', 'tfoot',
  'ul', 'ol', 'blockquote', 'pre', 'section', 'article', 'main', 'header', 'footer',
  'aside', 'hr', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'form', 'fieldset', 'center',
  // Document wrappers always recurse: treating them as leaf paragraphs would
  // inline every nested table and destroy the document structure.
  'html', 'body',
]);

const PASS_THROUGH_BLOCKS = new Set([
  'div', 'p', 'section', 'article', 'main', 'header', 'footer', 'figure',
  'figcaption', 'center', 'form', 'fieldset', 'body', 'html', 'dd', 'dt', 'dl', 'aside',
]);

function hasBlockChild(node: ElementNode): boolean {
  return node.children.some((c) => c.kind === 'element' && BLOCK_TAGS.has(c.tag));
}

function collectText(node: Node): string {
  if (node.kind === 'text') return node.value;
  return node.children.map(collectText).join('');
}

function paraFromInline(nodes: Node[], style: InlineStyle, align?: Align, extra?: Partial<ParaModel>): ParaModel {
  const runs: RunModel[] = [];
  renderInline(nodes, style, runs);
  return { kind: 'para', runs: trimRuns(runs), align, after: 100, ...extra };
}

function renderBlock(nodes: Node[], base: InlineStyle, listDepth = 0, ordered = false): BlockModel[] {
  const out: BlockModel[] = [];

  for (const node of nodes) {
    if (node.kind === 'text') {
      const block = paraFromInline([node], base);
      if (block.runs.length) out.push(block);
      continue;
    }

    const { tag } = node;
    if (DROPPED_TAGS.has(tag)) continue;

    // The editor stores auto/manual page breaks as
    // `<div class="doc-page-break">`; these must become real Word page
    // breaks or a multi-page document collapses onto one page.
    if (tag === 'div' && (node.attrs.class || '').split(/\s+/).includes('doc-page-break')) {
      out.push({ kind: 'pagebreak' });
      continue;
    }

    if (tag === 'table') {
      const t = buildTable(node, base);
      if (t) {
        out.push(t);
        // Word merges directly adjacent tables; force them apart.
        out.push({ kind: 'para', runs: [], after: 80 });
      }
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const isOrdered = tag === 'ol';
      for (const child of node.children) {
        if (child.kind !== 'element' || child.tag !== 'li') continue;
        const runs: RunModel[] = [];
        renderInline(child.children, base, runs);
        const block: ParaModel = {
          kind: 'para',
          runs: trimRuns(runs),
          listLevel: Math.min(listDepth, 2),
          ordered: isOrdered,
          after: 60,
        };
        // A list item may itself contain a nested list.
        const nested = child.children.filter(
          (c) => c.kind === 'element' && (c.tag === 'ul' || c.tag === 'ol')
        );
        out.push(block);
        if (nested.length) {
          out.push(...renderBlock(nested, base, listDepth + 1, isOrdered));
        }
      }
      continue;
    }

    if (tag === 'li') {
      out.push(paraFromInline(node.children, base, undefined, { after: 60, indentLeft: 360 }));
      continue;
    }

    if (tag === 'blockquote') {
      const inner = renderBlock(node.children, { ...base, italics: true }, listDepth, ordered);
      for (const el of inner) {
        if (el.kind === 'para') out.push({ ...el, indentLeft: (el.indentLeft ?? 0) + 360 });
        else out.push(el);
      }
      continue;
    }

    if (tag === 'pre') {
      const text = collectText(node).replace(/\r/g, '');
      for (const line of text.split('\n')) {
        out.push({ kind: 'para', runs: [{ kind: 'text', text: line, font: 'Courier New', size: 18 }], after: 0 });
      }
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      const runs: RunModel[] = [];
      renderInline(node.children, { ...base, bold: true, size: HEADING_SIZES[tag] }, runs);
      const trimmed = trimRuns(runs);
      if (!trimmed.length) continue;
      out.push({
        kind: 'para', runs: trimmed, align: alignmentOf(node),
        before: 240, after: 120,
      });
      continue;
    }

    if (tag === 'hr') {
      out.push({ kind: 'para', runs: [{ kind: 'text', text: '─'.repeat(40), color: 'CCCCCC' }], before: 80, after: 160 });
      continue;
    }

    if (PASS_THROUGH_BLOCKS.has(tag)) {
      if (hasBlockChild(node)) {
        out.push(...renderBlock(node.children, base, listDepth, ordered));
      } else {
        const block = paraFromInline(node.children, base, alignmentOf(node), { before: 40, after: 100 });
        if (block.runs.length) out.push(block);
      }
      continue;
    }

    // Unknown or inline element: recurse so its content is never lost.
    out.push(...renderBlock(node.children, mergeStyle(base, node), listDepth, ordered));
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model → docx
// ─────────────────────────────────────────────────────────────────────────────

const ALIGN_TO_DOCX = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const;

const VALIGN_TO_DOCX = {
  top: VerticalAlign.TOP,
  center: VerticalAlign.CENTER,
  bottom: VerticalAlign.BOTTOM,
} as const;

function toTextRun(run: TextRunModel): TextRun {
  // docx types underline as an object; `false` is not a legal value.
  const underline = run.underline ? ({ type: 'single' } as const) : undefined;
  const common = {
    bold: run.bold,
    italics: run.italics,
    underline,
    strike: run.strike,
    color: run.color,
    size: run.size,
    font: run.font,
  };
  // Newlines become real line breaks so multi-line cell text stays readable.
  const parts = run.text.split('\n');
  if (parts.length === 1) {
    return new TextRun({ ...common, text: parts[0] });
  }
  const children = parts.map((p, i) => new TextRun({ ...common, text: p, break: i === 0 ? 0 : 1 }));
  return new TextRun({ children, bold: run.bold, italics: run.italics });
}

function toRuns(runs: RunModel[]) {
  return runs.map((r) => {
    if (r.kind === 'text') return toTextRun(r);
    const type = r.mimeType.includes('png') ? 'png' : r.mimeType.includes('gif') ? 'gif' : 'jpg';
    if (!['png', 'gif', 'jpg'].includes(type)) {
      return new TextRun({ text: '[image]', italics: true, color: '888888' });
    }
    const dims = imageDimensions(r.buffer, r.mimeType);
    let width: number;
    let height: number;
    if (dims && dims.width > 0 && dims.height > 0) {
      if (dims.width >= dims.height) {
        width = Math.min(MAX_IMAGE_WIDTH_EMU, dims.width * 9525);
        height = Math.round(width * (dims.height / dims.width));
      } else {
        height = Math.min(MAX_IMAGE_WIDTH_EMU, dims.height * 9525);
        width = Math.round(height * (dims.width / dims.height));
      }
    } else {
      width = 3_000_000;
      height = 2_000_000;
    }
    try {
      return new ImageRun({
        type: type as 'png' | 'gif' | 'jpg',
        data: r.buffer,
        transformation: { width, height },
      } as never);
    } catch {
      return new TextRun({ text: '[image]', italics: true, color: '888888' });
    }
  });
}

function toParagraph(model: ParaModel): Paragraph {
  return new Paragraph({
    children: toRuns(model.runs) as never,
    alignment: model.align ? ALIGN_TO_DOCX[model.align] : undefined,
    spacing: { before: model.before ?? 0, after: model.after ?? 0 },
    indent: model.indentLeft ? { left: model.indentLeft } : undefined,
    numbering: model.listLevel !== undefined
      ? { reference: model.ordered ? 'docmint-ordered' : 'docmint-bullet', level: model.listLevel }
      : undefined,
  });
}

function toPageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } });
}

function toTable(model: TableModel): Table {
  const rows = model.rows.map(
    (row) =>
      new TableRow({
        children: row.cells.map(
          (cell) =>
            new TableCell({
              children: cell.blocks.map((b) =>
                b.kind === 'para' ? toParagraph(b) : b.kind === 'table' ? toTable(b) : toPageBreak()
              ) as never,
              borders: TABLE_BORDERS,
              shading: cell.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: cell.fill } : undefined,
              columnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
              rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
              verticalAlign: cell.valign ? VALIGN_TO_DOCX[cell.valign] : undefined,
              width: cell.widthDxa ? { size: cell.widthDxa, type: WidthType.DXA } : undefined,
            })
        ),
        cantSplit: true,
        tableHeader: row.isHeaderRow ? true : undefined,
      })
  );

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export class DOCXGenerator {
  /**
   * Generate a .docx buffer from HTML.
   *
   * Throws when the HTML yields no representable content rather than
   * returning a structurally valid but empty document.
   */
  static async generate(
    htmlContent: string,
    options: Partial<ExportOptions> & { title?: string } = {}
  ): Promise<Buffer> {
    if (typeof htmlContent !== 'string') {
      throw new Error('DOCX generation failed: htmlContent must be a string');
    }

    let model: BlockModel[];
    try {
      model = renderBlock(parseHtml(htmlContent), {});
    } catch (error) {
      throw new Error(
        `DOCX generation failed while parsing the document: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const visibleText = model
      .filter((b): b is ParaModel => b.kind === 'para')
      .map((p) => p.runs.map((r) => (r.kind === 'text' ? r.text : '[img]')).join(''))
      .join('')
      .trim();
    const hasTable = model.some((b) => b.kind === 'table');

    if (model.length === 0 || (visibleText === '' && !hasTable)) {
      throw new Error(
        'DOCX generation failed: the supplied HTML produced no document content. ' +
          'The template may be empty or contain only unsupported markup.'
      );
    }

    try {
      const doc = new Document({
        title: options.title || 'Document',
        creator: 'DocMint',
        description: 'Generated by DocMint',
        styles: { default: { document: { run: { size: 22, font: 'Calibri' } } } },
        numbering: {
          config: [
            {
              reference: 'docmint-bullet',
              levels: [0, 1, 2].map((level) => ({
                level,
                format: LevelFormat.BULLET,
                text: ['•', '◦', '▪'][level],
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 720 + level * 720, hanging: 360 } } },
              })),
            },
            {
              reference: 'docmint-ordered',
              levels: [
                { format: LevelFormat.DECIMAL, text: '%1.' },
                { format: LevelFormat.LOWER_LETTER, text: '%2.' },
                { format: LevelFormat.LOWER_ROMAN, text: '%3.' },
              ].map((lvl, level) => ({
                ...lvl,
                level,
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 720 + level * 720, hanging: 360 } } },
              })),
            },
          ],
        },
        sections: [
          {
            properties: {
              page: {
                size: { width: 11906, height: 16838 }, // A4 portrait
                margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
              },
            },
            children: (model.length ? model : [{ kind: 'para', runs: [] } as ParaModel]).map((b) =>
              b.kind === 'para' ? toParagraph(b) : b.kind === 'table' ? toTable(b) : toPageBreak()
            ) as never,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      if (!buffer || buffer.length === 0) {
        throw new Error('the writer produced an empty buffer');
      }
      return Buffer.from(buffer);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('DOCX generation failed')) throw error;
      throw new Error(
        `DOCX generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Preview helper: returns the HTML unchanged. */
  static async generatePreview(htmlContent: string): Promise<string> {
    return htmlContent;
  }

  /** Exposed so callers can normalise HTML without importing internals. */
  static decodeEntities(html: string): string {
    return decodeHtmlEntities(html);
  }
}