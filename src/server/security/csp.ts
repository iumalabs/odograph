/**
 * Fresh per-request nonce (128 bits of `crypto.getRandomValues` entropy, base64-encoded) — never
 * cached, never derived from anything request-independent (constitution Principle VII, FR-003).
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The exact policy shape in specs/015-csp-nonces/contracts/csp-policy.md — narrowest values that
 * don't break anything this app currently does (research.md): icons are inline `<svg>` DOM
 * elements, not `img`/`background-image` loads, so `img-src` needs no `data:` exception; fonts
 * are self-hosted via @fontsource, bundled as same-origin files.
 */
export function buildCspHeader(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self'`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'self'`,
  ].join("; ");
}
