import { describe, it, expect } from 'vitest';
import {
  sanitizeHtmlFragment,
  sanitizeSvgMarkup,
  isSafeUrl,
} from './sanitize-html';

// ---------------------------------------------------------------------------
// These are the payloads the old regex blocklist in document-engine.ts was
// defeated by. Every one of them executed in the DocMint origin when rendered
// through a public share link or a downloaded .html file.
// ---------------------------------------------------------------------------

describe('sanitizeHtmlFragment', () => {
  describe('script element removal', () => {
    it('removes script elements and their contents', () => {
      expect(sanitizeHtmlFragment('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
      expect(sanitizeHtmlFragment('<SCRIPT>alert(1)</SCRIPT>ok')).toBe('ok');
      expect(sanitizeHtmlFragment('<script src="https://evil.com/x.js"></script>ok')).toBe('ok');
    });

    it('removes an unclosed script element and swallows the rest of the input', () => {
      // Fail-closed: an unterminated <script> means everything after it is
      // script source as far as the browser is concerned.
      expect(sanitizeHtmlFragment('<p>ok</p><script>alert(1)')).toBe('<p>ok</p>');
    });

    it('does not let a nested "<scr<script>" smuggle a script element through', () => {
      // The HTML tokenizer reads `<scr<script>` as one unknown element named
      // "scr<script"; the remainder is plain text in the browser too, so the
      // requirement is that no <script> element survives — not that the text
      // is removed.
      const out = sanitizeHtmlFragment('<scr<script>ipt>alert(1)</script>');
      expect(out).not.toContain('<script');
      expect(out).not.toContain('</script');
    });
  });

  describe('embedding / navigation elements', () => {
    it('removes iframe, object, embed, base, link, meta and form', () => {
      const out = sanitizeHtmlFragment(
        '<div>x</div><iframe src="https://evil.com"></iframe>' +
          '<object data="x"></object><embed src="x"><base href="https://evil.com">' +
          '<link rel="stylesheet" href="x.css"><meta http-equiv="refresh" content="0;url=https://evil.com">' +
          '<form action="javascript:alert(1)"><button>go</button></form>'
      );
      expect(out).toBe('<div>x</div>go');
    });

    it('removes a form but keeps its inner content', () => {
      expect(sanitizeHtmlFragment('<form><p>text</p></form>')).toBe('<p>text</p>');
    });

    it('handles > inside a quoted attribute value (quote-aware tokenizer)', () => {
      const out = sanitizeHtmlFragment('<iframe src="data:text/html,<script>1</script>">');
      expect(out).not.toContain('data:text/html');
      expect(out).not.toContain('script');
    });
  });

  describe('event handlers', () => {
    it('removes every on* attribute', () => {
      const out = sanitizeHtmlFragment('<img src="x.png" onerror="alert(1)" onload="evil()" alt="a">');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('onload');
      expect(out).toContain('src="x.png"');
      expect(out).toContain('alt="a"');
    });

    it('removes event handlers regardless of case or quoting', () => {
      expect(sanitizeHtmlFragment("<div ONCLICK='x()'>a</div>")).toBe('<div>a</div>');
      expect(sanitizeHtmlFragment('<div onmouseover=x()>a</div>')).toBe('<div>a</div>');
    });
  });

  describe('URL scheme validation (the old blocklist bypass)', () => {
    it('blocks plain javascript: and case variants', () => {
      expect(sanitizeHtmlFragment('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
      expect(sanitizeHtmlFragment('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toContain('JaVaScRiPt');
    });

    it('blocks entity-encoded schemes: &#106;avascript:', () => {
      // The browser decodes the entity, so the string-level regex missed it.
      const out = sanitizeHtmlFragment('<a href="&#106;avascript:alert(1)">x</a>');
      expect(out).not.toContain('avascript:alert');
      expect(out).toBe('<a>x</a>');
    });

    it('blocks hex entity-encoded schemes: &#x6a;avascript:', () => {
      const out = sanitizeHtmlFragment('<a href="&#x6a;avascript:alert(document.cookie)">x</a>');
      expect(out).toBe('<a>x</a>');
    });

    it('blocks schemes split with an embedded tab/newline entity', () => {
      expect(sanitizeHtmlFragment('<a href="java&#x09;script:alert(1)">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHtmlFragment('<a href="java&Tab;script:alert(1)">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHtmlFragment('<a href="java\nscript:alert(1)">x</a>')).toBe('<a>x</a>');
    });

    it('blocks double-encoded schemes', () => {
      expect(sanitizeHtmlFragment('<a href="&amp;#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
    });

    it('blocks vbscript:, data:text/html and other non-allowlisted schemes', () => {
      expect(sanitizeHtmlFragment('<img src="vbscript:msgbox(1)">')).not.toContain('vbscript:');
      expect(sanitizeHtmlFragment('<a href="data:text/html,<script>1</script>">x</a>')).not.toContain('data:text/html');
      expect(sanitizeHtmlFragment('<a href="file:///etc/passwd">x</a>')).not.toContain('file:');
      expect(sanitizeHtmlFragment('<a href="blob:https://x/y">x</a>')).not.toContain('blob:');
    });

    it('keeps safe schemes and relative URLs', () => {
      expect(sanitizeHtmlFragment('<a href="https://safe.com">ok</a>')).toContain('https://safe.com');
      expect(sanitizeHtmlFragment('<a href="mailto:a@b.com">ok</a>')).toContain('mailto:');
      expect(sanitizeHtmlFragment('<a href="/dashboard">ok</a>')).toContain('/dashboard');
      expect(sanitizeHtmlFragment('<a href="#anchor">ok</a>')).toContain('#anchor');
      expect(sanitizeHtmlFragment('<img src="/logo.png" alt="l">')).toContain('/logo.png');
      expect(sanitizeHtmlFragment('<img src="data:image/png;base64,iVBOR" alt="p">')).toContain('data:image/png');
    });

    it('validates every candidate in a srcset', () => {
      const out = sanitizeHtmlFragment('<img src="/a.png" srcset="/a.png 1x, javascript:alert(1) 2x">');
      expect(out).not.toContain('javascript:');
    });
  });

  describe('SVG / MathML script carriers', () => {
    it('removes <animate attributeName="href"> navigation', () => {
      const out = sanitizeHtmlFragment(
        '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>click</text></a></svg>'
      );
      expect(out).not.toContain('javascript:');
      expect(out).not.toContain('animate');
    });

    it('removes <animate> with a payload body', () => {
      const out = sanitizeHtmlFragment('<svg><animate xlink:href="#a" values="javascript:alert(1)"></animate></svg>');
      expect(out).not.toContain('javascript:');
    });

    it('removes <foreignObject>, <use> and <set>', () => {
      const out = sanitizeHtmlFragment(
        '<svg><foreignObject><body><img src=x onerror=alert(1)></body></foreignObject><use href="#x"/><set attributeName="onload" to="alert(1)"/></svg>'
      );
      expect(out).not.toContain('foreignObject');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('<use');
      expect(out).not.toContain('<set');
    });

    it('removes <script> nested inside <svg>', () => {
      const out = sanitizeHtmlFragment('<svg><script>alert(1)</script><circle r="5"/></svg>');
      expect(out).not.toContain('alert(1)');
      expect(out).toContain('<circle r="5"/>');
    });

    it('drops xlink:href pointing at javascript:', () => {
      const out = sanitizeHtmlFragment('<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>');
      expect(out).not.toContain('javascript:');
    });
  });

  describe('CSS vectors', () => {
    it('strips style attributes smuggling url(javascript:)', () => {
      const out = sanitizeHtmlFragment('<div style="background:url(javascript:alert(1))">x</div>');
      expect(out).not.toContain('javascript:');
    });

    it('drops expression() and -moz-binding in style attributes', () => {
      expect(sanitizeHtmlFragment('<div style="width:expression(alert(1))">x</div>')).not.toContain('expression');
      expect(sanitizeHtmlFragment('<div style="-moz-binding:url(evil.xml#x)">y</div>')).not.toContain('-moz-binding');
    });

    it('strips @import from <style> blocks but keeps legitimate CSS', () => {
      const out = sanitizeHtmlFragment('<style>.x{font-weight:bold}</style>');
      expect(out).toBe('<style>.x{font-weight:bold}</style>');
      const evil = sanitizeHtmlFragment('<style>@import url("https://evil.com/x.css");.a{color:red}</style>');
      expect(evil).not.toContain('@import');
    });

    it('drops an entire style block that still looks dangerous after cleaning', () => {
      const out = sanitizeHtmlFragment('<style>.a{background:url(javascript:alert(1))}</style>');
      expect(out).not.toContain('javascript');
    });
  });

  describe('mutation XSS (mXSS) raw-text contexts', () => {
    it('removes noscript, template, xmp and plaintext with their contents', () => {
      expect(sanitizeHtmlFragment('<noscript><p>x</p></noscript>')).toBe('');
      expect(sanitizeHtmlFragment('<template><img src=x onerror=alert(1)></template>')).toBe('');
      expect(sanitizeHtmlFragment('<xmp><script>alert(1)</script></xmp>')).toBe('');
      expect(sanitizeHtmlFragment('<plaintext><script>alert(1)</script>')).toBe('');
    });

    it('removes MathML annotation carriers', () => {
      const out = sanitizeHtmlFragment('<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('img');
    });

    it('strips comments (they can hide markup from a string-level filter)', () => {
      expect(sanitizeHtmlFragment('<!-- <script>alert(1)</script> -->ok')).toBe('ok');
      expect(sanitizeHtmlFragment('a<!--[if IE]><script>alert(1)</script><![endif]-->b')).toBe('ab');
    });

    it('escapes <title> content', () => {
      expect(sanitizeHtmlFragment('<title></title><img src=x>')).toContain('<img src=x>');
    });
  });

  describe('allowlist behaviour', () => {
    it('unwraps unknown elements but keeps their text', () => {
      expect(sanitizeHtmlFragment('<custom-el>hello</custom-el>')).toBe('hello');
      expect(sanitizeHtmlFragment('<xmp>')).toBe('');
    });

    it('drops unknown attributes', () => {
      const out = sanitizeHtmlFragment('<p data-x="1" foo="bar" class="keep">t</p>');
      expect(out).toBe('<p data-x="1" class="keep">t</p>');
    });

    it('keeps inert data-* and aria-* attributes', () => {
      const out = sanitizeHtmlFragment('<p data-foo="1" aria-label="x">t</p>');
      expect(out).toContain('data-foo="1"');
      expect(out).toContain('aria-label="x"');
    });

    it('adds rel=noopener to target=_blank links (reverse tabnabbing)', () => {
      const out = sanitizeHtmlFragment('<a href="https://x.com" target="_blank">x</a>');
      expect(out).toContain('noopener');
    });

    it('preserves attribute quoting so clean markup is unchanged', () => {
      expect(sanitizeHtmlFragment('<img src=x>')).toBe('<img src=x>');
      expect(sanitizeHtmlFragment('<img src="x" />')).toBe('<img src="x" />');
      expect(sanitizeHtmlFragment('<td style="color:red">A</td>')).toBe('<td style="color:red">A</td>');
    });
  });

  describe('legitimate document markup', () => {
    it('keeps tables, styles, SVG drawings and data-URI images intact', () => {
      const legit =
        '<table><tr><td style="color:red">A</td></tr></table>' +
        '<style>.x{font-weight:bold}</style>' +
        '<svg width="10"><circle cx="5" cy="5" r="4"/></svg>' +
        '<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="logo">';
      const out = sanitizeHtmlFragment(legit);
      expect(out).toContain('<table>');
      expect(out).toContain('<style>.x{font-weight:bold}</style>');
      expect(out).toContain('<svg');
      expect(out).toContain('<circle cx="5" cy="5" r="4"/>');
      expect(out).toContain('data:image/svg+xml');
      expect(out).toContain('style="color:red"');
    });

    it('preserves the leading newline inside <pre>', () => {
      expect(sanitizeHtmlFragment('<pre>\nline1\nline2</pre>')).toBe('<pre>\nline1\nline2</pre>');
    });

    it('returns an empty string for empty input', () => {
      expect(sanitizeHtmlFragment('')).toBe('');
    });
  });
});

describe('isSafeUrl', () => {
  it('accepts http, https, mailto, tel, relative and fragment URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('mailto:a@b.com')).toBe(true);
    expect(isSafeUrl('tel:+911234567890')).toBe(true);
    expect(isSafeUrl('/relative/path.png')).toBe(true);
    expect(isSafeUrl('#frag')).toBe(true);
    expect(isSafeUrl('')).toBe(true);
  });

  it('rejects script and non-web schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('blob:https://x/y')).toBe(false);
    expect(isSafeUrl('about:blank')).toBe(false);
  });

  it('rejects entity- and control-character-obfuscated schemes', () => {
    expect(isSafeUrl('&#106;avascript:alert(1)')).toBe(false);
    expect(isSafeUrl('&#x6a;avascript:alert(1)')).toBe(false);
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false);
    expect(isSafeUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeUrl(' \u0000javascript:alert(1)')).toBe(false);
  });
});

describe('sanitizeSvgMarkup', () => {
  it('removes script, event handlers and foreignObject from an inline payload', () => {
    const payload =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
      '<script>alert(2)</script>' +
      '<foreignObject><body><img src=x onerror=alert(3)></body></foreignObject>' +
      '<rect width="10" height="10" fill="red"/>' +
      '</svg>';
    const out = sanitizeSvgMarkup(payload);
    expect(out).not.toContain('onload');
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('alert(2)');
    expect(out).not.toContain('alert(3)');
    expect(out).not.toContain('foreignObject');
    expect(out).toContain('<rect width="10" height="10" fill="red"/>');
  });

  it('removes SMIL animation elements that can rewrite href', () => {
    const out = sanitizeSvgMarkup(
      '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>'
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('animate');
  });

  it('keeps same-document fragment references but drops external ones', () => {
    expect(sanitizeSvgMarkup('<svg><use href="#grad"/></svg>')).not.toContain('javascript');
    expect(sanitizeSvgMarkup('<svg><a href="https://evil.com"><text>x</text></a></svg>')).toContain(
      '<a>'
    );
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeSvgMarkup('')).toBe('');
  });
});
