# Phase 0 Research: History-Based Service Due Estimate

No unresolved `NEEDS CLARIFICATION` markers remain in Technical Context — this codebase's stack,
testing approach, and file layout are already fixed project-wide (see the Constitution and the 52
prior specs). This document instead records the design decisions specific to this feature.

## Decision: Expose the estimate as a pure `GET`, mirroring `/fuel-preview` (specs/040)

**Rationale**: Constitution Principle II forbids computing aggregates client-side. Specs/040
already established the exact shape for "a computed, ephemeral, non-persisted number shown in a
form": a `GET` route that resolves and ownership-checks the vehicle, computes in a repository
function, and returns a small JSON payload the client renders as-is. Reusing that shape means no
new pattern for a reviewer to learn, and no new division-safety/ownership-check code to get wrong.

**Alternatives considered**:
- Compute in the client from data it already has (e.g. the vehicle's already-fetched service
  records) — rejected outright, violates Principle II.
- Embed the estimate as an extra field on an existing endpoint (e.g. the vehicle or service-records
  list response) — rejected: those endpoints aren't scoped to "the currently-open create form" and
  would compute the estimate on every list fetch even when the form isn't open, for no benefit.

## Decision: Group by exact, normalized description match; require ≥2 usable records per group

**Rationale**: The data model has no separate "work type" field — `description` is the only signal
available, and it's owner-authored free text. Exact match (trimmed, case-folded) is the smallest
thing that can work without guessing at fuzzy-matching thresholds that would need their own tuning
and testing. Requiring ≥2 records mirrors the same "not enough data → omit, don't guess" posture
Principle II already requires for economy/cost aggregates (spec FR-003).

**Alternatives considered**:
- Fuzzy/substring matching — rejected for v1: no existing precedent in this codebase for
  approximate text matching, and the false-positive risk (grouping two unrelated jobs) is worse
  than under-grouping (spec's own Assumptions section defers this).
- A fixed taxonomy of maintenance types the owner picks from — rejected: would require a schema
  change and a new UI concept (a picker) the spec's Assumptions explicitly rule out of scope; the
  service-record `description` field stays free text.

## Decision: Average of consecutive intervals within a group, not just the most recent gap

**Rationale**: Spec FR-002/Acceptance Scenario 2 — with 3+ records, the average smooths one-off
outliers (e.g. an early oil change done sooner than usual) better than anchoring on just the last
pair. This is the same kind of averaging `computeFuelPreview`'s economy calc already does across a
window of records (research precedent already in this codebase), applied to distance instead of
volume/fuel.

**Alternatives considered**: Most-recent-interval-only — simpler, but a single unusually short or
long gap would directly become the estimate; average-of-all is a small addition once the group is
already assembled, so the smoothing is nearly free.

## Decision: Suppress the estimate when a matching `reminder_rules` label already exists

**Rationale**: Spec FR-006/User Story 3 — avoids showing two different "due" numbers for the same
work. Matching on the same normalized-description comparison used for grouping keeps this a single
shared helper rather than two divergent matching implementations.

**Alternatives considered**: Show both, with a note explaining the discrepancy — rejected: adds UI
complexity to communicate a conflict the system can simply avoid creating in the first place.

## Decision: Accept action reuses the existing reminder-rule creation path + `idempotent` middleware

**Rationale**: Spec FR-008–FR-011 — an accepted estimate must become an ordinary `reminder_rules`
row indistinguishable from one the owner typed in by hand (FR-009), so it should go through
whatever function already creates those rows, not a parallel one. Idempotency-on-retry (FR-010)
has an exact precedent already wired for the same class of "advance state → also write a service
record"-shaped action: specs/049's mark-done route already applies the existing `idempotent`
middleware to get this guarantee for free.

**Alternatives considered**: A bespoke accept-tracking table to detect duplicate accepts —
rejected: the project already has a general-purpose idempotency mechanism for exactly this
failure mode; adding a second one would be unjustified complexity under the Governance section's
"complexity that isn't justified... should be simplified rather than merged."
