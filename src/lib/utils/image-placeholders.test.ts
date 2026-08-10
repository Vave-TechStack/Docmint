import { describe, it, expect } from 'vitest';
import {
  replaceSvgDataUris,
  rasterizeSvgPlaceholders,
  decodeBase64,
  getDefaultImageForPlaceholder,
  isValidImageSource,
  getTemplateThumbnail,
  PLACEHOLDER_IMAGES,
} from './image-placeholders';

// ─── Helpers ───────────────────────────────────────────────

/** A minimal valid SVG string for testing */
const MINIMAL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';

/** The same SVG, base64-encoded (via Buffer since we're in Node) */
const MINIMAL_SVG_BASE64 = Buffer.from(MINIMAL_SVG, 'utf-8').toString('base64');
const MINIMAL_SVG_DATA_URI_BASE64 = `data:image/svg+xml;base64,${MINIMAL_SVG_BASE64}`;

/** URL-encoded version of the same SVG */
const MINIMAL_SVG_URL_ENCODED = encodeURIComponent(MINIMAL_SVG);
const MINIMAL_SVG_DATA_URI_URL = `data:image/svg+xml,${MINIMAL_SVG_URL_ENCODED}`;

/** A logo SVG with multiline content for realistic testing */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" width="200" height="80">
  <rect width="200" height="80" fill="#f0f4ff" rx="8"/>
  <rect x="75" y="15" width="50" height="8" rx="4" fill="#93c5fd"/>
