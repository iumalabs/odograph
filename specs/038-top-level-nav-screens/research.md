# Phase 0 Research: Top-Level Nav Screens

No `[NEEDS CLARIFICATION]` markers were left in the spec. This phase confirms implementation-level
decisions already implied by the codebase's existing conventions and the source design's own icon
sheet.

## Decision: New icons ported verbatim from the mockup, matching existing convention

**Decision**: Add `PlannerIcon` (three variable-height bars) and `DocumentIcon` (a folded-corner
page) to `src/client/design/icons.tsx`, using the exact SVG path data from `docs/odograph-design.zip`
("Кокпит - прототип" nav markup, `task`/`doc` icons), adapted to this file's existing `commonProps`
convention (stroke width 1.75, `currentColor`, no fills) — the same treatment already applied to
every other icon in this file.

**Rationale**: `icons.tsx`'s own top comment states every icon is "ported verbatim from... the
mockup" — `ServiceIcon`/`FuelIcon`/`GarageIcon`/`DashboardIcon` already follow this; the two new
icons should too, for visual consistency with the rest of the nav rail. `ReminderRulePanel`'s nav
entry reuses the already-existing `BellIcon` (hand-rolled previously, not in the mockup's icon sheet,
per that icon's own comment) — no new icon needed there.

## Decision: Garage's `onSelectVehicle` handler changes from a toggle to select-and-navigate

**Decision**: `Garage.tsx`'s card `onClick` currently calls `onSelectVehicle(id)`, and `App.tsx`
implements that prop as a toggle (`selectedVehicleId === id ? null : id`) plus staying on the Garage
view. After this feature, `App.tsx`'s implementation changes to: set `selectedVehicleId` to `id`
(no toggle — selecting an already-selected vehicle again is a no-op, not a deselect, since there's no
inline content left on Garage for a toggle to collapse) and call `setView("dashboard")`.
`Garage.tsx`'s own prop signature (`onSelectVehicle: (id: string) => void`) does not need to change —
only what `App.tsx` does when it's called.

**Rationale**: Matches the source design's own behavior exactly (`act: () => this.setState({ vid:
id, screen: 'dash' })`). Once Garage no longer shows any inline content when a vehicle is selected,
a toggle has nothing left to collapse — the deselect half of the old behavior becomes meaningless,
while select-and-navigate gives the click a clear, immediately visible result again.

**Same fix applies to `SearchBar`'s `onSelectVehicle`** (`App.tsx`, currently just
`setSelectedVehicleId(id)` with no navigation): left unchanged, choosing a vehicle from search would
leave the owner looking at a Garage screen with no visible effect, once Garage no longer shows inline
content — inconsistent with the Garage-card behavior above. Both entry points get the same
select-and-navigate-to-Dashboard treatment for internal consistency; this isn't new scope, it's the
same decision applied to the only other "select a vehicle" entry point that exists today.

## Decision: `selectedVehicleId` can become permanently "stuck" selected — same as today

**Decision**: No change to how/when `selectedVehicleId` is cleared. It already only ever changes via
explicit selection (Garage card click, search result click) — this feature doesn't add or remove any
clearing behavior.

**Rationale**: Out of scope per spec.md's Assumptions (only the five named screens and the Garage/
Dashboard restructuring are in scope) — confirmed by re-reading `App.tsx`'s existing state
management, which has no "clear selection" affordance today either; not a regression introduced by
this feature.
