/**
 * Extracts unique placeholder keys from template/document HTML.
 *
 * Matches both syntaxes used by the render pipeline (mirroring the renderers'
 * own fallback regex, which requires at least one fallback character):
 *   - `{{Key}}`                → Key
 *   - `{{Key:fallback}}`       → Key (the fallback is render-time only)
 *
 * Detection is deliberately open-ended (any key, including custom ones) —
 * `SYSTEM_PLACEHOLDERS` is the *resolution* set for built-in placeholders,
 * not a whitelist for detection. Keys are returned in order of first
 * appearance, with duplicates dropped.
 */
export function extractPlaceholders(html: string): string[] {
  const regex = /\{\{([\w.-]+)(?::([^}]+))?\}\}/g;
  const placeholders: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (!placeholders.includes(match[1])) placeholders.push(match[1]);
  }
  return placeholders;
}
