# Phase 0 Research: Vehicle Document Records

This feature has no `NEEDS CLARIFICATION` markers in spec.md — it's a close structural mirror of
`specs/007-service-record-crud` (already shipped and battle-tested) with one new computed field
(`isExpired`). Research here is limited to the few decisions that aren't simply "do exactly what
specs/007 did."

## Decision: Generalize `attachmentKey()` instead of adding a parallel key builder

**Decision**: Change `attachmentKey(tenantId, resourceType, resourceId, attachmentId)` — add a
`resourceType` parameter (`"service-records"` | `"fuel-records"` | `"documents"`) — rather than
adding a second, document-specific key function.

**Rationale**: Reading `src/server/attachments/storage.ts`, the existing `attachmentKey()`
hardcodes the path segment `service-records` and is already called by both
`service-records.ts` and `fuel-records.ts` — meaning fuel record attachments are currently stored
under keys literally saying `tenants/{t}/service-records/{fuelRecordId}/{attId}`. This is a
pre-existing mislabeling (harmless functionally — the key is opaque to R2 and never
parsed back apart, and the tenant-id segment still does its defense-in-depth job per the function's
own doc comment — but confusing to read and would only get worse with a third resource type
copy-pasting the same wrong label). Since this feature already has to touch `storage.ts` and both
existing call sites to add a `"documents"` case, fixing the parameter to be explicit is strictly
cheaper than leaving the wrong label in place and adding a *second*, differently-shaped key
function next to it. Both existing call sites (`service-records.ts:151`-equivalent,
`fuel-records.ts:151`) get a one-line update to pass their real resource type explicitly.

**Alternatives considered**:
- *Add `documentAttachmentKey()` as a separate function*: Rejected — perpetuates the existing
  mislabeling for fuel records and produces two near-identical key builders that will drift.
- *Leave the fuel-record mislabeling alone, only fix it going forward for documents*: Rejected —
  the fix is a 4-line diff across 3 files; leaving a known, freshly-noticed inconsistency in place
  when touching the exact same function has no upside.

**Migration note**: No data migration needed — existing fuel record attachment keys already in R2
keep working as opaque strings; only new writes after this change use the corrected segment.
Confirmed via `storage.ts`'s own doc comment that the tenant/resource segments are never parsed
back out of a stored key, only carried end-to-end from write to read.

## Decision: `isExpired` computed at read time, not stored

**Decision**: `isExpired` (FR-007) is computed in the repository layer at query time
(`expiryDate !== null && expiryDate <= today`), not persisted as a column.

**Rationale**: Storing it would require either a write on every day-boundary crossing (no such
background job exists or is warranted for this) or accepting a stale flag — both worse than a
cheap per-row comparison done at read time, identical in spirit to how `fuelEconomy` (specs/013)
is computed at read time rather than stored. "Today" is evaluated in UTC as a date-only string
(`new Date().toISOString().slice(0, 10)`, i.e. `YYYY-MM-DD`) at request time, so it compares
correctly against `expiry_date`'s own date-only string format — comparing a full ISO timestamp
against a date-only value would misclassify a document expiring "today" depending on time of day.
This mirrors how the rest of the server already handles date comparisons (reminder evaluation,
specs/011).

**Alternatives considered**:
- *Store `is_expired` as a column, updated via a scheduled job*: Rejected — introduces staleness
  and a new cron responsibility for a value trivially computed on read.

## Decision: No semantic duplicate detection for documents

**Decision**: Documents do not get the duplicate-flagging machinery (constitution D-005) that
service/fuel records have.

**Rationale**: D-005 exists for records of real-world *events* (a fuel-up, a service visit) that
can legitimately arrive twice under different client UUIDs from offline-queue retries or duplicate
manual entry. A document is not an event — it's a reference to a piece of paperwork; two documents
with the same title/category aren't a "duplicate event," they're either an intentional re-record
(e.g. two insurance policies from different years) or a user's own data-entry redundancy the
system has no principled way to distinguish from intent. spec.md's Key Entities section doesn't
describe documents as event-like, and issue #73's own scope text never mentions duplicate
detection.

**Alternatives considered**:
- *Reuse the duplicate-detection SQL pattern anyway "for consistency"*: Rejected — would flag
  legitimate re-records (e.g. renewing the same insurance category and title style) as duplicates
  with no clear resolution UI benefit, and isn't requested by spec.md.

## Decision: Reuse the existing `ATTACHMENTS` R2 bucket, no new binding

**Decision**: Document attachments are stored in the same `ATTACHMENTS` R2 bucket service/fuel
record attachments already use, distinguished only by key prefix.

**Rationale**: The bucket is already private, already provisioned (specs/007's one-time,
owner-performed provisioning step), and R2 has no per-object-type access-control feature that
would benefit from bucket separation — the ownership check happens in the Worker route layer
before any R2 call, not at the bucket boundary. A second bucket would be pure operational overhead
(a second binding to provision in every environment) for no isolation benefit.

**Alternatives considered**:
- *New `DOCUMENT_ATTACHMENTS` bucket*: Rejected — no isolation benefit, adds a provisioning step
  identical in kind to one already done for `ATTACHMENTS`.
