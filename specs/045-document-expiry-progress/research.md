# Phase 0 Research: Document Expiry Progress Bar

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Use the existing fixed coming-up window as the bar's denominator, never a per-document start date

**Decision**: `windowFraction = 1 - (remainingDays / DOCUMENT_COMING_UP_WINDOW_DAYS)`, computed only
when `reminderStatus` is `coming_up` or `overdue` (clamped to `1` once past expiry); `null` for
`on_track` or no expiry date.

**Rationale**: This is the originating issue's own explicitly flagged ambiguity — a document has no
"issued"/"valid-from" field, so a true elapsed/total percentage (matching the mockup's own `d.pct`)
can't be computed without inventing a start date, which would violate constitution Principle IV.
Reusing the already-existing, already-justified fixed 30-day window (spec 024's own research.md:
"a document has no interval or 'last done' anchor — a fixed absolute window is the only
classification that makes sense") as the denominator instead gives a real, honest, non-fabricated
progress signal: "how far through the urgency window is this document," not "what fraction of its
total validity has elapsed."

**Alternatives considered**:
- Use `createdAt` as a proxy "valid-from" date (the issue's own alternative suggestion) — rejected.
  A document's `createdAt` is when the owner uploaded/logged it in this app, not when the underlying
  document (e.g. an insurance policy) actually became valid — using it as a percentage denominator
  would silently present a wrong number as if it meant something, exactly the kind of
  plausible-looking guess Principle IV singles out as worse than an honest gap.

## Decision: Bar only appears for coming-up/overdue, matching Garage's reminder-bar precedent

**Decision**: No bar at all for `on_track` documents (far from expiry) or documents with no expiry
date — same "only show a bar when there's a real, bounded signal to show" rule specs/041 already
established for the Garage reminder progress bar.

**Rationale**: Consistency with an already-accepted pattern in this exact codebase; an "on_track"
document has no natural fixed window to measure progress against (it could be years from expiry),
so a bar there would either be meaninglessly near-empty or require yet another invented reference
point.
