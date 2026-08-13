# Phase 0 Research: Reminders Screen Info Panel

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: "Recently completed" is a plain sort/cap, not a time-windowed filter

**Decision**: `recentlyCompleted(rules)` filters to rules with a non-null `lastDoneDate`, sorts
descending by that date, and caps at 3 — no "within the last N days" threshold requiring a fresh
"now" comparison.

**Rationale**: Mirrors `DashboardView.tsx`'s already-accepted `upcomingReminders()` pattern exactly
(filter + sort + slice over fields the server already provided) — not a new derived aggregate, so
no Principle II question arises. A time-windowed variant would need a client-side date subtraction
against "now," which is exactly the kind of thing this session's prior features (specs 040/041/043)
established belongs server-side if it's genuinely a computed figure; sidestepping that need entirely
by using pure sorting is simpler and avoids the question altogether.

## Decision: Legend reuses the existing `STATUS_STYLE` colors, not a new 4th color

**Decision**: The legend has exactly 3 entries (overdue/coming-up/on-track), colored from the same
`STATUS_STYLE` map the reminder rows already use — no separate "document" color, unlike the
mockup's 4-item legend (which included a docs-specific `--acc2` entry).

**Rationale**: This app's `ReminderStatus` enum has no distinct "document" kind — a reminder is
either date-based, distance-based, or both, and always resolves to one of `on_track`/`coming_up`/
`overdue`/`not_enough_data`. Inventing a 4th legend color for a status this app doesn't have would
mislead rather than explain.

## Decision: Explainer text describes this app's actual logic, no OBD wording

**Decision**: The explainer paragraph says a reminder is due by whichever trigger (elapsed time or
distance driven) comes first — no mention of automatic odometer tracking via any hardware adapter.

**Rationale**: The mockup's own explainer text assumes an OBD integration this app deliberately does
not have (Tier 3, explicitly deferred per the earlier design-gap audit) — copying that wording
verbatim would describe a capability that doesn't exist, misleading the owner about how the app
actually determines mileage (from logged fuel/service records, not live hardware).
