/**
 * Allowlist-based HTML / CSS / SVG sanitizer (server-safe, no DOM required).
 *
 * WHY THIS REPLACED THE OLD PASS
 * -----------------------------
 * The previous `sanitizeDocumentHtml` was a *blocklist* of regexes:
 *
 *   out.replace(/(href|src)\s*=\s*(['"]?)\s*javascript\s*:/gi, '$1=$2#')
 *
 * That is trivially bypassed, because the filter ran on the raw string while
 * the browser decodes entities *afterwards*:
 *
 *   <a href="&#106;avascript:alert(document.cookie)">      → executes
 *   <a href="java&#x09;script:alert(1)">                  → executes
 *   <svg><animate attributeName="href" values="javascript:…">  → executes
 *   <form action="javascript:…">                            → executes
 *
 * It also did not run at all on the two highest-risk paths — the public share
 * view API and the downloaded `.html` file — so any authenticated user could
 * publish a link that executed JavaScript in the DocMint origin for every
 * anonymous visitor (stored XSS → session theft).
 *
 * The strategy here is inverted: nothing is allowed unless it is on a list.
 * Unknown tags and unknown attributes are dropped, URL schemes are
 * allowlisted *after entity/control-character decoding* (so the classic
 * `&#106;avascript:` bypass cannot survive), and elements that can execute
 * code or re-enter an HTML parsing context are removed together with their
 * contents.
 */

// ─── Element allowlist ────────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set([
  // Structure / text
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
  'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
  'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'ins', 'kbd', 'li',
  'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's',
  'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul',
  'var', 'wbr', 'center', 'font',
  // Media (inert without allow-scripts)
  'img', 'picture', 'source',
  // Embedded document styling
  'style', 'title',
  // SVG drawing subset. Deliberately excludes script/foreignObject/animation
  // elements (see DROP_WITH_CONTENT / ALLOWED_TAGS filtering) — those are the
  // SVG equivalents of <script>.
  'svg', 'g', 'defs', 'desc', 'circle', 'ellipse', 'line', 'path', 'polygon',
  'polyline', 'rect', 'text', 'tspan', 'lineargradient', 'radialgradient',
  'stop', 'clippath', 'mask', 'marker', 'pattern', 'symbol',
]);

/**
 * Elements removed together with everything they contain.
 *
 * Only elements whose *content* is dangerous (or which re-enter an HTML
 * parsing context) belong here. Removing a tag but keeping its text is handled
 * by the unwrap path below, so legitimate content is never silently lost.
 *
 *  1. Scripting / embedding: script, iframe, object, embed, applet, base,
 *     link, meta, frame*.
 *  2. Raw-text / re-entrant parsing contexts: noscript, noembed, noframes,
 *     template, xmp, plaintext, listing, math + the SVG/MathML script carriers
 *     (foreignObject, handler). These matter for mXSS — a browser re-parses
 *     their contents as markup after sanitization, which can resurrect a
 *     payload the string-level pass already "removed".
 *
 * Note that <form> and its controls are intentionally NOT listed: they are
 * unwrapped, so their text survives. Same for the void SVG/SMIL carriers
 * (<animate>, <set>, <use>, <image>) — dropping the element is enough because
 * the payload lives in the attributes, which the allowlist removes.
 */
const DROP_WITH_CONTENT = new Set([
  'script', 'iframe', 'object', 'embed', 'applet', 'base', 'link', 'meta',
  'frame', 'frameset', 'noframes',
  'noscript', 'noembed', 'template', 'xmp', 'plaintext', 'listing',
  'math', 'mglyph', 'annotation-xml', 'foreignobject', 'handler',
]);

/** Elements whose content is raw text (not nested markup). */
const RAWTEXT_TAGS = new Set(['style', 'title', 'textarea', 'script']);

// ─── Attribute allowlist ──────────────────────────────────────────────────────

const GLOBAL_ATTRS = new Set([
  'class', 'id', 'style', 'title', 'dir', 'lang', 'role', 'align', 'valign',
  'color', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'width', 'height',
  'colspan', 'rowspan', 'headers', 'scope', 'span', 'start', 'reversed',
  'type', 'face', 'size', 'label', 'summary', 'open', 'hidden', 'datetime',
  'cite', 'sizes', 'media', 'loading', 'decoding',
]);