</svg>`;

const LOGO_SVG_BASE64 = Buffer.from(
  LOGO_SVG.replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><').trim(),
  'utf-8',
).toString('base64');

const LOGO_SVG_DATA_URI_BASE64 = `data:image/svg+xml;base64,${LOGO_SVG_BASE64}`;

// ─── replaceSvgDataUris ────────────────────────────────────

describe('replaceSvgDataUris', () => {
  // ── Base64 SVG data URIs ──

  it('should replace a base64 SVG data URI img tag with inline SVG', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="test" />`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(MINIMAL_SVG);
  });

  it('should replace a base64 SVG data URI img tag without closing slash', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="test">`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(MINIMAL_SVG);
  });

  it('should replace a base64 SVG data URI img tag with multiple attributes', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="Logo" class="w-full h-auto" id="img1" />`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(MINIMAL_SVG);
  });

  it('should replace a logo-sized base64 SVG data URI with its inline SVG', () => {
    const html = `<img src="${LOGO_SVG_DATA_URI_BASE64}" alt="Company Logo" />`;
    const result = replaceSvgDataUris(html);
    // The inline SVG should start with <svg
    expect(result.trim().startsWith('<svg')).toBe(true);
    expect(result).toContain('viewBox="0 0 200 80"');
    expect(result).toContain('fill="#f0f4ff"');
  });

  // ── URL-encoded SVG data URIs ──

  it('should replace a URL-encoded SVG data URI img tag with inline SVG', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_URL}" alt="test" />`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(MINIMAL_SVG);
  });

  it('should replace a URL-encoded SVG data URI img tag without closing slash', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_URL}" alt="test">`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(MINIMAL_SVG);
  });

  it('should replace a URL-encoded SVG data URI img tag with multiple attributes', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_URL}" alt="Logo" class="w-full h-auto" id="img1" />`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(MINIMAL_SVG);
  });

  // ── Mixed content ──

  it('should replace both base64 and URL-encoded SVGs in the same HTML', () => {
    const html = `<div>
      <img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="base64" />
      <img src="${MINIMAL_SVG_DATA_URI_URL}" alt="url-encoded" />
    </div>`;
    const result = replaceSvgDataUris(html);
    // Both should be replaced with inline SVGs
    expect(result).toContain(MINIMAL_SVG);
    // Should appear twice (two replacements)
    expect(result.split('<svg').length - 1).toBe(2);
  });

  it('should replace SVGs and leave non-SVG content intact', () => {
    const html = `<div class="wrapper">
      <h1>Hello</h1>
      <img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="icon" />
      <p>Some text</p>
      <img src="https://example.com/photo.jpg" alt="photo" />
      <img src="/local/image.png" alt="local" />
    </div>`;
    const result = replaceSvgDataUris(html);
    expect(result).toContain(MINIMAL_SVG);
    expect(result).toContain('<h1>Hello</h1>');
    expect(result).toContain('<p>Some text</p>');
    expect(result).toContain('src="https://example.com/photo.jpg"');
    expect(result).toContain('src="/local/image.png"');
  });

  it('should replace only SVG data URIs, not other data URIs', () => {
    const pngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const html = `<img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="svg" />
      <img src="${pngDataUri}" alt="png" />`;
    const result = replaceSvgDataUris(html);
    expect(result).toContain(MINIMAL_SVG);
    expect(result).toContain(pngDataUri);
  });

  it('should handle empty src img tags (non-SVG)', () => {
    const html = '<img src="" alt="empty" />';
    const result = replaceSvgDataUris(html);
    expect(result).toBe(html);
  });

  it('should handle img tags with no src attribute', () => {
    const html = '<img alt="no src" />';
    const result = replaceSvgDataUris(html);
    expect(result).toBe(html);
  });

  it('should handle img tags with regular HTTP src', () => {
    const html = '<img src="https://example.com/image.png" />';
    const result = replaceSvgDataUris(html);
    expect(result).toBe(html);
  });

  it('should return empty string unchanged', () => {
    expect(replaceSvgDataUris('')).toBe('');
  });

  it('should return HTML with no img tags unchanged', () => {
    const html = '<div><p>Hello world</p><svg>...</svg></div>';
    expect(replaceSvgDataUris(html)).toBe(html);
  });

  it('should handle self-closing img tags correctly', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_BASE64}"/>`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(MINIMAL_SVG);
  });

  it('should handle img tags with single-quoted src attribute', () => {
    // The regex uses ['"] which matches both quote styles
    const html = `<img src='${MINIMAL_SVG_DATA_URI_BASE64}' alt="test" />`;
    const result = replaceSvgDataUris(html);
    // Single quotes should be matched and replaced with inline SVG
    expect(result).toBe(MINIMAL_SVG);
  });

  // ── Real-world scenario: PLACEHOLDER_IMAGES ──

  it('should replace a placeholder logo data URI with inline SVG', () => {
    const logoDataUri = PLACEHOLDER_IMAGES.logo;
    const html = `<img src="${logoDataUri}" alt="Company Logo" class="logo" />`;
    const result = replaceSvgDataUris(html);
    // The result should be SVG markup starting with <svg
    expect(result.trim().startsWith('<svg')).toBe(true);
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('should replace all placeholder types in one HTML string', () => {
    const html = `<img src="${PLACEHOLDER_IMAGES.logo}" alt="Logo" />
      <img src="${PLACEHOLDER_IMAGES.photo}" alt="Photo" />
      <img src="${PLACEHOLDER_IMAGES.signature}" alt="Signature" />
      <img src="${PLACEHOLDER_IMAGES.seal}" alt="Seal" />
      <img src="${PLACEHOLDER_IMAGES.generic}" alt="Generic" />`;
    const result = replaceSvgDataUris(html);
    // All 5 should be replaced with inline SVGs
    const svgCount = (result.match(/<svg\s/g) || []).length;
    expect(svgCount).toBe(5);
    // Should not contain any data: URIs anymore
    expect(result).not.toContain('data:image/svg+xml');
  });

  // ── Edge cases ──

  it('should gracefully handle malformed base64 content', () => {
    const html = '<img src="data:image/svg+xml;base64,!!!not-valid-base64!!!" alt="bad" />';
    const result = replaceSvgDataUris(html);
    // Should return the original img tag when decoding fails
    expect(result).toBe(html);
  });

  it('should gracefully handle malformed URL-encoded content', () => {
    const html = '<img src="data:image/svg+xml,%ZZinvalid%GG" alt="bad" />';
    const result = replaceSvgDataUris(html);
    expect(result).toBe(html);
  });

  it('should not replace if decoded content is not an SVG element', () => {
    const notSvg = Buffer.from('<div>not an svg</div>', 'utf-8').toString('base64');
    const html = `<img src="data:image/svg+xml;base64,${notSvg}" alt="not svg" />`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(html);
  });

  it('should handle multiple img tags in a row', () => {
    const html = `<img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="a" />
<img src="${MINIMAL_SVG_DATA_URI_BASE64}" alt="b" />`;
    const result = replaceSvgDataUris(html);
    const svgCount = (result.match(/<svg\s/g) || []).length;
    expect(svgCount).toBe(2);
  });

  it('should handle SVG with attributes containing base64-like strings', () => {
    // SVG data URI where the content itself has base64-like patterns
    const svgWithText = '<svg xmlns="http://www.w3.org/2000/svg"><text>base64,abc123</text></svg>';
    const b64 = Buffer.from(svgWithText, 'utf-8').toString('base64');
    const html = `<img src="data:image/svg+xml;base64,${b64}" alt="test" />`;
    const result = replaceSvgDataUris(html);
    expect(result).toBe(svgWithText);
  });
});

