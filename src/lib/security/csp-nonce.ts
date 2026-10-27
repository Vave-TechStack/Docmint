/**
 * Reads the per-request CSP nonce that the server placed on the document, so a
 * dynamically created `<script>` can carry it.
 *
 * TRUSTWORTHINESS: the value is read from the `<script id="csp-nonce">` element
 * or `<meta name="csp-nonce">` tag that the server renders. Neither is
 * attacker-controllable — both are part of the server-rendered HTML — so this
 * is a trusted source. It is deliberately NOT read from a query parameter, a
 * cookie, or `window.location`, all of which a client can influence.
 *
 * This is a plain function rather than a hook on purpose. The nonce is only
 * needed at the moment a script is injected, which happens on a user click, so
 * there is nothing to subscribe to and no render-time state to keep in sync.
 *
 * Returns `undefined` when nonce propagation is not enabled for this response
 * (the current, pre-migration state). Callers must treat that as "no nonce
 * available" and inject the script exactly as they did before, so enabling
 * nonces later is a no-op for responses that have none.
 */
const NONCE_ELEMENT_ID = 'csp-nonce';
const NONCE_META_SELECTOR = 'meta[name="csp-nonce"]';

/**
 * Validates a nonce candidate before it is applied to a script element.
 *
 * A CSP nonce is a base64 string. Restricting the character set keeps a
 * malformed server value from producing a policy mismatch that is hard to
 * diagnose, and bounds the value before it reaches an attribute.
 */
function isPlausibleNonce(value: string | null | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9+/=_-]+$/.test(value)
  );
}

/**
 * Returns the current request's CSP nonce, or `undefined` when unavailable.
 * Safe to call in the browser only.
 */
export function getCspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const fromElement = document.getElementById(NONCE_ELEMENT_ID)?.getAttribute('data-nonce');
  if (isPlausibleNonce(fromElement)) return fromElement;

  const fromMeta = document.querySelector(NONCE_META_SELECTOR)?.getAttribute('content');
  if (isPlausibleNonce(fromMeta)) return fromMeta;

  return undefined;
}