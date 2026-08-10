/**
 * Default SVG placeholder data URIs for document templates.
 * These render as proper placeholder graphics when no user image is uploaded.
 * All SVGs are self-contained (no external fonts or resources).
 */

/** Company Logo placeholder — a minimal building/abstract logo shape */
const LOGO_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" width="200" height="80">
  <rect width="200" height="80" fill="#f0f4ff" rx="8"/>
  <rect x="75" y="15" width="50" height="8" rx="4" fill="#93c5fd"/>
  <rect x="60" y="32" width="80" height="4" rx="2" fill="#bfdbfe"/>
  <rect x="70" y="42" width="60" height="4" rx="2" fill="#bfdbfe"/>
  <rect x="55" y="55" width="90" height="1.5" rx="0.75" fill="#dbeafe"/>
  <rect x="35" y="20" width="16" height="35" rx="3" fill="#3b82f6" opacity="0.3"/>
  <rect x="55" y="25" width="14" height="30" rx="3" fill="#3b82f6" opacity="0.5"/>
  <rect x="130" y="20" width="16" height="35" rx="3" fill="#3b82f6" opacity="0.3"/>
  <rect x="150" y="25" width="14" height="30" rx="3" fill="#3b82f6" opacity="0.5"/>
</svg>`;

/** Employee Photo placeholder — a person silhouette */
const PHOTO_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="100" height="120">
  <rect width="100" height="120" fill="#f8fafc" rx="8"/>
  <circle cx="50" cy="38" r="18" fill="#e2e8f0"/>
  <ellipse cx="50" cy="90" rx="32" ry="22" fill="#e2e8f0"/>
  <circle cx="50" cy="38" r="16" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>
  <ellipse cx="50" cy="90" rx="30" ry="20" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>
</svg>`;

/** Signature placeholder — a cursive-like line */
const SIGNATURE_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50" width="200" height="50">
  <rect width="200" height="50" fill="#fafafa" rx="6"/>
  <path d="M15 35 Q30 10 45 35 Q55 45 65 25 Q75 10 90 30 Q100 40 110 20 Q120 5 135 30 Q145 42 155 22 Q165 10 175 35 Q182 42 190 30" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"/>
  <circle cx="22" cy="32" r="2.5" fill="#cbd5e1"/>
  <circle cx="42" cy="30" r="2" fill="#cbd5e1"/>
  <circle cx="67" cy="20" r="2.5" fill="#cbd5e1"/>
  <circle cx="95" cy="35" r="2" fill="#cbd5e1"/>
  <circle cx="160" cy="30" r="2" fill="#cbd5e1"/>
</svg>`;

/** Stamp / Seal placeholder — a circular seal shape */
const SEAL_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <rect width="120" height="120" fill="#fef9ef" rx="60"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="#fcd34d" stroke-width="2.5"/>
  <circle cx="60" cy="60" r="42" fill="none" stroke="#fde68a" stroke-width="1.5"/>
  <text x="60" y="52" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="bold" fill="#d97706">COMPANY</text>
  <text x="60" y="64" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="#d97706">SEAL</text>
  <path d="M45 72 Q55 62 60 72 Q65 82 75 72" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="60" cy="45" r="3" fill="#f59e0b" opacity="0.3"/>
</svg>`;

/** Generic image placeholder — a simple photo/landscape icon */
const GENERIC_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" width="200" height="140">
  <rect width="200" height="140" fill="#f1f5f9" rx="8"/>
  <rect x="75" y="30" width="50" height="4" rx="2" fill="#e2e8f0"/>
  <rect x="65" y="45" width="70" height="4" rx="2" fill="#e2e8f0"/>
  <rect x="80" y="70" width="40" height="40" rx="4" fill="#e2e8f0"/>
  <rect x="90" y="80" width="20" height="20" rx="3" fill="#cbd5e1"/>
  <circle cx="100" cy="90" r="6" fill="#f1f5f9"/>