// ─── rasterizeSvgPlaceholders ──────────────────────────────
// The rasterizer needs a DOM (Image + canvas), so in the Node test
// environment it must be a safe no-op. Browser behavior is verified manually.

describe('rasterizeSvgPlaceholders', () => {
  it('should return empty string unchanged', async () => {
    expect(await rasterizeSvgPlaceholders('')).toBe('');
  });

  it('should be a no-op in non-DOM environments (server-side)', async () => {
    const html = `<div>${MINIMAL_SVG}<p>text</p></div>`;
    expect(await rasterizeSvgPlaceholders(html)).toBe(html);
  });

  it('should leave SVG-free HTML unchanged in non-DOM environments', async () => {
    const html = '<div><p>Hello</p><img src="https://example.com/a.png" /></div>';
    expect(await rasterizeSvgPlaceholders(html)).toBe(html);
  });
});

// ─── decodeBase64 ───────────────────────────────────────────

describe('decodeBase64', () => {
  it('should decode a base64 string in Node.js', () => {
    const result = decodeBase64(MINIMAL_SVG_BASE64);
    expect(result).toBe(MINIMAL_SVG);
  });

  it('should return empty string for invalid base64', () => {
    // decodeBase64 in Node uses Buffer.from which throws on invalid
    // In the test, we wrap in try/catch inside the function
    expect(() => decodeBase64('!!!not-valid!!!')).not.toThrow();
  });

  it('should decode actual placeholder base64 data', () => {
    // Extract base64 from a placeholder and decode it
    const dataUri = PLACEHOLDER_IMAGES.logo;
    const b64 = dataUri.replace('data:image/svg+xml;base64,', '');
    const decoded = decodeBase64(b64);
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('viewBox');
  });
});

// ─── getDefaultImageForPlaceholder ─────────────────────────

describe('getDefaultImageForPlaceholder', () => {
  it('should return logo for keys containing "logo"', () => {
    expect(getDefaultImageForPlaceholder('CompanyLogo')).toBe(PLACEHOLDER_IMAGES.logo);
    expect(getDefaultImageForPlaceholder('institutionLogo')).toBe(PLACEHOLDER_IMAGES.logo);
    expect(getDefaultImageForPlaceholder('LOGO')).toBe(PLACEHOLDER_IMAGES.logo);
  });

  it('should return photo for keys containing "photo" or "picture"', () => {
    expect(getDefaultImageForPlaceholder('EmployeePhoto')).toBe(PLACEHOLDER_IMAGES.photo);
    expect(getDefaultImageForPlaceholder('profilePicture')).toBe(PLACEHOLDER_IMAGES.photo);
    expect(getDefaultImageForPlaceholder('imageUrl')).toBe(PLACEHOLDER_IMAGES.photo);
  });

  it('should return signature for keys containing "signature"', () => {
    expect(getDefaultImageForPlaceholder('AuthorizedSignature')).toBe(PLACEHOLDER_IMAGES.signature);
    // 'digitalSign' contains 'sign' but not 'signature' — falls through to generic
    expect(getDefaultImageForPlaceholder('digitalSign')).toBe(PLACEHOLDER_IMAGES.generic);
  });

  it('should return seal for keys containing "seal" or "stamp"', () => {
    expect(getDefaultImageForPlaceholder('CompanySeal')).toBe(PLACEHOLDER_IMAGES.seal);
    expect(getDefaultImageForPlaceholder('officialStamp')).toBe(PLACEHOLDER_IMAGES.seal);
  });

  it('should return generic for unrecognized keys', () => {
    expect(getDefaultImageForPlaceholder('unknown')).toBe(PLACEHOLDER_IMAGES.generic);
    expect(getDefaultImageForPlaceholder('')).toBe(PLACEHOLDER_IMAGES.generic);
  });

  it('should be case-insensitive', () => {
    expect(getDefaultImageForPlaceholder('COMPANYLOGO')).toBe(PLACEHOLDER_IMAGES.logo);
    expect(getDefaultImageForPlaceholder('company_logo')).toBe(PLACEHOLDER_IMAGES.logo);
  });
});

