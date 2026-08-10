# Phase 1 Data Model: Document Expiry Reminders

## Entities

### `documents` (extended — specs/023's table gains three columns)

| New column              | Type    | Notes                                                             |
| ------------------------ | ------- | ------------------------------------------------------------------ |
| `cached_status`           | TEXT    | Write-only sweep bookkeeping — never read back by an API response (same posture `reminder_rules.cached_status` already has, per `schema.sql`'s existing comment on that table) |
| `last_evaluated_at`       | TEXT    | ISO 8601, set by the sweep on every evaluation of this row          |
| `last_notified_severity`  | TEXT    | `NULL \| "coming_up" \| "overdue"` — the escalation-dedup gate (FR-004); cleared to `NULL` whenever `expiry_date` is edited (FR-007) or the row returns to `on_track` |

No new erasure decision needed — these columns live on `documents`, whose delete-cascading-from-
`vehicles` decision (specs/023) already covers them; nothing new to erase independently.

## Relationships

Unchanged from specs/023 — `vehicles (1) ───< (N) documents`. This feature adds no new entity or
relationship, only reminder-evaluation state on the existing one.

## Status computation (pure function, no D1 access)

```text
DOCUMENT_COMING_UP_WINDOW_DAYS = 30  // spec.md Assumptions

function computeDocumentReminderStatus(
  expiryDate: string,  // ISO 8601 date, always non-null when called (FR-002 gates this upstream)
  now: Date,
): "on_track" | "coming_up" | "overdue" {
  remainingDays = (Date.parse(expiryDate) - now.getTime()) / 86_400_000
  if remainingDays < 0: return "overdue"
  if remainingDays <= DOCUMENT_COMING_UP_WINDOW_DAYS: return "coming_up"
  return "on_track"
}
```

Reuses the existing `REMINDER_URGENCY` ranking (`on_track: 0, coming_up: 1, overdue: 2`,
`repository.ts`'s reminder-rules section) for escalation comparisons — no new ranking table.

## Validation / behavior rules (from Functional Requirements)

- A document with `expiry_date IS NULL` is never passed to `computeDocumentReminderStatus` and
  never carries a `reminderStatus` in its API response (FR-001, FR-002) — `reminderStatus` is
  `null` for such a document, mirroring how `isExpired` is already `false` (not a fabricated
  status) for it.
- `findDocumentById`/`listDocuments` compute `reminderStatus` live, at read time, from the row's
  own `expiry_date` and the current time — never from `cached_status` (research.md).
- The sweep (`evaluateAllDocumentReminders`) runs on the same recurring schedule as
  `evaluateAllReminders`, called from the same `scheduled` handler (FR-003, research.md).
- On each evaluation: `cached_status`/`last_evaluated_at` are always updated; if the computed
  status is `on_track`, `last_notified_severity` is cleared to `NULL` (if not already); if
  `coming_up` or `overdue` and more urgent than `last_notified_severity`, one notification attempt
  per channel is made and `last_notified_severity` advances only if at least one channel actually
  sent (FR-004, FR-005) — identical policy to `evaluateAllReminders`.
- A missing channel (no deliverable recipient email, no active push subscription) is skipped, not
  treated as failure — mirrors `evaluateAllReminders`'s existing `attempted`/`sent` bookkeeping
  exactly (FR-006).
- `updateDocument`: when the patch includes `expiryDate` (a new value or an explicit `null`), the
  same `UPDATE` statement also sets `last_notified_severity = NULL` — a renewed or cleared
  document is never suppressed by stale escalation state from before the edit (FR-007).
- `deleteDocument` and the vehicle-delete cascade (specs/023) already remove the row entirely —
  the sweep simply won't find it on its next pass; no extra handling needed for FR-008.
- The sweep has no `TenantContext` (documented cross-tenant exception, identical to
  `evaluateAllReminders`) but every row still carries its own `tenant_id`, and notification
  recipients/subscriptions are looked up per-row by that `tenant_id` — cross-tenant leakage is
  structurally impossible the same way it already is for maintenance reminders (FR-009).

## Repository layer additions/changes (shape, not full implementation)

All changes live in `src/server/db/repository.ts`'s existing documents section, alongside
specs/023's exports.

```text
// New pure function, no D1 access:
function computeDocumentReminderStatus(expiryDate: string, now: Date): ReminderStatus3
// ReminderStatus3 = "on_track" | "coming_up" | "overdue" (reuses the existing type, minus
// "not_enough_data" — a document's expiry_date is always fully known when this runs, unlike
// reminder_rules' mileage side)

// Document type gains:
type Document = DocumentInput & {
  ...  // unchanged fields from specs/023
  isExpired: boolean;                          // unchanged
  reminderStatus: ReminderStatus3 | null;       // NEW — null when expiryDate is null
};

// New sweep, mirrors evaluateAllReminders's exact shape:
function evaluateAllDocumentReminders(
  env: Env & VapidSecrets,
): Promise<{ evaluated: number; failed: number; notified: number }>

// updateDocument (specs/023, modified): when patch.expiryDate is present (in the "expiryDate" in
// patch sense, matching the existing omitted-vs-null convention), also clears
// last_notified_severity in the same UPDATE.
```

## Email/push function signature changes

```text
// src/server/email/reminder-notification.ts
function sendReminderDueEmail(
  env: Env,
  input: { to: string; vehicleName: string; itemLabel: string; status: "coming_up" | "overdue" },
  //                                          ^^^^^^^^^ renamed from ruleLabel
): Promise<SendReminderDueEmailResult>

// src/server/push/send-reminder-push.ts — identical rename
function sendReminderPushNotification(
  vapidKeys: CryptoKeyPair,
  subscription: PushSubscriptionInput,
  input: { vehicleName: string; itemLabel: string; status: "coming_up" | "overdue" },
): Promise<SendReminderPushResult>
```

Both existing call sites inside `evaluateAllReminders` update to pass `itemLabel: rule.label`
instead of `ruleLabel: rule.label` — a pure rename, no behavior change for the existing
maintenance-reminder path.
