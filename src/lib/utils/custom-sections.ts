/**
 * Custom content sections — user-added logo / header / footer / extra text
 * fields on the template fill-in form (premium flow).
 *
 * Shared between the client (preview) and the server download route so the
 * injected markup is always identical. Uses table-based layout (like the
 * payslip) because html2canvas 1.4.1 — which jsPDF's doc.html() uses — renders
 * tables reliably but mis-renders flex/grid.
 */

export interface CustomSectionField {
  label: string;
  value: string;
}

export interface CustomSections {
  /** Base64 image data URL (already validated against the image policy). */
  logo?: string;
  /** Header text shown next to the logo. */
  header?: string;
  /** Footer text shown at the bottom. */
  footer?: string;
  /** Extra label/value text rows. */
  fields?: CustomSectionField[];
}

const MAX_FIELDS = 20;
const MAX_FIELD_CHARS = 200;

/** Escape text for safe insertion into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Coerce unknown values to a string so odd API payloads never crash .trim(). */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function trimTo(value: string, max: number): string {
  return value.slice(0, max);
}

/** Header block — logo (left) + header text (right). */
export function buildCustomHeaderHtml(sections?: CustomSections | null): string {
  if (!sections) return '';
  const logo = asString(sections.logo).trim();
  const header = trimTo(asString(sections.header).trim(), 500);
  if (!logo && !header) return '';

  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" alt="logo" style="max-height:48px;max-width:130px;object-fit:contain;vertical-align:middle;" onerror="this.style.display='none'" />`
    : '';
  const textHtml = header
    ? `<div style="font-size:14px;font-weight:600;color:#1f2937;line-height:1.4;">${escapeHtml(header)}</div>`
    : '';

  return (
    '<div class="custom-header" style="margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #2563eb;">' +
    '<table style="width:100%;border:none;border-collapse:collapse;"><tbody><tr>' +
    `<td style="border:none;padding:0;width:140px;vertical-align:middle;">${logoHtml}</td>` +
    `<td style="border:none;padding:0 0 0 12px;vertical-align:middle;">${textHtml}</td>` +
    '</tr></tbody></table></div>'
  );
}

/** Extra fields — label/value table rows. */
export function buildCustomFieldsHtml(sections?: CustomSections | null): string {
  if (!sections) return '';
  const fields = (sections.fields || [])
    .map((f) => ({
      label: asString(f && typeof f === 'object' ? (f as CustomSectionField).label : '').trim(),
      value: asString(f && typeof f === 'object' ? (f as CustomSectionField).value : '').trim(),
    }))
    .filter((f) => f.label && f.value)
    .slice(0, MAX_FIELDS);
  if (fields.length === 0) return '';

  const rows = fields
    .map(
      (f) =>
        `<tr>` +
        `<td style="border:1px solid #e5e7eb;padding:6px 8px;background:#f9fafb;font-weight:600;color:#374151;width:38%;">${escapeHtml(trimTo(f.label, MAX_FIELD_CHARS))}</td>` +
        `<td style="border:1px solid #e5e7eb;padding:6px 8px;color:#111827;">${escapeHtml(trimTo(f.value, MAX_FIELD_CHARS))}</td>` +
        `</tr>`
    )
    .join('');

  return (
    '<div class="custom-fields" style="margin:14px 0;">' +
    `<table style="width:100%;border-collapse:collapse;">${rows}</table>` +
    '</div>'
  );
}

/** Footer block — centered small text. */
export function buildCustomFooterHtml(sections?: CustomSections | null): string {
  if (!sections) return '';
  const footer = asString(sections.footer).trim();
  if (!footer) return '';

  return (
    '<div class="custom-footer" style="margin-top:18px;padding-top:10px;border-top:1px solid #d1d5db;text-align:center;font-size:11px;color:#6b7280;">' +
    escapeHtml(trimTo(footer, 500)) +
    '</div>'
  );
}

/**
 * Sanitize an untrusted `customSections` request payload into a safe shape:
 * strings only, logo restricted to base64 image data URLs, fields capped and
 * coerced. Returns null when the payload is not a plain object. Server routes
 * call this before injecting — matching the client's always-strings payloads
 * and preventing odd types from reaching the HTML builders.
 */
export function sanitizeCustomSections(payload: unknown): CustomSections | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;

  const result: CustomSections = {};
  if (typeof source.logo === 'string' && /^data:image\//i.test(source.logo)) {
    result.logo = source.logo;
  }
  if (typeof source.header === 'string') result.header = source.header;
  if (typeof source.footer === 'string') result.footer = source.footer;
  if (Array.isArray(source.fields)) {
    result.fields = source.fields
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({
        label: typeof f.label === 'string' ? f.label : String(f.label ?? ''),
        value: typeof f.value === 'string' ? f.value : String(f.value ?? ''),
      }))
      .slice(0, MAX_FIELDS);
  }
  return result;
}

/**
 * Full custom block (header + fields + footer) as one string.
 * Useful for previews that render the block as a unit.
 */
export function buildCustomSectionsHtml(sections?: CustomSections | null): string {
  return [
    buildCustomHeaderHtml(sections),
    buildCustomFieldsHtml(sections),
    buildCustomFooterHtml(sections),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Inject custom content around a document body: header at the top, extra
 * fields after the content, footer at the bottom.
 */
export function injectCustomSections(
  bodyHtml: string,
  sections?: CustomSections | null
): string {
  if (!sections) return bodyHtml;
  const header = buildCustomHeaderHtml(sections);
  const fields = buildCustomFieldsHtml(sections);
  const footer = buildCustomFooterHtml(sections);
  if (!header && !fields && !footer) return bodyHtml;
  return `${header}${bodyHtml}${fields}${footer}`;
}