</svg>`;

function svgToDataUri(svg: string): string {
  // Remove extra whitespace and inline
  const cleaned = svg
    .replace(/\s*\n\s*/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();

  // Use base64 encoding (more reliable than URL-encoded SVG in <img> tags)
  // Buffer for Node.js, btoa for browser — SVGs are pure ASCII so btoa is safe
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(cleaned, 'utf-8').toString('base64')
    : btoa(cleaned);

  return `data:image/svg+xml;base64,${base64}`;
}

/** Pre-computed data URIs */
export const PLACEHOLDER_IMAGES = {
  logo: svgToDataUri(LOGO_PLACEHOLDER_SVG),
  photo: svgToDataUri(PHOTO_PLACEHOLDER_SVG),
  signature: svgToDataUri(SIGNATURE_PLACEHOLDER_SVG),
  seal: svgToDataUri(SEAL_PLACEHOLDER_SVG),
  generic: svgToDataUri(GENERIC_IMAGE_SVG),
} as const;

/**
 * Get a default placeholder image based on the placeholder key name.
 * Matches keywords like "logo", "photo", "signature", "seal" in the key.
 */
export function getDefaultImageForPlaceholder(key: string): string {
  const lower = key.toLowerCase();
  if (lower.includes('logo')) return PLACEHOLDER_IMAGES.logo;
  if (lower.includes('photo') || lower.includes('picture') || lower.includes('imageurl')) return PLACEHOLDER_IMAGES.photo;
  if (lower.includes('signature')) return PLACEHOLDER_IMAGES.signature;
  if (lower.includes('seal') || lower.includes('stamp')) return PLACEHOLDER_IMAGES.seal;
  if (lower.includes('heroimage') || lower.includes('cover')) return PLACEHOLDER_IMAGES.generic;
  return PLACEHOLDER_IMAGES.generic;
}

/**
 * Whether a placeholder key represents an image (logo, photo, signature,
 * seal, stamp, cover, QR/barcode, etc.).
 *
 * Mirrors the keyword logic the client previews use, so server-side
 * resolution (DocumentEngine) substitutes the same default images.
 */
export function isImagePlaceholder(key: string): boolean {
  const lower = key.toLowerCase();
  // NOTE: no bare 'cover' — 'CoverBody' (cover letter body text) contains it
  // but is a text field; 'image'/'photo' already cover CoverImage/CoverPhoto.
  return ['logo', 'photo', 'picture', 'signature', 'seal', 'stamp', 'image', 'qr', 'barcode']
    .some((kw) => lower.includes(kw));
}

/**
 * Category → gradient/color theme used by generated template thumbnails.
 * Mirrors the category themes in components/templates/template-thumbnail.tsx.
 */
const THUMBNAIL_THEMES: Record<string, { from: string; to: string; accent: string }> = {
  'HR Documents': { from: '#3b82f6', to: '#4f46e5', accent: '#3b82f6' },
  'Payroll': { from: '#10b981', to: '#0d9488', accent: '#0d9488' },
  'Finance': { from: '#f59e0b', to: '#ea580c', accent: '#ea580c' },
  'Legal': { from: '#8b5cf6', to: '#7c3aed', accent: '#7c3aed' },
  'Business': { from: '#ec4899', to: '#e11d48', accent: '#e11d48' },
  'Marketing': { from: '#f97316', to: '#d97706', accent: '#d97706' },
  'Resume Builder': { from: '#14b8a6', to: '#0891b2', accent: '#0891b2' },
  'Education': { from: '#6366f1', to: '#2563eb', accent: '#2563eb' },
  'Medical': { from: '#ef4444', to: '#e11d48', accent: '#ef4444' },
  'Manufacturing': { from: '#78716c', to: '#52525b', accent: '#57534e' },
  'Real Estate': { from: '#d946ef', to: '#9333ea', accent: '#a21caf' },
  'Certificates': { from: '#d97706', to: '#eab308', accent: '#d97706' },
  'General': { from: '#64748b', to: '#475569', accent: '#475569' },
};

const DEFAULT_THUMBNAIL_THEME = THUMBNAIL_THEMES['General'];

/** Escape a string for safe embedding in XML/SVG text nodes. */
function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Split a template name into at most two lines (with ellipsis). */
function splitTitleLines(name: string, maxLen = 17): [string, string] {
  if (name.length <= maxLen) return [name, ''];
  let line1 = name.slice(0, maxLen);
  const spaceIdx = line1.lastIndexOf(' ');
  if (spaceIdx > Math.floor(maxLen * 0.5)) line1 = line1.slice(0, spaceIdx);
  const rest = name.slice(line1.length).trim();
  const line2 = rest.length > maxLen ? `${rest.slice(0, maxLen - 1).trimEnd()}…` : rest;
  return [line1, line2];
}

/**
 * Generate a deterministic, branded SVG data-URI thumbnail for a template card.
 * Renders a document mockup (accent header, template name, skeleton lines,
 * table rows, signature + seal footer) on a category-colored gradient — the
 * same design language as the client-side TemplateThumbnail component, but as
 * a pure SVG so it works anywhere (server APIs, client fallbacks, seeds).
 */
export function getTemplateThumbnail(name: string, category?: string): string {
  const theme = (category && THUMBNAIL_THEMES[category]) || DEFAULT_THUMBNAIL_THEME;
  const safeCategory = escapeXmlText(category || 'General');
  const [line1, line2] = splitTitleLines(name);
  const title1 = escapeXmlText(line1);
  const title2 = escapeXmlText(line2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${theme.from}"/>
      <stop offset="1" stop-color="${theme.to}"/>
    </linearGradient>
  </defs>
  <rect width="300" height="400" fill="url(#bg)"/>
  <circle cx="255" cy="45" r="100" fill="#ffffff" opacity="0.07"/>
  <circle cx="35" cy="390" r="120" fill="#ffffff" opacity="0.05"/>
  <rect x="40" y="55" width="220" height="290" rx="10" fill="#ffffff"/>
  <rect x="40" y="55" width="220" height="8" rx="4" fill="${theme.accent}"/>
  <rect x="56" y="80" width="64" height="8" rx="4" fill="${theme.accent}" opacity="0.85"/>
  <rect x="178" y="76" width="66" height="16" rx="8" fill="${theme.accent}"/>
  <text x="211" y="88" font-family="Arial,sans-serif" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle">${safeCategory}</text>
  <text x="56" y="122" font-family="Arial,sans-serif" font-size="15" font-weight="bold" fill="#111827">${title1}</text>
  ${title2 ? `<text x="56" y="141" font-family="Arial,sans-serif" font-size="15" font-weight="bold" fill="#111827">${title2}</text>` : ''}
  <rect x="56" y="156" width="188" height="1.5" rx="0.75" fill="#e5e7eb"/>
  <rect x="56" y="172" width="140" height="7" rx="3.5" fill="#e2e8f0"/>
  <rect x="56" y="186" width="188" height="7" rx="3.5" fill="#e2e8f0"/>
  <rect x="56" y="200" width="158" height="7" rx="3.5" fill="#e2e8f0"/>
  <rect x="56" y="220" width="188" height="16" rx="4" fill="#f1f5f9"/>
  <rect x="56" y="242" width="188" height="16" rx="4" fill="#f8fafc"/>
  <rect x="56" y="264" width="188" height="16" rx="4" fill="#f8fafc"/>
  <rect x="56" y="300" width="72" height="5" rx="2.5" fill="#cbd5e1"/>
  <rect x="56" y="310" width="52" height="5" rx="2.5" fill="#e2e8f0"/>
  <circle cx="228" cy="312" r="14" fill="none" stroke="${theme.accent}" stroke-width="2" stroke-dasharray="4 3"/>
  <text x="228" y="316" font-family="Arial,sans-serif" font-size="6" font-weight="bold" fill="${theme.accent}" text-anchor="middle">SEAL</text>
</svg>`;

  return svgToDataUri(svg);
}

