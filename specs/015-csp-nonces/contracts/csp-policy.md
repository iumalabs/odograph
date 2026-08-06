# Policy Contract: Content-Security-Policy Header

No new HTTP route — this document specifies the shape of a response header attached to existing HTML
responses.

## Header value

```
default-src 'self';
script-src 'self' 'nonce-<per-request value>';
style-src 'self' 'nonce-<per-request value>';
img-src 'self';
font-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'self';
```

(Single-line in the actual response header — shown multi-line here for readability.)

`<per-request value>` is the base64-encoded, `crypto.getRandomValues`-derived nonce (research.md) —
the exact same string appears in both `script-src` and `style-src`, and is different on every single
response.

## When it's attached

- **Attached**: any response whose `Content-Type` starts with `text/html` — in practice, the
  application's single HTML entry point, served via `env.ASSETS.fetch()` (research.md), for every
  request that isn't recognized as an `/api/v1/*` route.
- **Not attached**: `/api/v1/*` JSON responses (no document, CSP has nothing to govern there), and
  any non-HTML static asset (JS, CSS, fonts, the favicon) — passed through from `env.ASSETS.fetch()`
  completely unmodified.

## Guarantees this contract makes

- No wildcard (`*`) appears anywhere in `script-src` or `style-src`.
- No `'unsafe-inline'` or `'unsafe-eval'` appears anywhere in `script-src` or `style-src`.
- The nonce differs between any two responses, including two requests for the identical URL from the
  identical client in immediate succession.
- Every directive not explicitly listed above falls back to `default-src 'self'` — nothing is left
  unrestricted by omission.