/** Per-element extras on top of the global set. */
const TAG_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(['href', 'name', 'target', 'rel', 'download', 'hreflang']),
  img: new Set(['src', 'alt', 'srcset', 'usemap', 'ismap', 'crossorigin', 'referrerpolicy']),
  source: new Set(['src', 'srcset', 'sizes', 'media', 'type']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  td: new Set(['colspan', 'rowspan', 'headers', 'abbr', 'axis']),
  th: new Set(['colspan', 'rowspan', 'headers', 'abbr', 'scope', 'axis']),
  ol: new Set(['start', 'reversed', 'type']),
  ul: new Set(['type']),
  li: new Set(['value']),
  time: new Set(['datetime']),
  del: new Set(['datetime', 'cite']),
  ins: new Set(['datetime', 'cite']),
  blockquote: new Set(['cite']),
  q: new Set(['cite']),
  details: new Set(['open']),
  // SVG
  svg: new Set([
    'viewbox', 'xmlns', 'xmlns:xlink', 'version', 'baseprofile', 'fill',
    'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity',
    'fill-opacity', 'fill-rule', 'stroke-opacity', 'transform', 'clip-path',
    'clip-rule', 'mask', 'preserveaspectratio', 'vector-effect',
    'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
    'dominant-baseline', 'letter-spacing', 'word-spacing', 'shape-rendering',
    'color', 'display', 'visibility', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'd', 'points', 'dx', 'dy', 'offset', 'marker-end', 'marker-start',
    'gradientunits', 'gradienttransform', 'spreadmethod', 'patternunits',
    'patterncontentunits', 'patterntransform', 'markerwidth', 'markerheight',
    'refx', 'refy', 'orient', 'lengthadjust', 'pathlength', 'rotate', 'scale',
    'textlength', 'startoffset', 'method', 'spacing', 'side', 'limitingconeangle',
  ]),
  g: new Set(['transform', 'fill', 'stroke', 'opacity', 'clip-path', 'mask', 'display', 'visibility', 'color']),
  path: new Set(['d', 'transform', 'fill', 'stroke', 'stroke-width', 'fill-rule', 'clip-rule', 'opacity', 'pathlength']),
  circle: new Set(['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity']),
  ellipse: new Set(['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity']),
  line: new Set(['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'opacity']),
  rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity']),
  polygon: new Set(['points', 'fill', 'stroke', 'stroke-width', 'opacity']),
  polyline: new Set(['points', 'fill', 'stroke', 'stroke-width', 'opacity']),
  text: new Set(['x', 'y', 'dx', 'dy', 'rotate', 'text-anchor', 'font-family', 'font-size', 'font-weight', 'fill', 'opacity', 'textlength', 'lengthadjust']),
  tspan: new Set(['x', 'y', 'dx', 'dy', 'rotate', 'text-anchor', 'font-family', 'font-size', 'font-weight', 'fill', 'opacity']),
  lineargradient: new Set(['x1', 'y1', 'x2', 'y2', 'gradientunits', 'gradienttransform', 'spreadmethod']),
  radialgradient: new Set(['cx', 'cy', 'r', 'fx', 'fy', 'gradientunits', 'gradienttransform', 'spreadmethod']),
  stop: new Set(['offset', 'stop-color', 'stop-opacity']),
  clippath: new Set(['clipPathUnits']),
  mask: new Set(['maskUnits', 'maskContentUnits', 'x', 'y', 'width', 'height']),
  pattern: new Set(['patternunits', 'patterncontentunits', 'patterntransform', 'x', 'y', 'width', 'height']),
  marker: new Set(['markerwidth', 'markerheight', 'refx', 'refy', 'orient', 'markerunits', 'viewbox']),
  symbol: new Set(['viewbox', 'preserveaspectratio']),
};

/** Attributes whose value is a URL and must pass scheme validation. */
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'cite', 'longdesc', 'poster', 'background', 'xlink:href', 'action', 'formaction', 'data']);

