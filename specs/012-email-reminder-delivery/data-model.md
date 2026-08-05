# Phase 1 Data Model: Email Reminder Delivery

## `reminder_rules` (extended — migration 0011)

| Column | Type | Notes |
|---|---|---|
| `last_notified_severity` | TEXT nullable | one of `coming_up`/`overdue`, or `NULL` if never
  notified (or reset back to `on_track` since the last notification — research.md Decision 2).
  Written **only** by the scheduled sweep's new email side effect (`evaluateAllReminders`), never
  by any request handler — same "sweep-only bookkeeping" precedent `cached_status`/
  `last_evaluated_at` already established in spec 011, and likewise never read by this project's
  own reminder-rule API responses (`status` is always computed fresh there, unaffected by this
  column). |

No new table, no new index — this column is read/written exclusively inside the existing
`evaluateAllReminders` sweep, keyed by the row's own `id`, the same access pattern
`cached_status` already uses.

**GDPR erasure**: Covered by the existing cascade — this is one more column on a row that already
cascades from `vehicles` (spec 011); no independent erasure decision needed.

## Repository layer additions/changes (`src/server/db/repository.ts`)

- `ReminderRule` type gains `lastNotifiedSeverity: "coming_up" | "overdue" | null`.
- `evaluateAllReminders(db): Promise<{ evaluated: number; failed: number; notified: number }>` —
  return shape extended with a `notified` count (research.md Decision 7); per-row behavior extended
  (still inside the existing per-row `try`/`catch`, so a failure here is isolated exactly like a
  status-computation failure already is):
  - `status === "on_track"` → if `last_notified_severity` is not already `NULL`, clear it.
  - `status === "coming_up" | "overdue"` and more severe than `last_notified_severity` (via the
    existing `REMINDER_URGENCY` ordering, treating `NULL` as `on_track`'s severity) → resolve the
    recipient (below); if a deliverable address is found, send and set `last_notified_severity` to
    the new `status` on success; if no deliverable address is found, leave
    `last_notified_severity` untouched (research.md Decision 5) and do not count it as a failure.
  - `status === "not_enough_data"` → no change to `last_notified_severity`.
- `findDeliverableReminderRecipient(db, tenantId): Promise<string | null>` — new. Implements
  research.md Decision 3's two-step lookup: `users.email` for the tenant if not a placeholder
  (`@example.invalid`), else the first `magic_link_identities.email` linked to that user's id, else
  `null`.
- `isPlaceholderEmail(email): boolean` — new, small pure helper (`@example.invalid` suffix check),
  reused by `findDeliverableReminderRecipient` and directly unit-testable on its own.

## New module: `src/server/email/reminder-notification.ts`

- `sendReminderDueEmail(env, input: { to: string; vehicleName: string; ruleLabel: string; status:
  "coming_up" | "overdue" }): Promise<{ sent: true } | { sent: false; error: string }>` — mirrors
  `sendMagicLinkEmail()`'s exact contract (never throws; `FROM_ADDRESS = "auth@odograph.dev"`;
  plain string-interpolated `text`/`html`, no templating library). Subject and body name the
  vehicle and the reminder label and state whether it's "coming up" or "overdue," per FR-011.
