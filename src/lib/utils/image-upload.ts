import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_MB,
} from './constants';

/**
 * Words that make a variable key image-eligible. Only fields whose key
 * contains one of these words may accept image uploads (logo / signature /
 * sign / stamp / seal / header / photo / picture / hero / image).
 */
const IMAGE_FIELD_WORDS = new Set([
  'logo',
  'sign',
  'signature',
  'stamp',
  'seal',
  'header',
  'photo',
  'picture',
  'hero',
  'image',
]);

/**
 * Split a variable key into words at camelCase / snake_case / digit boundaries
 * so matching is per-word — NOT substring. This is what keeps lookalike TEXT
 * fields out: "Designation", "SupervisorDesignation" and "AssignedTo" must
 * never match "sign", while "CompanyLogo", "HRSignature" and "AuthorizedSign"
 * all match. (`\b` regex boundaries don't work inside camelCase words.)
 */
export function splitKeyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // CompanyLogo -> Company Logo
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') // HRSignature -> HR Signature
    .replace(/[^a-zA-Z0-9]+/g, ' ') // snake_case / dashes / spaces
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
}

/**
 * Substring fallback for keys that don't split into words (all-lowercase or
 * all-caps single tokens like "companylogo" / "COMPANYLOGO"). 'sign' is
 * deliberately excluded so "designation" never matches via this path — the
 * per-word match above is the only way 'sign' matches.
 */
const IMAGE_SUBSTRINGS = [
  'logo',
  'signature',
  'stamp',
  'seal',
  'header',
  'photo',
  'picture',
  'hero',
  'image',
];

/**
 * True when a variable key is allowed to hold an image. This is the single
 * source of truth for "which fields accept images" — the instant form, the
 * template form, the template engine's type inference and the server-side
 * validation all use it, so they can never drift.
 */
export function isImageFieldKey(key: string): boolean {
  const words = splitKeyWords(key);
  if (words.some((word) => IMAGE_FIELD_WORDS.has(word))) return true;
  const lower = key.toLowerCase();
  return IMAGE_SUBSTRINGS.some((word) => lower.includes(word));
}

/**
 * For an image-eligible key, decide whether it is a signature field or a plain
 * image field (used by type inference everywhere so the logic never drifts).
 * Returns null when the key is not image-eligible.
 */
export function inferImageSubtype(key: string): 'image' | 'signature' | null {
  if (!isImageFieldKey(key)) return null;
  const words = splitKeyWords(key);
  const lower = key.toLowerCase();
  return words.includes('signature') ||
    words.includes('sign') ||
    lower.includes('signature')
    ? 'signature'
    : 'image';
}

/**
 * Validates an uploaded image against the shared whitelist + size policy
 * (see `IMAGE_UPLOAD_*` / `ALLOWED_IMAGE_TYPES` in constants.ts). Every
 * upload surface (document editor, instant downloads, template image fields)
 * calls this so the policy and its user-facing messages can never drift.
 *
 * @returns an error message to surface to the user, or `null` if the file is valid.
 */
export function validateImageUpload(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Please upload PNG, JPEG, WEBP, SVG or GIF image';
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return `Image must be under ${IMAGE_UPLOAD_MAX_MB}MB`;
  }
  return null;
}

/**
 * Byte length of a base64 string (without `Buffer`, so this module stays
 * importable from both server routes and client components). Exact for
 * well-formed base64 with standard `=` padding.
 */
function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s+/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

const DATA_URL_REGEX = /^data:(image\/[a-z0-9.+-]+)(;base64)?,(.*)$/i;

/**
 * Validates a single image data-URL value (e.g. a base64 image variable sent
 * to a server route) against the same shared policy as `validateImageUpload`.
 * Non-data-URL values (plain text, remote URLs) are not size-checkable and
 * are allowed through — matching the client, which validates the raw file
 * before it is ever converted to a data URL.
 *
 * @returns an error message, or `null` if the value is fine (or not an image data URL).
 */
export function validateImageDataUrl(value: string): string | null {
  const match = DATA_URL_REGEX.exec(value);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    return 'Please upload PNG, JPEG, WEBP, SVG or GIF image';
  }

  const payload = match[3];
  // Client uploads always arrive as `;base64,` data URLs (FileReader), so the
  // base64 branch is the real path; the non-base64 branch falls back to a raw
  // character count as a conservative proxy.
  const byteLength = match[2] ? base64ByteLength(payload) : payload.length;
  if (byteLength > IMAGE_UPLOAD_MAX_BYTES) {
    return `Image must be under ${IMAGE_UPLOAD_MAX_MB}MB`;
  }
  return null;
}

/**
 * Server-side guard for request bodies carrying image variables (instant
 * downloads, previews, template downloads). Enforces the shared whitelist +
 * size policy on every `data:image/...` value so a direct API call can't
 * bypass the client-side validation.
 *
 * @returns the first error message, or `null` if all values pass.
 */
export function validateImageVariables(variables: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== 'string') continue;
    // Returns null for anything that isn't an image data URL (plain text,
    // remote URLs, non-image data URLs) — so no pre-filter needed here.
    const error = validateImageDataUrl(value);
    if (error) return error;

    // Enforce the app rule: ONLY logo/sign/stamp/header-style fields may carry
    // image data — no images in text fields, even via a direct API call.
    if (DATA_URL_REGEX.test(value) && !isImageFieldKey(key)) {
      return `Image uploads are only allowed for logo, signature, seal, stamp and header fields ("${key}" is a text field).`;
    }
  }
  return null;
}

/**
 * Server-side guard for template variable definitions: validates any image
 * data-URL stored as a variable's `defaultValue` against the shared policy.
 * Accepts the `variables` array shape used by the template create/update
 * routes (each entry: { key, label, type, required, defaultValue, ... }).
 *
 * @returns the first error message, or `null` if all defaults pass.
 */
export function validateVariableDefaultImages(variables: unknown): string | null {
  if (!Array.isArray(variables)) return null;
  for (const variable of variables) {
    if (!variable || typeof variable !== 'object') continue;
    const { key, defaultValue } = variable as { key?: unknown; defaultValue?: unknown };
    if (typeof defaultValue !== 'string') continue;
    const error = validateImageDataUrl(defaultValue);
    if (error) return error;
    // Image defaults only allowed on image-eligible fields.
    if (DATA_URL_REGEX.test(defaultValue) && (typeof key !== 'string' || !isImageFieldKey(key))) {
      return `Image uploads are only allowed for logo, signature, seal, stamp and header fields ("${String(key)}" is a text field).`;
    }
  }
  return null;
}