/**
 * URL schemes permitted in a sanitized attribute.
 * `data:` is handled separately (image types only).
 */
const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'ftp']);

// ─── URL validation ───────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', sol: '/',
  tab: '\t', newline: '\n', nbsp: ' ',
};

/**
 * Decode HTML entities (numeric + named), repeatedly, so the value we test for
 * a dangerous scheme is the value the *browser* will eventually see.
 * This is what closes `&#106;avascript:` and `java&#x09;script:`.
 */
function decodeEntities(value: string): string {
  let out = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = out.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});?/g, (match, entity: string) => {
      if (entity.startsWith('#')) {
        const isHex = entity[1] === 'x' || entity[1] === 'X';
        const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      const named = NAMED_ENTITIES[entity.toLowerCase()];
      return named ?? match;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Remove characters browsers ignore when parsing a URL scheme. */
function stripUrlNoise(value: string): string {
  return value.replace(/[\u0000-\u0020\u007f\u00a0\u200b-\u200f\ufeff]/g, '');
}

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|bmp|x-icon)[;,]/i;

/**
 * Return true when a URL is safe to keep.
 * Rejects: any scheme not on the allowlist (javascript, vbscript, file, blob,
 * about, data:text/html …), after entity decoding and noise stripping.
 */
export function isSafeUrl(rawValue: string): boolean {
  if (typeof rawValue !== 'string') return false;
  const decoded = stripUrlNoise(decodeEntities(rawValue));
  if (decoded === '') return true; // empty / attribute present without value

  // Relative URL (no scheme).
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(decoded);
  if (!schemeMatch) return true;

  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === 'data') {
    // Only raster image data URLs. `data:image/svg+xml` is *allowed* in <img>
    // because an <img> never executes SVG script — but the codebase converts
    // those to inline <svg> (replaceSvgDataUris), so that conversion runs its
    // own dedicated sanitizer, sanitizeSvgMarkup().
    return DATA_IMAGE_RE.test(decoded) || /^data:image\/svg\+xml[;,]/i.test(decoded);
  }
  return SAFE_URL_SCHEMES.has(scheme);
}

/** `srcset` is a comma-separated list — every candidate must be safe. */
function isSafeSrcset(rawValue: string): boolean {
  return rawValue
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .every((url) => isSafeUrl(url));
}

// ─── CSS sanitization ─────────────────────────────────────────────────────────