/**
 * Check if a string is a valid image source for <img src="...">
 * Valid sources: data: URIs, http/https URLs, blob: URLs.
 * Returns false for empty strings or plain text like "[Sample Logo]".
 */
export function isValidImageSource(value: string): boolean {
  if (!value) return false;
  return (
    value.startsWith('data:') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:')
  );
}

/**
 * Decode a base64 string — works in both Node.js and browser.
 */
export function decodeBase64(str: string): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(str, 'base64').toString('utf-8');
  }
  try {
    return atob(str);
  } catch {
    return '';
  }
}

/**
 * Decode a percent-encoded (URL-encoded) string.
 */
function decodeUrlEncoded(str: string): string {
  return decodeURIComponent(str.replace(/\+/g, ' '));
}

/**
 * Replace <img> tags whose src is an SVG data URI with inline <svg> elements.
 * SVG data URIs in <img src> can fail to load in sandboxed iframes, causing
 * persistent console errors in Next.js/Turbopack dev mode.
 * Inline SVGs render directly in the DOM — no loading, no errors.
 * Handles both base64-encoded and URL-encoded SVG data URIs.
 */
/**
 * Helper to clean and extract valid SVG string from decoded markup.
 * Handles XML declarations (<?xml ...?>), DOCTYPE statements, comments,
 * and leading/trailing whitespace.
 */
