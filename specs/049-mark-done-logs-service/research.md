# Phase 0 Research: Mark-Done Logs a Service Record

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Mirror `updatePlanCard`'s done-transition side effect exactly

**Decision**: `markReminderRuleDone` calls `createServiceRecord` the same way `updatePlanCard` does
when a plan card moves to "done" — same `getVehicleCurrentOdometer` lookup, same `todayDateOnly()`
date, same `null` treatment for unknown fields.

**Rationale**: This exact pattern is already shipped, already tested, and already reviewed —
reusing it verbatim minimizes risk and keeps the codebase's two "an action implicitly logs a
service record" behaviors consistent with each other rather than subtly diverging.

## Decision: `cost` is always `null`, unlike the Planner's `estimatedCost` reuse

**Decision**: Unlike `updatePlanCard` (which has a real, owner-provided `estimatedCost` to carry
over), the auto-created record from a reminder mark-done always sets `cost: null` — there is no
analogous known-cost field on a reminder rule.

**Rationale**: Reminders (`intervalDays`/`intervalDistance`/`lastDoneDate`/`lastDoneOdometer`) never
carry a cost estimate; inventing one (even `0`) would misrepresent an unknown cost as a known
zero-cost event, exactly what constitution Principle IV forbids.

## Decision: `notes` is a fixed, single sentence — not templated per reminder

**Decision**: `notes: "Created from marking a reminder done — fill in the real details."` — a fixed
string, not interpolated with anything reminder-specific (the `description` field already carries
the reminder's own label, so the note only needs to explain provenance).

**Rationale**: Matches `updatePlanCard`'s own fixed `"Created from the maintenance planner"` note
exactly in spirit — a short, constant provenance marker, not a second place to put reminder-specific
detail that already lives in `description`.
