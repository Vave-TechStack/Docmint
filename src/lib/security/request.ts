import { NextResponse } from 'next/server';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/utils/constants';

/**
 * Request-level security helpers shared by every mutating route handler.
 */

// ─── CSRF / cross-origin request rejection ────────────────────────────────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Every origin this app may legitimately be served from. */
function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const key of ['NEXT_PUBLIC_APP_URL', 'APP_URL', 'AUTH_URL', 'AUTH_TRUST_HOST_ORIGIN']) {
    const raw = process.env[key];
    if (!raw) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      /* malformed env value — ignore */
    }
  }
  return origins;
}

function requestOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

/**
 * Reject cross-origin state-changing requests (CSRF defence in depth).
 *
 * The session cookie is `SameSite=Lax`, which already blocks a classic
 * cross-site form POST — but Lax does NOT stop a *same-site, cross-subdomain*
 * attacker, and this app explicitly supports multi-tenant subdomains
 * (`x-tenant-slug` in proxy.ts). So mutations are additionally checked here.
 *
 * Rules:
 *  - safe methods always pass;
 *  - if `Origin` is present it MUST match the app's own origin(s);
 *  - if `Origin` is absent (non-browser client, e.g. curl) we fall back to
 *    `Sec-Fetch-Site`, which browsers always set — `cross-site` is rejected.
 *
 * Returns a 403 response on failure, or `null` when the request may proceed.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;

  const origin = request.headers.get('origin');
  const allowed = allowedOrigins();
  const self = requestOrigin(request);
  if (self) allowed.add(self);

  if (origin) {
    // `"null"` is what browsers send from sandboxed/file:// documents.
    if (origin === 'null') return csrfRejection();
    if (!allowed.has(origin)) return csrfRejection();
    return null;
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || fetchSite === 'none') return csrfRejection();

  return null;
}

function csrfRejection(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Cross-origin request rejected' },
    { status: 403 }
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Parse and clamp `?page` / `?pageSize`.
 *
 * Previously these were passed straight to `parseInt(...)` → `skip`/`take`, so
 * `?pageSize=1000000` pulled a million rows, `?pageSize=0` produced
 * `totalPages: Infinity` (serialised as `null`) and `?page=abc` produced
 * `skip: NaN` (a 500). Everything is now clamped to sane integers.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultPageSize: number = DEFAULT_PAGE_SIZE
): Pagination {
  const rawPage = Number.parseInt(searchParams.get('page') ?? '', 10);
  const rawSize = Number.parseInt(searchParams.get('pageSize') ?? '', 10);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(rawPage, 10_000) : 1;

  const fallbackSize = Math.min(Math.max(defaultPageSize, 1), MAX_PAGE_SIZE);
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1
    ? Math.min(rawSize, MAX_PAGE_SIZE)
    : fallbackSize;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// ─── Input coercion / validation ──────────────────────────────────────────────

/** True only for a non-null, non-array object literal. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a JSON body defensively. Returns `{}` for malformed/oversized bodies
 * instead of throwing, so a bad request is a 400 rather than a 500.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// C0 control characters + DEL (tab/CR/LF are handled separately).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Trim, strip C0/DEL control characters, and hard-cap the length.
 * Every piece of user-supplied text passes through this before reaching the
 * database. Previously these fields had *no* upper bound, so a multi-megabyte
 * address was persisted and re-serialised into outbound email.
 *
 * @param keepNewlines when true, CR/LF survive (used for multi-line bodies).
 */
export function cleanString(
  value: unknown,
  maxLength: number,
  {
    required = false,
    minLength = 0,
    keepNewlines = false,
  }: { required?: boolean; minLength?: number; keepNewlines?: boolean } = {}
): string {
  if (typeof value !== 'string') {
    if (required) throw new ValidationError('A required field is missing');
    return '';
  }

  let cleaned = keepNewlines
    ? value.replace(CONTROL_CHARS, '').replace(/\r\n/g, '\n').replace(/[\r\t]/g, ' ')
    : value.replace(/[\r\n]+/g, ' ').replace(CONTROL_CHARS, '');

  cleaned = cleaned.trim();

  if (required && cleaned.length === 0) {
    throw new ValidationError('A required field is missing');
  }
  if (cleaned.length < minLength) {
    throw new ValidationError('Must be at least ' + minLength + ' characters');
  }
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/** Reject CR/LF — defence in depth against mail-header injection. */
export function stripNewlines(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export class ValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

/** Validate one field against a fixed allowlist, or return `undefined`. */
export function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  if (typeof value !== 'string') return undefined;
  const upper = value.toUpperCase();
  return allowed.find((a) => a.toUpperCase() === upper);
}

/** Parse a bounded positive integer; returns `undefined` when unusable. */
export function boundedInt(
  value: unknown,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {}
): number | undefined {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  if (n < min || n > max) return undefined;
  return n;
}

/**
 * Escape a value for safe interpolation into an HTML document.
 * Single source of truth — the email service, blog CMS and SVG thumbnail
 * generator all use this so untrusted text can never become markup.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a value for use inside an HTML text node, converting newlines to
 * <br>. Used for multi-line user content in outbound email.
 */
export function escapeHtmlWithBreaks(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

/** Cap and strip CR/LF from a value destined for a mail header. */
export function headerSafe(value: unknown, maxLength = 200): string {
  return stripNewlines(String(value ?? '').slice(0, maxLength));
}
