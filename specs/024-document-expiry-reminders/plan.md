# Implementation Plan: Document Expiry Reminders (Email + Push)

**Branch**: `024-document-expiry-reminders` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-document-expiry-reminders/spec.md`

## Summary

Add expiry-based reminder evaluation for `documents` (specs/023) that reuses, rather than
duplicates, the maintenance-reminder machinery from specs/011/012/022: the same three-state status
model, the same `last_notified_severity`-driven escalation/dedup policy, and the same email/push
delivery functions. The one new piece of domain logic is a document-specific status classifier
(`computeDocumentReminderStatus`) using a fixed 30-day coming-up window instead of
`reminder_rules`' interval-proportional one, since a document has a single fixed `expiry_date`
with no interval to derive a proportion from (research.md). `sendReminderDueEmail` and
`sendReminderPushNotification` are generalized from a `ruleLabel` parameter to `itemLabel` so both
sweeps call the exact same two functions — not a second, parallel notification system, per the
issue's explicit requirement.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new — reuses `web-push-browser` (already a dependency via
specs/022) and the existing `EMAIL` binding, unchanged.

**Storage**: D1 — three new columns on the existing `documents` table (`cached_status`,
`last_evaluated_at`, `last_notified_severity`), mirroring `reminder_rules`' exact shape
(migrations 0010/0011). `cached_status`/`last_evaluated_at` are write-only bookkeeping from the
sweep, never read back by an API response — same documented posture `reminder_rules` already has
(`src/server/db/schema.sql`'s existing comment on that table). No new table.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup) — same pattern
`reminder-rules.test.ts` already uses: real wall-clock time plus a small helper to construct
`expiry_date` values relative to `now` for deterministic on-track/coming-up/overdue assertions, no
fake-clock injection needed since `computeDocumentReminderStatus` takes `now` as an explicit
parameter (pure function, directly unit-testable without going through the HTTP layer at all).

**Target Platform**: Cloudflare Workers (`workerd`), Cron Trigger (existing `scheduled` handler,
no new trigger entry); client UI shows the same three-state badge already shown for
`isExpired`/reminder rules, extended to distinguish coming-up from overdue.

**Project Type**: Web application (existing single-Worker structure) — touches
`src/server/db/repository.ts` (documents section + email/push call sites),
`src/server/email/reminder-notification.ts`, `src/server/push/send-reminder-push.ts`,
`src/server/index.ts` (scheduled handler), `src/server/routes/v1/documents.ts` (response shape),
and `src/client/documents.ts`/`DocumentPanel.tsx`.

**Performance Goals**: No new target — the document sweep is the same shape as the existing
reminder sweep (one pass over a table, no N+1 beyond a per-row vehicle-name lookup, identical to
`evaluateAllReminders`'s existing pattern).

**Constraints**: The sweep function has no `TenantContext`, by design, matching
`evaluateAllReminders`'s documented cross-tenant exception (data-model.md) — every row still
carries its own `tenant_id` and routes notifications only to that tenant's recipient/subscriptions
(FR-009); every write path stays behind the existing repository/route conventions; no new
dependency, no new Cron trigger declaration in `wrangler.toml`.

**Scale/Scope**: One migration (3 columns), one new pure function
(`computeDocumentReminderStatus`), one new sweep function (`evaluateAllDocumentReminders`, closely
mirroring `evaluateAllReminders`), a one-parameter rename across 2 existing functions + 2 existing
call sites (`ruleLabel` → `itemLabel`), one new field on the document GET/list response
(`reminderStatus`), a small `updateDocument` change (clear notification state on `expiryDate`
edit), one new call in the `scheduled` handler, minor client UI extension.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | All D1 access stays in `repository.ts`; the sweep's documented cross-tenant exception matches `evaluateAllReminders`'s existing, already-accepted precedent — every row is still scoped by its own `tenant_id` for notification routing | PASS |
| II. Server-computed aggregates | `reminderStatus` is computed server-side, at read time, never left for the client to infer from a raw `expiry_date` (FR-001) | PASS |
| III | N/A — no offline-queue writes in this feature | N/A |
| IV. No Interpolated Data | A document with no `expiry_date` is never assigned a status (FR-002) — never guessed | PASS |
| V-VI | N/A — no attachments or API tokens touched by this feature | N/A |
| VII. Rate limiting | No new write route; `PATCH /api/v1/documents/:id` is already rate-limited (specs/023), unchanged | PASS |
| VIII. GDPR erasure by design | The three new columns live on the already-erasure-decided `documents` table (specs/023: delete, cascading from `vehicles`) — no new erasure surface | PASS |
| IX. i18n axes | New UI strings (coming-up/overdue badge text) route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline; the existing Cron Trigger's `scheduled` handler gains one more call, no new trigger declaration | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/024-document-expiry-reminders/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/server/
├── db/
│   └── repository.ts                  # MODIFY: documents section gains
│                                        #   computeDocumentReminderStatus (pure fn),
│                                        #   DOCUMENT_COMING_UP_WINDOW_DAYS constant,
│                                        #   evaluateAllDocumentReminders (sweep, mirrors
│                                        #   evaluateAllReminders), reminderStatus added to
│                                        #   findDocumentById/listDocuments' live computation
│                                        #   (alongside isExpired), updateDocument clears
│                                        #   last_notified_severity when expiryDate changes
├── email/
│   └── reminder-notification.ts       # MODIFY: sendReminderDueEmail's `ruleLabel` param
│                                        #   renamed to `itemLabel` (generalizes for reuse,
│                                        #   research.md)
├── push/
│   └── send-reminder-push.ts          # MODIFY: same rename in
│                                        #   sendReminderPushNotification
├── index.ts                            # MODIFY: scheduled handler also calls
│                                        #   evaluateAllDocumentReminders(env)
└── routes/v1/
    └── documents.ts                    # MODIFY: GET responses include reminderStatus
                                         #   (already-generic passthrough of the repository's
                                         #   document object — no new route)

migrations/
└── 0016_document_reminder_state.sql    # ADD: cached_status, last_evaluated_at,
                                         #   last_notified_severity on documents

src/client/
├── documents.ts                        # MODIFY: VehicleDocument type gains reminderStatus
└── components/
    └── DocumentPanel.tsx               # MODIFY: shows a coming-up badge distinct from the
                                         #   existing expired badge, using reminderStatus

tests/server/
├── document-crud.test.ts               # MODIFY: reminderStatus assertions folded into the
│                                        #   existing read-section tests
└── document-reminders.test.ts          # ADD: status transitions, escalation/dedup, email+push
                                         #   delivery, skip-on-missing-channel, renewal clears
                                         #   state, Cron scheduling — mirrors
                                         #   reminder-rules.test.ts's equivalent sections
```

**Structure Decision**: No new files beyond the migration and the new test file — this feature is
almost entirely additive within `repository.ts`'s existing documents section, following the exact
precedent `reminder_rules`' own status/escalation/sweep code already set in the same file.

## Complexity Tracking

*No entries — no constitution violations.*