const DANGEROUS_CSS = /(expression\s*\(|behaviou?r\s*:|-moz-binding|javascript\s*:|vbscript\s*:|@import|url\s*\(\s*['"]?\s*(?:javascript|vbscript|data:text\/html))/i;

/** Strip dangerous constructs from a CSS fragment (declaration or stylesheet). */
export function sanitizeCss(css: string): string {
  if (typeof css !== 'string') return '';
  let out = css;
  if (DANGEROUS_CSS.test(out)) {
    // Drop the whole block rather than trying to surgically excise tokens —
    // `expression(` can be split across comments and re-joined by the browser.
    out = out.replace(/@import[^;]*;?/gi, '');
    out = out.replace(/expression\s*\([^)]*\)/gi, '');
    out = out.replace(/(behaviou?r|-moz-binding)\s*:[^;}]*/gi, '');
    out = out.replace(/url\s*\(\s*['"]?\s*(?:javascript|vbscript)[^)]*\)/gi, 'none');
    if (DANGEROUS_CSS.test(out)) return '';
  }
  // Neutralise CSS comment splicing used to hide keywords.
  return out.replace(/\/\*[\s\S]*?\*\//g, '');
}

// ─── Attribute parsing ────────────────────────────────────────────────────────

/** Matches name[=value] allowing quoted, unquoted and bare values. */
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g;

function unquote(value: string | undefined): string {
  if (value === undefined) return '';
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** True when an attribute name may be emitted at all. */
function isAllowedAttribute(tag: string, name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return false;          // every event handler
  if (lower.startsWith('xmlns:')) return false;      // namespace declarations
  if (lower.startsWith('data-') || lower.startsWith('aria-')) return true; // inert
  if (GLOBAL_ATTRS.has(lower)) return true;
  return TAG_ATTRS[tag]?.has(lower) ?? false;
}

/**
 * Rebuild an opening tag from its raw attribute text, keeping only allowed
 * attributes. Allowed attributes are re-emitted **verbatim** (original
 * quoting/whitespace preserved) so sanitization is a no-op for clean markup.
 */
function filterAttributes(tag: string, rawAttrs: string): string {
  if (!rawAttrs.trim()) return '';

  const kept: string[] = [];
  const hasTargetBlank = /(^|\s)target\s*=\s*("|')?_blank/i.test(rawAttrs);

  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(rawAttrs)) !== null) {
    const name = match[1];
    const lower = name.toLowerCase();
    const value = unquote(match[2]);

    if (!isAllowedAttribute(tag, lower)) continue;

    if (lower === 'style') {
      const safe = sanitizeCss(value);
      if (!safe.trim()) continue;
      kept.push(`style="${escapeAttributeValue(safe)}"`);
      continue;
    }

    if (URL_ATTRS.has(lower)) {
      const ok = lower === 'srcset' ? isSafeSrcset(value) : isSafeUrl(value);
      if (!ok) continue;
    }

    kept.push(match[0]);
  }

  // A link that opens a new tab must not hand the target a window.opener
  // reference (reverse tabnabbing).
  if (tag === 'a' && hasTargetBlank) {
    const hasNoOpener = /(^|\s)rel\s*=\s*("|')?[^"']*\bnoopener\b/i.test(rawAttrs);
    if (!hasNoOpener) kept.push('rel="noopener noreferrer"');
  }

  return kept.length ? ' ' + kept.join(' ') : '';
}

/** Escape a value that is being placed inside a double-quoted attribute. */
function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Tag tokenizer ────────────────────────────────────────────────────────────

/**
 * Quote-aware tag matcher. Handles `>` inside quoted attribute values, which a
 * naive `<[^>]*>` regex does not (e.g.
 * `<iframe src="data:text/html,<script>…</script>">`).
 */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:._-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/**
 * Sanitize an HTML fragment.
 *
 * Allowlist semantics: unknown elements are unwrapped (children preserved),
 * scripting/embedding elements are removed with their subtree, unknown
 * attributes are dropped, and URL-bearing attributes are scheme-checked after
 * entity decoding.
 */
export function sanitizeHtmlFragment(input: string): string {
  if (!input) return '';

  // 1. Comments, CDATA sections and processing instructions can hide markup
  //    from the tokenizer while still being parsed by the browser.
  let html = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!--[\s\S]*$/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '');

  // 2. Pre-escape the one element whose whitespace is significant, so the
  //    leading newline after <pre> is not eaten by the HTML parser.
  html = html.replace(/<pre\b([^>]*)>/gi, '<pre data-dm-preopen="1"$1>');

  const out: string[] = [];
  let cursor = 0;
  let dropTag: string | null = null;
  let pendingPre = false;

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_RE.exec(html)) !== null) {
    const [, closing, rawName, rawAttrs = ''] = match;
    const name = rawName.toLowerCase();

    // Content of a dropped element is discarded wholesale.
    if (dropTag) {
      if (closing && name === dropTag) dropTag = null;
      cursor = TAG_RE.lastIndex;
      continue;
    }

    out.push(html.slice(cursor, match.index));
    cursor = TAG_RE.lastIndex;

    if (pendingPre) {
      if (!closing) out.push('\n');
      pendingPre = false;
    }

    if (closing) {
      // Stray close tags for unknown elements are simply ignored.
      if (ALLOWED_TAGS.has(name) || name === 'pre') {
        if (name === 'pre') out.push('</pre>');
        else out.push(`</${name}>`);
      }
      continue;
    }

    // Removed entirely, contents included.
    if (DROP_WITH_CONTENT.has(name)) {
      // Fail-closed, and browser-accurate: for a non-void element an absent
      // `</script>`/`</iframe>` end tag means the parser treats everything to
      // the end of the document as that element's content. The self-closing
      // syntax (`<script/>`) is ignored on non-void HTML elements, so it does
      // not terminate the content either.
      if (!VOID_TAGS.has(name)) dropTag = name;
      continue;
    }

    // Unknown element: unwrap (drop the tag, keep its children).
    if (!ALLOWED_TAGS.has(name)) continue;

    // Raw-text element: keep the content, sanitized as CSS.
    if (RAWTEXT_TAGS.has(name)) {
      const closer = new RegExp(`</${name}\\s*>`, 'i');
      const rest = html.slice(TAG_RE.lastIndex);
      const closerMatch = closer.exec(rest);
      const inner = closerMatch ? rest.slice(0, closerMatch.index) : rest;
      const attributes = filterAttributes(name, rawAttrs);
      const selfClosed = /\/\s*$/.test(rawAttrs);

      if (name === 'style') {
        const css = sanitizeCss(inner);
        if (css.trim()) out.push(`<style${attributes}>${css}</style>`);
        if (closerMatch) cursor = TAG_RE.lastIndex + closerMatch.index + closerMatch[0].length;
        TAG_RE.lastIndex = cursor;
        continue;
      }

      if (name === 'title') {
        // <title> content is RCDATA: escape it so it cannot become markup.
        out.push(`<title${attributes}>${escapeText(inner)}</title>`);
        if (closerMatch) cursor = TAG_RE.lastIndex + closerMatch.index + closerMatch[0].length;
        TAG_RE.lastIndex = cursor;
        continue;
      }

      if (!selfClosed) dropTag = name; // unreachable for allowed tags, safety net
      continue;
    }

    const attributes = filterAttributes(name, rawAttrs);
    // Reproduce the original closing form so sanitizing valid markup is a
    // byte-for-byte no-op: `<rect …/>` stays `<rect …/>`, `<img src="x" />`
    // keeps its space, and a URL that merely ends in `/` is not mistaken for
    // a self-closing slash (it ends in a quote, so the regex below misses it).
    const suffix = /\s*\/$/.exec(rawAttrs)?.[0] ?? '';

    if (name === 'pre') {
      pendingPre = true;
      out.push(`<pre${attributes}>`);
      continue;
    }

    out.push(`<${name}${attributes}${suffix}>`);
  }

  // If a drop-with-content element was never closed, the trailing text is that
  // element's content and must not be emitted.
  if (!dropTag) out.push(html.slice(cursor));

  return out
    .join('')
    .replace(/<pre data-dm-preopen="1"([^>]*)>/g, '<pre$1>')
    .replace(/<\/pre\s*>\s*<\/pre\s*>/gi, '</pre>');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

/**
 * Sanitize standalone SVG markup (the payload of a `data:image/svg+xml` URI).
 *
 * In an `<img>` context SVG is inert and cannot execute script, but DocMint
 * intentionally inlines these payloads (`replaceSvgDataUris`) to fix Chromium
 * rendering. Once inlined the SVG is *live DOM*: `<script>`, `onload`,
 * `<foreignObject><iframe>` and `<animate attributeName="href">` all execute.
 * This function is the gate that makes that transformation safe.
 */
export function sanitizeSvgMarkup(markup: string): string {
  if (typeof markup !== 'string' || !markup) return '';

  // Step 1 — strip SVG-specific carriers from the raw payload. These passes
  // are defence in depth: the allowlist sanitizer below independently drops
  // every one of these elements and every on* attribute. Running them first
  // means the sanitizer receives already-defanged input and re-serializes the
  // tags cleanly (no orphaned whitespace where an attribute used to be).
  const out = markup
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<foreignObject\b[^>]*\/?>/gi, '')
    .replace(/<(animate|animateTransform|animateMotion|set|handler)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(animate|animateTransform|animateMotion|set|handler)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // A static drawing has no use for a link target other than a same-document
    // fragment, so every href is dropped unless it starts with '#'.
    .replace(/(xlink:href|href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, attr: string, value: string) => {
      const raw = value.replace(/^["']|["']$/g, '');
      return raw.trim().startsWith('#') ? m : '';
    });

  // Step 2 — the authoritative allowlist pass.
  return sanitizeHtmlFragment(out);
}

export default sanitizeHtmlFragment;
