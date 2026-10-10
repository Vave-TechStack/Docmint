import { describe, it, expect } from 'vitest';
import {
  ALLOWED_REMOTE_IMAGE_HOSTS,
  validateExternalImageUrl,
} from '@/lib/security/image-url';

/**
 * Regression tests for tenant-supplied image sources.
 *
 * Four tenant-facing fields (template thumbnail, company logo/seal family,
 * template variable images, payslip imageSrc) reach the browser unfiltered.
 * `images.remotePatterns` does not constrain them because every `<Image>` call
 * site passes `unoptimized`, which skips the optimizer that enforces it — so
 * this validator at the write path is the only control.
 */
describe('external image URL validation', () => {
  describe('data: URLs — must keep working', () => {
    it('accepts the SVG data URI the app generates for template thumbnails', () => {
      // `getTemplateThumbnail` -> `svgToDataUri` is what every shipped
      // template uses, so rejecting this would blank the template gallery.
      const generated = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
      expect(validateExternalImageUrl(generated).valid).toBe(true);
    });

    it('accepts raster data URLs from the upload path', () => {
      expect(validateExternalImageUrl('data:image/png;base64,iVBORw0KGgo=').valid).toBe(true);
      expect(validateExternalImageUrl('data:image/jpeg;base64,/9j/4AAQ').valid).toBe(true);
      expect(validateExternalImageUrl('data:image/webp;base64,UklGRhI=').valid).toBe(true);
    });

    it('accepts a large upload-sized data URL', () => {
      const big = `data:image/png;base64,${'A'.repeat(500_000)}`;
      expect(validateExternalImageUrl(big).valid).toBe(true);
    });

    it('trims surrounding whitespace', () => {
      expect(validateExternalImageUrl('  data:image/png;base64,iVBORw0KGgo=  ').valid).toBe(true);
    });
  });

  describe('allowlisted remote hosts', () => {
    it('accepts placehold.co, the only external host the codebase uses', () => {
      expect(validateExternalImageUrl('https://placehold.co/160x48/1d4ed8/ffffff?text=ACME').valid).toBe(true);
    });

    it('accepts a subdomain of an allowlisted host', () => {
      expect(validateExternalImageUrl('https://cdn.placehold.co/x.png').valid).toBe(true);
    });

    it('rejects a host that merely ends with an allowlisted name', () => {
      // `evilplacehold.co` must not pass a suffix check.
      expect(validateExternalImageUrl('https://evilplacehold.co/x.png').valid).toBe(false);
      expect(validateExternalImageUrl('https://placehold.co.evil.test/x.png').valid).toBe(false);
    });
  });

  describe('arbitrary remote hosts are rejected', () => {
    it('rejects a generic external host', () => {
      const result = validateExternalImageUrl('https://evil.test/tracker.gif');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed');
    });

    it('rejects a first-party-looking host that is not allowlisted', () => {
      expect(validateExternalImageUrl('https://cdn.docmint.app/logo.png').valid).toBe(false);
    });

    it('names the permitted hosts in the error so the UI can explain itself', () => {
      const result = validateExternalImageUrl('https://evil.test/x.png', { field: 'companyLogo' });
      expect(result.reason).toContain('companyLogo');
      for (const host of ALLOWED_REMOTE_IMAGE_HOSTS) {
        expect(result.reason).toContain(host);
      }
    });
  });

  describe('dangerous schemes', () => {
    it.each([
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://evil.test/abc',
      'about:blank',
    ])('rejects %s', (value) => {
      expect(validateExternalImageUrl(value).valid).toBe(false);
    });

    it('rejects protocol-relative URLs, which inherit the page scheme', () => {
      // `//evil.test/x.png` resolves against the current page's protocol.
      expect(validateExternalImageUrl('//evil.test/x.png').valid).toBe(false);
    });

    it('rejects plain http, which would silently downgrade transport', () => {
      const result = validateExternalImageUrl('http://placehold.co/x.png');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('https');
    });

    it('rejects a data URL that is not an image', () => {
      expect(validateExternalImageUrl('data:text/html,<script>alert(1)</script>').valid).toBe(false);
      expect(validateExternalImageUrl('data:application/javascript,alert(1)').valid).toBe(false);
    });

    it('rejects credentials embedded in the URL', () => {
      const result = validateExternalImageUrl('https://user:pass@placehold.co/x.png');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('credential');
    });
  });

  describe('malformed input', () => {
    it('rejects a non-URL string', () => {
      expect(validateExternalImageUrl('not a url').valid).toBe(false);
      expect(validateExternalImageUrl('https://').valid).toBe(false);
    });

    it('rejects non-string types', () => {
      expect(validateExternalImageUrl(123).valid).toBe(false);
      expect(validateExternalImageUrl({}).valid).toBe(false);
      expect(validateExternalImageUrl([]).valid).toBe(false);
    });

    it('rejects an oversized value', () => {
      expect(validateExternalImageUrl(`data:image/png;base64,${'A'.repeat(2_000_001)}`).valid).toBe(false);
    });
  });

  describe('empty values', () => {
    it('is rejected when a value is required', () => {
      expect(validateExternalImageUrl('').valid).toBe(false);
      expect(validateExternalImageUrl(null).valid).toBe(false);
      expect(validateExternalImageUrl(undefined).valid).toBe(false);
    });

    it('passes through when the field is nullable', () => {
      expect(validateExternalImageUrl('', { allowEmpty: true })).toEqual({ valid: true, value: '' });
      expect(validateExternalImageUrl(null, { allowEmpty: true })).toEqual({ valid: true, value: '' });
    });
  });

  it('never returns the rejected value, so it cannot be persisted by accident', () => {
    const result = validateExternalImageUrl('https://evil.test/tracker.gif?tenant=acme');
    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
  });
});