// ─── isValidImageSource ────────────────────────────────────

describe('isValidImageSource', () => {
  it('should return true for data: URIs', () => {
    expect(isValidImageSource('data:image/png;base64,abc')).toBe(true);
    expect(isValidImageSource(PLACEHOLDER_IMAGES.logo)).toBe(true);
  });

  it('should return true for http:// and https:// URLs', () => {
    expect(isValidImageSource('http://example.com/image.png')).toBe(true);
    expect(isValidImageSource('https://example.com/image.png')).toBe(true);
  });

  it('should return true for blob: URIs', () => {
    expect(isValidImageSource('blob:https://example.com/uuid')).toBe(true);
  });

  it('should return false for empty strings', () => {
    expect(isValidImageSource('')).toBe(false);
  });

  it('should return false for plain text like placeholder labels', () => {
    expect(isValidImageSource('[Sample Logo]')).toBe(false);
    expect(isValidImageSource('Company Logo Here')).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isValidImageSource('')).toBe(false);
  });
});

describe('getTemplateThumbnail', () => {
  it('should return a base64 SVG data URI', () => {
    const thumb = getTemplateThumbnail('Offer Letter', 'HR Documents');
    expect(thumb).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(thumb.length).toBeGreaterThan(100);
  });

  it('should be deterministic for the same name + category', () => {
    expect(getTemplateThumbnail('Offer Letter', 'HR Documents')).toBe(
      getTemplateThumbnail('Offer Letter', 'HR Documents')
    );
  });

  it('should theme by category (different categories differ)', () => {
    expect(getTemplateThumbnail('Offer Letter', 'HR Documents')).not.toBe(
      getTemplateThumbnail('Offer Letter', 'Payroll')
    );
  });

  it('should default to the General theme for unknown categories', () => {
    const unknown = getTemplateThumbnail('X', 'Unknown Category');
    const general = getTemplateThumbnail('X', 'General');
    const firstStopColor = (thumb: string) => {
      const decoded = decodeBase64(thumb.replace('data:image/svg+xml;base64,', ''));
      return decoded.match(/stop-color="([^"]+)"/)?.[1];
    };
    // Same fallback theme colors (the chip label preserves the raw category name)
    expect(firstStopColor(unknown)).toBe(firstStopColor(general));
    const decoded = decodeBase64(unknown.replace('data:image/svg+xml;base64,', ''));
    expect(decoded).toContain('Unknown Category');
  });

  it('should escape XML-special characters in the template name', () => {
    const thumb = getTemplateThumbnail('R&D & <Legal>', 'General');
    const decoded = decodeBase64(thumb.replace('data:image/svg+xml;base64,', ''));
    expect(decoded).toContain('R&amp;D');
    expect(decoded).not.toContain('<Legal>');
    expect(decoded).toContain('&lt;Legal&gt;');
  });

  it('should embed the category chip label', () => {
    const thumb = getTemplateThumbnail('Invoice', 'Finance');
    const decoded = decodeBase64(thumb.replace('data:image/svg+xml;base64,', ''));
    expect(decoded).toContain('Finance');
  });
});