export function cleanSvgMarkup(markup: string): string | null {
  if (!markup) return null;
  let cleaned = markup.trim();
  // Strip <?xml ... ?>
  cleaned = cleaned.replace(/^<\?xml[^>]*\?>/i, '').trim();
  // Strip <!DOCTYPE ...>
  cleaned = cleaned.replace(/^<!DOCTYPE[^>]*>/i, '').trim();

  const svgIndex = cleaned.indexOf('<svg');
  if (svgIndex !== -1) {
    return cleaned.slice(svgIndex);
  }
  return null;
}

/**
 * Safely decode any SVG data URI (Base64, URL-encoded, or raw UTF-8).
 */
export function decodeSvgDataUri(dataUri: string): string | null {
  if (!dataUri || !dataUri.includes('data:image/svg+xml')) return null;

  // Clean dataUri string
  const uri = dataUri.trim().replace(/^["']|["']$/g, '');

  // Check if base64
  const base64Match = /;base64,([\s\S]*)$/i.exec(uri);
  if (base64Match) {
    try {
      const cleanB64 = base64Match[1].replace(/\s+/g, '');
      const rawMarkup = decodeBase64(cleanB64);
      return cleanSvgMarkup(rawMarkup);
    } catch {
      return null;
    }
  }

  // URL-encoded or raw UTF-8
  const commaIndex = uri.indexOf(',');
  if (commaIndex !== -1) {
    const encodedContent = uri.slice(commaIndex + 1);
    try {
      const decoded = decodeUrlEncoded(encodedContent);
      const cleaned = cleanSvgMarkup(decoded);
      if (cleaned) return cleaned;
    } catch {
      // ignore
    }
    return cleanSvgMarkup(encodedContent);
  }

  return null;
}

/**
 * Replace <img> tags whose src is an SVG data URI with inline <svg> elements.
 * SVG data URIs in <img src> can fail to load in sandboxed iframes and during PDF generation,
 * causing persistent console errors in Next.js/Turbopack dev mode and blank PDFs.
 * Inline SVGs render directly in the DOM — no loading, no errors.
 * Also converts any remaining URL-encoded SVG data URIs (data:image/svg+xml,%3Csvg...)
 * into Base64-encoded SVG data URIs because Next.js Turbopack fails on %3Csvg URL-encoded data URIs.
 */
export function replaceSvgDataUris(html: string): string {
  if (!html) return '';

  let result = html;

  // 1. Match <img> tags with base64-encoded SVG data URIs
  const base64Regex = /<img\s+[^>]*src=(?:"|'|&quot;)?data:image\/svg\+xml(?:;[^,]+)?;base64,([^"'\s>]+)(?:"|'|&quot;|\s|>)[^>]*>/gi;
  result = result.replace(base64Regex, (match, base64Content) => {
    try {
      const cleanB64 = base64Content.replace(/\s+/g, '');
      const rawMarkup = decodeBase64(cleanB64);
      const svgMarkup = cleanSvgMarkup(rawMarkup);
      if (svgMarkup) {
        return svgMarkup;
      }
    } catch {
      // fall through
    }
    return match;
  });

  // 2. Match <img> tags with URL-encoded or raw SVG data URIs
  const urlEncodedRegex = /<img\s+[^>]*src=(?:"|'|&quot;)?data:image\/svg\+xml(?:;[^,]+)?,([\s\S]*?)(?:"|'|&quot;|\s|>)[^>]*>/gi;
  result = result.replace(urlEncodedRegex, (match, encodedContent) => {
    try {
      const svgMarkup = decodeSvgDataUri(`data:image/svg+xml,${encodedContent}`);
      if (svgMarkup) {
        return svgMarkup;
      }
    } catch {
      // fall through
    }
    return match;
  });

  // 3. Convert any remaining URL-encoded SVG data URIs (data:image/svg+xml,%3Csvg...)
  // anywhere in the document into Base64 format so Turbopack will not error on %3Csvg.
  const urlEncodedGlobalRegex = /data:image\/svg\+xml(?:;charset=[^;,]+)?,(%3C[\s\S]*?)(?=["'\s\);>])/gi;
  result = result.replace(urlEncodedGlobalRegex, (match, encodedSvg) => {
    try {
      const decodedSvg = decodeUrlEncoded(encodedSvg);
      const cleaned = cleanSvgMarkup(decodedSvg);
      if (cleaned) {
        const b64 = typeof Buffer !== 'undefined'
          ? Buffer.from(cleaned, 'utf-8').toString('base64')
          : btoa(cleaned);
        return `data:image/svg+xml;base64,${b64}`;
      }
    } catch {
      // ignore
    }
    return match;
  });

  // 4. Handle <img> tags with unquoted URL‑encoded SVG data URIs (e.g., src=data:image/svg+xml,%3Csvg...)
  const imgTagRegex = /<img\s+[^>]*src=(?:['"]?)data:image\/svg\+xml,([^'"\s>]+)[^>]*>/gi;
  result = result.replace(imgTagRegex, (match, encoded) => {
    try {
      const decoded = decodeUrlEncoded(encoded);
      const cleaned = cleanSvgMarkup(decoded);
      if (cleaned) {
        return cleaned;
      }
    } catch {
      // ignore
    }
    return match;
  });

  // 5. Final fallback: any remaining URL‑encoded SVG data URIs (e.g., data:image/svg+xml,%3Csvg...)
  const leftoverUrlEncodedSvgRegex = /data:image\/svg\+xml,([^'"\s>]+)/gi;
  result = result.replace(leftoverUrlEncodedSvgRegex, (match, encoded) => {
    try {
      const decoded = decodeUrlEncoded(encoded);
      const cleaned = cleanSvgMarkup(decoded);
      if (cleaned) {
        const b64 = typeof Buffer !== 'undefined'
          ? Buffer.from(cleaned, 'utf-8').toString('base64')
          : btoa(cleaned);
        return `data:image/svg+xml;base64,${b64}`;
      }
    } catch {
      // ignore
    }
    return match;
  });

  return result;
}

/**
 * Parse explicit width/height (or viewBox fallback) from SVG markup, in px.
 */
function parseSvgDimensions(svgMarkup: string): { width: number; height: number } {
  const getAttr = (attr: string): number => {
    const m = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i').exec(svgMarkup);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };
  let width = getAttr('width');
  let height = getAttr('height');
  if (!width || !height) {
    const vb = /viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i.exec(svgMarkup);
    if (vb) {
      if (!width) width = parseFloat(vb[3]);
      if (!height) height = parseFloat(vb[4]);
    }
  }
  return { width: width || 0, height: height || 0 };
}

/** 1×1 transparent GIF — used to silently hide an image that could not be rasterized. */
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Rasterize SVG content to a PNG data URI via a browser <canvas>.
 * Returns null (caller decides the fallback) on any failure.
 */
async function svgToPngDataUri(source: string): Promise<string | null> {
  let url: string | null = null;
  try {
    let svgMarkup = source;
    if (/^data:image\/svg\+xml/i.test(source)) {
      svgMarkup = decodeSvgDataUri(source) ?? source;
    }
    // An SVG loaded via <img> must declare xmlns on the root element.
    if (!/<svg\b[^>]*\bxmlns\s*=/i.test(svgMarkup)) {
      svgMarkup = svgMarkup.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    url = objectUrl;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg image failed to load'));
      img.src = objectUrl;
    });

    const { width: svgW, height: svgH } = parseSvgDimensions(svgMarkup);
    const naturalW = svgW || img.naturalWidth || 300;
    const naturalH = svgH || img.naturalHeight || 150;
    // Render at 2× for crispness, capped so we never create huge canvases.
    const width = Math.min(Math.max(Math.round(naturalW * 2), 1), 1200);
    const height = Math.min(Math.max(Math.round(naturalH * 2), 1), 1200);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } catch (err) {
    // Fail safe: the caller substitutes a transparent GIF so the image is
    // silently hidden instead of triggering html2canvas console errors.
    console.warn('Failed to rasterize SVG placeholder for PDF:', (err as Error)?.message);
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * Rasterize every SVG in the HTML to a PNG data-URI <img> tag, in place.
 *
 * Why this exists: client-side PDF generation via jsPDF's doc.html() renders
 * through html2canvas, which cannot load SVG images in ANY form inside its
 * render context — neither inline <svg> elements (it serializes them and logs
 * "Error loading svg data:...") nor base64 SVG data-URI <img> tags (it logs
 * "Error loading image data:image/svg+xml;base64,..."). Both errors spam the
 * console and drop the placeholder images from the generated PDF. PNG data
 * URIs load fine there, so this converts the SVGs to PNGs right before
 * doc.html().
 *
 * The sandboxed-iframe preview pipeline must KEEP calling replaceSvgDataUris
 * (inline <svg> is required there); this helper is only for the PDF path and
 * only runs in the browser (server-side / non-DOM environments are no-ops).
 *
 * Handles both inline <svg> elements and any leftover base64 SVG data-URI
 * <img> tags. If a specific SVG cannot be rasterized, it is replaced with a
 * transparent GIF so it is silently hidden instead of erroring.
 *
 * Note: assumes inline SVGs are not nested (matches up to the first </svg>).
 */
export async function rasterizeSvgPlaceholders(html: string): Promise<string> {
  if (!html) return '';
  if (typeof document === 'undefined' || typeof Image === 'undefined') return html;

  // Tolerate '>' inside quoted attribute values, e.g. viewBox="0 0 200 80".
  const inlineSvgRegex = /<svg\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/svg>/gi;
  const svgImgRegex = /<img\s[^>]*?src="(data:image\/svg\+xml;base64,[^"]+)"[^>]*>/gi;

  let result = html;

  // Phase 1: inline <svg> elements (this is what replaceSvgDataUris produces).
  const svgMatches = [...result.matchAll(inlineSvgRegex)];
  for (const match of svgMatches) {
    const png = await svgToPngDataUri(match[0]);
    result = result.replace(
      match[0],
      png ? `<img src="${png}" alt="" />` : `<img src="${TRANSPARENT_GIF}" alt="" />`
    );
  }

  // Phase 2: any remaining base64 SVG data-URI <img> tags (defensive).
  const imgMatches = [...result.matchAll(svgImgRegex)];
  for (const match of imgMatches) {
    const png = await svgToPngDataUri(match[1]);
    result = result.replace(
      match[0],
      png ? `<img src="${png}" alt="" />` : `<img src="${TRANSPARENT_GIF}" alt="" />`
    );
  }

  return result;
}
