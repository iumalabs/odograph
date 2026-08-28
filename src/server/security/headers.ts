/**
 * Static security headers with no per-request state (issue #286) — unlike CSP (csp.ts), these
 * never vary by request, so there's nothing to build per-response, just a fixed set to attach.
 *
 * - Strict-Transport-Security: locks in HTTPS for future visits, closing the SSL-stripping window
 *   on a first/expired-HSTS-entry visit that a redirect-to-HTTPS alone doesn't cover.
 * - X-Content-Type-Options: blocks MIME-sniffing-based content-type confusion.
 * - Referrer-Policy: avoids leaking a full URL (including any sensitive query params) to a
 *   third-party destination via the Referer header on outbound navigation/resource loads.
 * - Permissions-Policy: denies camera/geolocation/microphone outright, not just scoped to self —
 *   verified against actual usage (grep for getUserMedia/geolocation/microphone/MediaStream across
 *   src/client turns up nothing). The photo/receipt "camera" feature uses
 *   `<input capture="environment">`, the native file-picker capture attribute, which is not what
 *   Permissions-Policy's `camera` directive gates (only the JS getUserMedia()/MediaDevices API is)
 *   — there's nothing here to allow.
 */
export function applySecurityHeaders(headers: Headers): void {
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
}
