# Phase 1 Data Model: Styled Transactional Email Template

No persisted entities — this feature adds no database table, R2 key, or KV entry. The one
structural "entity" from spec.md's Key Entities section is the in-memory content-slot contract
each sender fills in before rendering.

## `EmailContent` (in-memory shape, not persisted)

The shared chrome renderer's single input. Each field maps directly to a piece of the design's
visual structure (spec.md's "What the design shows").

| Field | Type | Required | Maps to |
|---|---|---|---|
| `purposeTag` | `string` | yes | Header's short label (e.g. `"SIGN-IN LINK"`, `"NEW ACCOUNT"`, `"CONFIRM EMAIL"`, `"REMINDER"`) |
| `headline` | `string` | yes | Body's large headline |
| `bodyText` | `string` | yes | Body's greeting/explanation paragraph |
| `ctaLabel` | `string \| null` | no | Button text — `null` when the email has no single primary action (e.g. a reminder notification, which links nowhere today) |
| `ctaUrl` | `string \| null` | no, required if `ctaLabel` is set | Button `href`, and the plain-text fallback link (FR-004) — `null` in lockstep with `ctaLabel` |
| `expiryNote` | `string \| null` | no | Grey expiry strip (FR-005) — `null` for content that has no expiry (e.g. a reminder notification) |
| `details` | `Array<{ label: string; value: string }>` | no, defaults to `[]` | Monospace "REQUEST DETAILS" rows (FR-007) — only entries the caller actually has; never a fixed-length array with fabricated filler |
| `fallbackNote` | `string \| null` | no | "Didn't request this?" note (FR-006) — set for magic-link purposes, `null` for the reminder email (nothing was "requested," so the note doesn't apply); never the design's fictional "rotate your Access policy" wording |

### Validation rules

- `purposeTag`, `headline`, `bodyText` are non-empty strings on every content object — there's no
  "default" copy, each purpose owns its own content (FR-008).
- `ctaLabel` and `ctaUrl` are set together or omitted together — a label with no URL (or vice
  versa) is a caller bug, not a renderer state to support.
- `details` entries only ever come from data the caller actually resolved (e.g. the target email
  address, the app hostname) — the renderer does not validate *values* (that's the caller's
  responsibility, per Principle IV), it just renders whatever rows it's given, or none.
- `expiryNote` is `null`, not an empty string, when there's no expiry to show — keeps "no expiry
  strip" and "empty-string bug" visually and structurally distinct in the renderer.

### Per-purpose content (magic-link, User Story 1)

| Purpose | `purposeTag` | `expiryNote` | `details` |
|---|---|---|---|
| `new-account` | `"NEW ACCOUNT"` | `"EXPIRES IN 15 MINUTES · single use"` | `ACCOUNT` (target email), `INSTANCE` (hostname) |
| `sign-in` | `"SIGN-IN LINK"` | same | same |
| `link` | `"CONFIRM EMAIL"` | same | same |

### Reminder content (User Story 2)

| Field | Value |
|---|---|
| `purposeTag` | `"REMINDER"` |
| `expiryNote` | `null` (reminders don't expire) |
| `details` | `[]` (no request-details concept for a scheduled notification) |
| `ctaLabel` / `ctaUrl` | Both `null` — the existing reminder email has no link today and this feature doesn't add one (no target URL is currently threaded into `sendReminderDueEmail`); the renderer omits the button section entirely, matching current behavior with new chrome only |
| `fallbackNote` | `null` — nothing was "requested," the note doesn't apply |
