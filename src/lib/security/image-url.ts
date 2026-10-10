/**
 * Validation for user-supplied image sources.
 *
 * Four tenant-facing fields accept an image URL that reaches the browser
 * unfiltered:
 *
 *  - `Template.thumbnail`        `src/app/api/templates/[id]/route.ts`
 *  - `Company.companyLogo` /
 *    `companySeal` (+Dark/Light) `src/app/api/company/profile/route.ts`
 *  - template variable images    `src/app/app/templates/[id]/page.tsx`
 *  - payslip `element.imageSrc`  `src/components/payslip-designer/canvas.tsx`
 *
 * `images.remotePatterns` does NOT constrain any of them: every `<Image>` call
 * site passes `unoptimized`, which skips the optimizer entirely, so the
 * `/_next/image` handler that enforces `remotePatterns` is never reached.
 * `cleanString` only caps length and type. A stored value could therefore be
 * any `http(s)` URL and the browser would request it — a tracking-pixel and
 * visitor-IP-exfiltration channel, and a way to make a victim's browser probe
 * internal-network addresses from inside their own network.
 *
 * Policy
 * ------
 * `data:image/*` is always accepted: it is what every value the application
 * itself produces (`getTemplateThumbnail` → `svgToDataUri`) and every upload
 * path generates, so allowing it preserves existing content exactly.
 *
 * `https:` remote URLs are accepted ONLY for an allowlist of hosts. `http:` is
 * rejected outright — plaintext transport for an image is never necessary
 * here and would silently downgrade a tenant's logo.
 *
 * This validator runs at the WRITE path, which is what makes a future
 * `img-src` tightening safe. It does not retroactively change stored rows;
 * see the migration note in `sanitizeExternalImageUrl`.
 */

/**
 * Hosts permitted to serve a remote tenant image.
 *
 * `placehold.co` is the only external host the codebase itself references
 * (`src/components/payslip-designer/preview-overlay.tsx`). It is listed so the
 * payslip designer's sample values keep rendering.
 */
export const ALLOWED_REMOTE_IMAGE_HOSTS = ['placehold.co'] as const;

export interface ImageUrlValidation {
  valid: boolean;
  /** Present when `valid` is false. Safe to return to the client. */
  reason?: string;
  /** The normalised value to persist. */
  value?: string;
}

/** Schemes that must never reach an `<img src>`, whatever the host. */
const BLOCKED_SCHEMES = ['javascript:', 'vbscript:', 'file:', 'blob:', 'about:'];

/** `data:` payloads that are images but can smuggle active content via SVG. */
function isDangerousDataUrl(value: string): boolean {
  if (!value.toLowerCase().startsWith('data:')) return false;
  const header = value.slice(5, value.indexOf(',') === -1 ? undefined : value.indexOf(',')).toLowerCase();
  // Raster types are inert. `image/svg+xml` is excluded here because SVG can
  // carry script; the document sanitizer strips it for HTML bodies, but an
  // `<img src>` is a different sink and browsers will not execute script in
  // `<img>`-loaded SVG — still, the app's own placeholder generator produces
  // svg+xml, so it is allowed and relies on the img context being inert.
  return header.includes('text/html');
}

function hostIsAllowed(host: string): boolean {
  const normalized = host.toLowerCase();
  return (ALLOWED_REMOTE_IMAGE_HOSTS as readonly string[]).some(
    (allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`)
  );
}

/**
 * Validates a tenant-supplied image source.
 *
 * @param value raw input, possibly empty
 * @param options.allowEmpty when true, `''`/`null`/`undefined` pass through as
 *   `null` (used by the optional company logo fields, which are nullable)
 */
export function validateExternalImageUrl(
  value: unknown,
  options: { allowEmpty?: boolean; field?: string } = {}
): ImageUrlValidation {
  const field = options.field ?? 'Image URL';

  if (value === undefined || value === null || value === '') {
    if (options.allowEmpty) return { valid: true, value: '' };
    return { valid: false, reason: `${field} is required` };
  }

  if (typeof value !== 'string') {
    return { valid: false, reason: `${field} must be a string` };
  }

  const trimmed = value.trim();
  if (trimmed.length > 2_000_000) {
    // data: URIs for uploaded logos are legitimately large.
    return { valid: false, reason: `${field} is too large` };
  }

  const lower = trimmed.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { valid: false, reason: `${field} uses a disallowed URL scheme` };
    }
  }

  if (lower.startsWith('data:')) {
    if (isDangerousDataUrl(trimmed)) {
      return { valid: false, reason: `${field} uses a disallowed data URL type` };
    }
    if (!lower.startsWith('data:image/')) {
      return { valid: false, reason: `${field} data URLs must be images` };
    }
    return { valid: true, value: trimmed };
  }

  if (lower.startsWith('//')) {
    return { valid: false, reason: `${field} must use an absolute https URL` };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: `${field} is not a valid URL` };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: `${field} must use https` };
  }

  // Credentials in a URL are a phishing/SSRF smell and leak on redirect.
  if (parsed.username || parsed.password) {
    return { valid: false, reason: `${field} must not contain credentials` };
  }

  if (!hostIsAllowed(parsed.hostname)) {
    return {
      valid: false,
      reason: `${field} host is not allowed. Permitted: ${ALLOWED_REMOTE_IMAGE_HOSTS.join(', ')}`,
    };
  }

  return { valid: true, value: parsed.toString() };
}

/**
 * Convenience wrapper for a nullable tenant field.
 *
 * Returns `null` when the value is absent, the normalised string when it
 * passes, and throws a `ValidationError`-compatible shape otherwise. Callers
 * that need a 400 response should use `validateExternalImageUrl` directly so
 * the reason reaches the client.
 */
export function sanitizeExternalImageUrl(
  value: unknown,
  options: { allowEmpty?: boolean; field?: string } = {}
): string | null {
  const result = validateExternalImageUrl(value, { allowEmpty: true, ...options });
  if (!result.valid) {
    throw new Error(result.reason ?? 'Invalid image URL');
  }
  return result.value ? result.value : null;
}