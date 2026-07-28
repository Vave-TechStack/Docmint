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
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleaned)}`;
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
  if (lower.includes('signature') || lower.includes('sign')) return PLACEHOLDER_IMAGES.signature;
  if (lower.includes('seal') || lower.includes('stamp')) return PLACEHOLDER_IMAGES.seal;
  if (lower.includes('heroimage') || lower.includes('cover')) return PLACEHOLDER_IMAGES.generic;
  return PLACEHOLDER_IMAGES.generic;
}
