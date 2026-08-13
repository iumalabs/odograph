# Phase 0 Research: Header Vehicle Switcher

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Quick-fuel button reuses `onSelectView`, no new prop

**Decision**: The header's quick-fuel button calls `onSelectView("fuel")` — the exact same prop
`AppShell` already receives and uses for its nav rail buttons — rather than a new dedicated
`onQuickAddFuel` prop.

**Rationale**: `AppShell` already has everything needed to navigate to any view; adding a
purpose-specific callback for a navigation that's identical to clicking the nav rail's own Fuel icon
would be a redundant prop for the exact same operation.

## Decision: Pill selection uses a plain setter, distinct from Garage/SearchBar's select-and-navigate

**Decision**: `App.tsx` passes `onSelectVehicle={setSelectedVehicleId}` (a direct, non-navigating
state setter) to every `<AppShell>` call, which is a different function reference than the
`(id) => { setSelectedVehicleId(id); setView("dashboard"); }` handler `<Garage>` and `<SearchBar>`
use (spec 038).

**Rationale**: Spec.md's central Assumption — pill selection must never navigate, or this feature
collapses into a duplicate of #126's Garage-click behavior. Using a genuinely different function
(not a conditional inside one shared handler) makes the two behaviors impossible to accidentally
conflate later.

## Decision: Pill label is the vehicle's real `name`, ellipsis-truncated via CSS if long

**Decision**: No new "short name"/abbreviation field, no client-side string-shortening logic beyond
CSS `text-overflow: ellipsis` on a width-constrained pill.

**Rationale**: Spec.md's Assumptions section already resolved this — the source design's pill labels
(e.g. "LC200") are hand-authored per fixture vehicle in the mockup's own sample data, not backed by
any real field on this project's `Vehicle` entity. Introducing a new stored abbreviation field is
unnecessary complexity this feature doesn't need; a `Vehicle` already has `name`, which is exactly
what every other place in this app already displays.
