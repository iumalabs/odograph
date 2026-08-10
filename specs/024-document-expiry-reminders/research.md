# Phase 0 Research: Document Expiry Reminders

## Decision: Fixed 30-day coming-up window, not a proportional-remaining one

**Decision**: `computeDocumentReminderStatus` classifies "coming up" as `remainingDays <= 30`
(and `< 0` as "overdue"), a fixed absolute window — not `reminder_rules`' proportional
"last 10% of interval remaining" (`classifyRemainingFraction`, `REMINDER_COMING_UP_THRESHOLD`).

**Rationale**: `reminder_rules`' proportional model exists because reminder intervals vary wildly
(a 7-day interval vs. a 2-year interval) and a fixed day-count wouldn't scale sensibly across that
range. A document's `expiry_date` (specs/023) has no interval at all — it's a single fixed date
with no "last done" anchor to compute a proportion against. A fixed absolute window is both the
only option that makes sense here and matches how real-world renewal reminders for this class of
document (registration, insurance, inspection, warranty) actually work — "renew within 30 days,"
not "renew when 10% of some multi-year period remains."

**Alternatives considered**:
- *Reuse `classifyRemainingFraction` by treating "issued → expiry" as a synthetic interval*:
  Rejected — `documents` (specs/023) deliberately has no "issued date" field, so there is nothing
  to compute a remaining-fraction denominator from without inventing a new required field the spec
  never asked for.
- *Make the window configurable per document/category*: Rejected as unnecessary v1 scope — a
  single documented default (spec.md Assumptions) is simpler and nothing in the issue asks for
  per-category tuning.

## Decision: Generalize `sendReminderDueEmail`/`sendReminderPushNotification` (`ruleLabel` → `itemLabel`)

**Decision**: Rename the `ruleLabel` parameter on both functions to `itemLabel`, updating
`evaluateAllReminders`'s two call sites to pass `itemLabel: rule.label` — rather than adding
parallel `sendDocumentExpiryEmail`/`sendDocumentExpiryPush` functions.

**Rationale**: Both functions already only use `ruleLabel` as an opaque display string (in the
subject/body templates) — nothing about them is actually reminder-rule-specific beyond the
parameter's name. This mirrors the exact shape of research.md's `attachmentKey` generalization
decision in specs/023: a one-parameter rename that lets an existing, working function serve a
second caller, versus a second near-duplicate function that would drift from the first over time.
The issue's own text is explicit that this feature "MUST reuse... rather than building a second
parallel notification system" — duplicating these two functions under new names would violate
that literally, even if the duplicated code started out identical.

**Alternatives considered**:
- *Add parallel document-specific email/push functions*: Rejected — exactly the "second parallel
  notification system" the issue rules out.
- *Generalize further (e.g. a single `sendDueNotification` covering both channels)*: Rejected as
  out of scope — the two functions' bodies differ enough (email HTML vs. push JSON payload, plus
  push's VAPID signing) that merging them would be a larger, riskier refactor than this feature
  needs; the rename is the minimal change that satisfies the reuse requirement.

## Decision: `reminderStatus` computed live at read time, mirroring `isExpired`

**Decision**: `findDocumentById`/`listDocuments` compute `reminderStatus` fresh on every read
(same function, same `now`), exactly like `isExpired` already does — never read from the
`cached_status` column, which exists purely as sweep bookkeeping.

**Rationale**: Consistent with both `reminder_rules`' own precedent (`listReminderRulesWithStatus`
always recomputes live via `computeReminderStatus`, never trusts `cached_status`) and specs/023's
own `isExpired` precedent for this exact table. A cached column can go stale between sweep runs;
recomputing on every read is cheap (no D1 query — pure date math, unlike `reminder_rules`' mileage
lookup) and never wrong. `isExpired` (boolean) is kept as-is for backward compatibility with the
already-shipped client — `reminderStatus === "overdue"` and `isExpired` are always equal by
construction, but nothing currently reads `isExpired` in a way this changes.

**Alternatives considered**:
- *Drop `isExpired`, replace with `reminderStatus`*: Rejected — unnecessary breaking change to an
  already-shipped, already-tested field for zero functional gain; additive is cheaper than
  migrating every existing consumer.

## Decision: New columns on `documents`, not a separate `document_reminder_state` table

**Decision**: `cached_status`, `last_evaluated_at`, `last_notified_severity` are added directly to
`documents` via `ALTER TABLE`, exactly as `reminder_rules` itself grew these columns across
migrations 0010/0011 — not a new joined table.

**Rationale**: `reminder_rules` already establishes this exact precedent for this exact kind of
bookkeeping data, on a table with the same 1:1 "one row is one thing that might need a reminder"
shape `documents` has. A separate table would need its own tenant/document foreign keys and
erasure decision for zero relational benefit (it's always a 1:1 join back to the row it
annotates).

**Alternatives considered**:
- *Separate `document_reminder_state` table*: Rejected — no data model justifies the extra join;
  `reminder_rules`' own precedent already settled this question for this codebase.

## Decision: One `scheduled` handler, two sequential sweep calls

**Decision**: `index.ts`'s existing `scheduled` handler calls `evaluateAllDocumentReminders(env)`
right after `evaluateAllReminders(env)`, in the same handler invocation — no second Cron Trigger
declared in `wrangler.toml`.

**Rationale**: Spec.md's own Assumptions section settles this ("one evaluation sweep, shared
schedule") — there's no product reason for document-expiry detection to run on a different cadence
than maintenance-reminder detection, and Cloudflare Workers' `scheduled` handler can trivially
call multiple independent sweep functions in sequence without needing multiple `[triggers]` cron
entries.

**Alternatives considered**:
- *Fold document evaluation into `evaluateAllReminders` itself (one combined loop over a UNION
  query)*: Rejected — `reminder_rules` and `documents` have different columns, different status
  logic, and different escalation math; a combined loop would need type-branching inside a single
  function body for no benefit over two small, independently testable sibling functions called
  from the same handler.
