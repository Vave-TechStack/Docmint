/**
 * Trusted reverse-proxy resolution.
 *
 * Several security decisions depend on knowing the real client protocol and
 * host: HSTS may only be asserted for a request that actually arrived over
 * HTTPS, and a CSP `Reporting-Endpoints` URL must never be built from an
 * attacker-chosen Host. Both used to read forwarding headers directly, which
 * is only sound when the deployment guarantees it overwrites them.
 *
 * `TRUST_PROXY` is the switch, and it mirrors the rule already used by
 * `getClientIp` in `@/lib/rate-limit`: forwarding headers are ignored unless
 * the operator has declared that a trusted proxy sits in front of the app and
 * overwrites them. Default is DISABLED, so a directly-reachable deployment
 * cannot be tricked into believing it is on HTTPS.
 */

/** Whether forwarding headers may be believed. Defaults to disabled. */
export function trustProxyEnabled(): boolean {
  return process.env.TRUST_PROXY === 'true';
}

/**
 * The protocol the CLIENT used to reach the trusted proxy, or `null` when it
 * cannot be established.
 *
 * Returns `null` — not a guess — whenever the proxy is untrusted, so callers
 * are forced to make a fail-safe decision instead of inheriting a forged
 * value.
 */
export function getTrustedProto(request: Request): 'http' | 'https' | null {
  if (!trustProxyEnabled()) return null;
  // First hop is the one the trusted proxy appended; a client can only
  // prepend to this header.
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) {
    const proto = forwarded.split(',')[0]?.trim().toLowerCase();
    if (proto === 'https' || proto === 'http') return proto;
    return null;
  }
  return null;
}

/**
 * Whether the request provably arrived over HTTPS.
 *
 * HSTS is only emitted on `true`. Emitting it for an unverified request would
 * assert a transport guarantee the app cannot actually make, and honouring a
 * client-supplied `x-forwarded-proto` would let any caller manufacture it.
 */
export function isVerifiedHttps(request: Request): boolean {
  return getTrustedProto(request) === 'https';
}

/**
 * The public origin to advertise in security headers, or `null` when unknown.
 *
 * Only consulted when the proxy is trusted. The hostname is validated against
 * a strict character class before use so a crafted `Host` cannot inject header
 * syntax or break out of the quoted `Reporting-Endpoints` value.
 */
export function getTrustedOrigin(request: Request): string | null {
  if (!trustProxyEnabled()) return null;

  const proto = getTrustedProto(request);
  if (!proto) return null;

  // First hop is the proxy-asserted host; later hops are client-influenced.
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (!host || !isValidAuthority(host)) return null;

  return `${proto}://${host}`;
}

const IPV6_AUTHORITY = /^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;
const HOSTNAME_AUTHORITY = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:\d{1,5})?$/;

/**
 * Validates `host[:port]`.
 *
 * Rejects anything outside hostname/IPv6-literal plus optional port, which
 * excludes quotes, semicolons, whitespace and CR/LF — the characters that
 * would let a hostile header terminate the header value early or inject a
 * second one.
 */
export function isValidAuthority(host: string): boolean {
  if (host.length > 255) return false;
  if (IPV6_AUTHORITY.test(host)) return true;
  return HOSTNAME_AUTHORITY.test(host);
}