# Phase 1 Data Model: Web Push Reminder Delivery

## New D1 table: `push_subscriptions` (migration `0014_push_subscriptions.sql`)

One row per opted-in browser/device.

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Server-generated. |
| `tenant_id` | `TEXT NOT NULL` | `REFERENCES tenants (id) ON DELETE CASCADE` — GDPR erasure: deleted with the tenant (plan.md Constitution Check §VIII). |
| `endpoint` | `TEXT NOT NULL` | The push service URL from the browser's `PushSubscription.endpoint`. |
| `p256dh` | `TEXT NOT NULL` | Base64url-encoded `PushSubscription.keys.p256dh`. |
| `auth` | `TEXT NOT NULL` | Base64url-encoded `PushSubscription.keys.auth`. |
| `created_at` | `TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` | |

**Unique**: `(tenant_id, endpoint)` — re-subscribing the same browser upserts rather than
duplicating (a browser can rotate its own endpoint over time, in which case it's a new row, not an
update of the old one — the old row simply stops being reachable and is pruned on its next `410`,
per research.md).

## Existing tables: no schema change

`reminder_rules.last_notified_severity` (already added by specs/011, migration `0011`) is now the
shared dedup gate for *both* channels — no new column. `evaluateAllReminders` (existing function,
`src/server/db/repository.ts`) is extended, not replaced.

## New endpoints (session-only — `tenantContext`, not `tenantContextOrToken`)

### `GET /api/v1/push/vapid-public-key`

No rate limit (read-only, like every other `GET`).

Response `200`:
```json
{ "publicKey": "<base64url VAPID public key>" }
```

### `POST /api/v1/push/subscriptions`

`rateLimitBySession`. Body: the browser's `PushSubscriptionJSON`:
```json
{ "endpoint": "https://...", "keys": { "p256dh": "...", "auth": "..." } }
```
- `400 { "error": "invalid_request" }` if `endpoint`/`keys.p256dh`/`keys.auth` are missing or not
  strings.
- `201` with the stored subscription's `id`/`createdAt` on success (upserts on
  `(tenant_id, endpoint)`, per data-model.md above).

### `DELETE /api/v1/push/subscriptions`

`rateLimitBySession`. Body: `{ "endpoint": "https://..." }`.
- `204` whether or not a matching row existed (idempotent — the same "delete is idempotent" contract
  every other delete route in this codebase already follows, e.g. `deleteReminderRule`).

## Notification payload (what the service worker receives)

Not persisted — constructed fresh per send from the same fields the email channel already uses
(`vehicleName`, `ruleLabel`, `status`):

```json
{ "title": "<vehicleName>: <ruleLabel> <status text>", "body": "..." }
```

Mirrors the existing email subject/body content (plan.md Constitution Check §IX) — no new content
decision, just a second rendering of the same substance.
