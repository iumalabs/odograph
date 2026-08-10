# API Contracts: Document Expiry Reminders

No new routes — this feature extends the response shape of specs/023's existing document routes
and adds a side effect to one of them. No request shape changes anywhere.

## `GET /api/v1/vehicles/:vehicleId/documents` (specs/023, response extended)

Each document in `{ "documents": Document[] }` now also includes:

```json
"reminderStatus": "on_track" | "coming_up" | "overdue" | null
```

`null` when the document has no `expiryDate` (FR-002) — never a fabricated status for a document
that was never a reminder candidate.

## `GET /api/v1/documents/:id` (specs/023, response extended)

Same `reminderStatus` field added to the single-document response, computed live at request time
(research.md) — never a stale cached value.

## `PATCH /api/v1/documents/:id` (specs/023, side effect extended)

No request/response shape change. When the request includes `expiryDate` (a new date or an
explicit `null`), the response's `reminderStatus` reflects the *new* value immediately, and the
document's internal notification-escalation state is cleared server-side (FR-007) — the next
sweep evaluates it fresh, with no memory of any notification sent before this edit.

## Cron-triggered sweep (no HTTP surface)

Not a route — runs on the existing Cron Trigger alongside the maintenance-reminder sweep
(research.md). No contract beyond what's already documented for `evaluateAllReminders`'s
equivalent: on each run, for every document with a non-null `expiryDate`, computes status,
persists bookkeeping state, and — on a transition to a more urgent state than last notified —
sends exactly one email (to the tenant's deliverable recipient, if any) and one push notification
per active subscription (if any), skipping unavailable channels without failing the sweep
(FR-003–FR-006).

## Cross-cutting

- Every notification the sweep sends stays scoped to the document's own `tenant_id` — no
  cross-tenant delivery, identical to the existing maintenance-reminder sweep's guarantee (FR-009).
- Deleting a document or its vehicle (specs/023) simply removes it from future sweep passes — no
  explicit "cancel reminder" contract needed (FR-008).
