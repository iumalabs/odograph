# Phase 0 Research: Semantic Duplicate Detection & Resolution

## Data shape: a self-referencing column vs. a separate "duplicates" table

**Decision**: One nullable, self-referencing FK column per record table:
`duplicate_of_id TEXT REFERENCES fuel_records(id) ON DELETE SET NULL` (and the equivalent on
`service_records`). No new table.

**Rationale**: A duplicate flag is a 1:1 attribute of the newer record ("this looks like a
duplicate of that one"), not a many-to-many relationship or something needing its own lifecycle —
a single nullable column captures exactly "flagged and pointing at X" vs. "not flagged" (`NULL`)
with no additional joins for the common case (reading a record's own flag state). Critically,
`ON DELETE SET NULL` means FR-007 ("deleting either record in a flagged pair clears the flag")
falls directly out of the database constraint for the "delete the original" case — no application
code has to notice and clean up a dangling reference, the same discipline this project already
applies to every other foreign key (`ON DELETE CASCADE` for ownership chains).

**Alternatives considered**:
- **A separate `duplicate_flags` table** (`id`, `record_type`, `record_id`, `duplicate_of_id`,
  `dismissed_at`): rejected — adds a join for the single most common read (does this record have a
  flag?), and a polymorphic `record_type` column to distinguish fuel vs. service is exactly the
  kind of premature generalization spec 007/009 already chose against (e.g. `Attachment` vs.
  `FuelAttachment` staying separate types rather than one polymorphic attachment table).
- **A `dismissed_at` timestamp alongside the FK** (to remember "this was flagged, then
  dismissed" for audit purposes): rejected — no requirement asks for that history; FR-006 only
  requires the record to behave normally after dismissal, which "set the column back to `NULL`"
  already satisfies exactly, with no extra state to keep in sync.

## Detection timing: at creation vs. on every read/edit

**Decision**: Run the match query once, synchronously, inside `createFuelRecord`/
`createServiceRecord`, before the `INSERT`, and store the result as part of that same insert.

**Rationale**: D-005's own language — "when the same real-world event **arrives**" — describes a
point-in-time event, not an ongoing invariant to maintain. Re-scanning a vehicle's full record
history on every unrelated `PATCH` (per spec.md's Edge Cases) would be unnecessary work for no
requirement that asks for it, and would raise a real design question this feature deliberately
avoids: what happens if an edit makes two *already-existing, already-resolved* records look alike
again? Scoping detection to creation-time sidesteps that entirely.

**Alternatives considered**: a background/scheduled duplicate scan — rejected outright; the
constitution restricts scheduled work to Cron Triggers and explicitly forbids Cloudflare Queues,
and there's no batch-processing need here anyway since detection is cheap enough to do inline at
write time.

## Matching heuristic: exact rules, not fuzzy scoring

**Decision**:
- **Fuel records**: same `vehicle_id`, same tenant, existing record has `duplicate_of_id IS NULL`
  (only compare against unflagged/original records — spec.md Edge Cases, avoiding chains), same
  `fuel_date` (exact string match), and `ABS(new.odometer_reading - existing.odometer_reading) <=
  5`. Among multiple matches, the smallest odometer delta wins ("closest match," FR-001).
- **Service records**: same `vehicle_id`, same tenant, unflagged existing record, same
  `service_date` (exact), same `description` (case-insensitive exact match, via `LOWER()`
  comparison in SQL).

**Rationale**: Both rules are cheap, deterministic, and explainable to the owner ("same day,
almost the same odometer reading" / "same day, same description") — the feature is explicitly a
*soft* flag (spec.md: "the feature is explicitly designed around soft-flagging exactly because
false positives are expected and cheap to dismiss"), so a simple, slightly-imprecise rule that an
owner can dismiss in one click is preferable to a more "accurate" fuzzy-matching system that's
harder to reason about and harder to explain when it's wrong. The `5`-unit odometer tolerance is a
deliberately round, conservative number — small enough that a genuinely different fill-up 20+ km
later is never flagged, large enough to catch a re-entry with a minor typo or slightly different
trip-computer rounding.

**Alternatives considered**:
- **Fuzzy/similarity matching on service `description`** (e.g. Levenshtein distance, substring
  matching): rejected — meaningfully more complex to implement and to explain to a user when it
  fires unexpectedly, with no existing text-similarity infrastructure in the project to build on;
  an exact case-insensitive match already catches the overwhelmingly common case (re-submitting
  the same form, or re-typing the same description a few minutes later).
- **Tolerance as a percentage of odometer reading** rather than a flat value: rejected as
  needless complexity for a v1 heuristic — a flat tolerance is simpler to state, test, and reason
  about, and the odometer-reading scale doesn't vary enough within one vehicle's history to make a
  percentage meaningfully more accurate.
- **Also comparing cost/volume closeness for fuel records**: rejected — date + odometer proximity
  is already a strong signal for "this is the same event"; adding more conditions only makes the
  detector *less* sensitive (stricter matching = more false negatives), and the feature's design
  already treats false positives as cheap, so there's no strong reason to narrow the net further.

## Fuel-economy exclusion: skip transparently vs. break the chain

**Decision**: In `listFuelRecordsWithEconomy`'s odometer-ordered walk, a flagged record
(`duplicateOfId != null`) is given `fuelEconomy: null` and is **not** used to update the
`previous` pointer that the next unflagged record's calculation reads from — the walk treats it as
if it weren't there for the purposes of finding "the previous fill-up," while still returning it
in the result list (still visible in the UI, per FR-004/D-005).

**Rationale**: This is the direct mechanical meaning of "excluded from aggregates" (D-005) applied
to the one computed figure that exists — without this, a flagged record sitting between two real
fill-ups would either (a) be used as the "previous" reference for the record after it, producing a
tiny, meaningless economy figure from a near-zero odometer delta, or (b) if naively skipped by
*removing* it from the sequence, the record after it would end up comparing against the flagged
record's odometer reading anyway if not handled carefully — the "skip for pointer purposes, keep
in the output" design avoids both failure modes with a small, explicit change to the existing loop
(spec 009's `repository.ts`).

**Alternatives considered**: excluding flagged records from the returned list entirely — rejected,
directly contradicts FR-004/D-005 ("store both records... never silently... drop") and User Story
2's own acceptance scenario, which requires the flagged record to still be viewable, just without
a computed figure.

## Resolution actions: dismiss + existing delete, no new "merge"

**Decision**: Two dismiss endpoints (`POST /api/v1/fuel-records/:id/dismiss-duplicate`,
`POST /api/v1/service-records/:id/dismiss-duplicate`) that clear `duplicate_of_id` on the caller's
own record; deletion of either record in a pair already exists (spec 007/009) and needs no new
code beyond the `ON DELETE SET NULL` constraint already covering the "clears the flag" behavior.

**Rationale**: Matches spec.md's Assumptions exactly — D-005 forbids auto-merge, and a manual
merge UI (deciding which of two records' station name, notes, etc. "wins") is real, unscoped
complexity the issue doesn't ask for. Reusing the existing delete endpoint for "this genuinely was
a duplicate, remove the redundant one" means this feature adds exactly one new route shape
(dismiss), not two.

**Alternatives considered**: a single combined "resolve" endpoint accepting an action parameter
(`{ action: "dismiss" | "delete" }`) — rejected as an unnecessary indirection layer over two
already-distinct, already-existing HTTP verbs/routes (`POST .../dismiss-duplicate` and the
existing `DELETE /api/v1/fuel-records/:id`); a client picking between "dismiss" and "delete" is
already choosing between two different existing client functions, not one endpoint with a mode
flag.
