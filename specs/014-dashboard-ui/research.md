# Phase 0 Research: Dashboard UI

No `NEEDS CLARIFICATION` markers remain in the Technical Context. The decisions below expand the
spec.md Assumptions with the alternatives considered.

## Fetching aggregates + reminder status for every vehicle: per-vehicle fetches, no new batch route

**Decision**: `DashboardView` fetches the owner's vehicle list (already available), then issues one
`GET /vehicles/:id/aggregates` and one `GET /vehicles/:id/reminder-rules` per vehicle, in parallel
(`Promise.all`).

**Rationale**: Both routes already exist and are already fetched per-vehicle elsewhere in the app
(the Garage detail flow does the same for the selected vehicle); reusing them as-is keeps this
feature entirely client-side, with zero new server code, matching spec.md's "no new data or
computation" scope boundary. At the explicitly-assumed no-pagination scale (an individual or small
fleet's worth of vehicles), N parallel per-vehicle fetches is simpler and has no meaningfully worse
latency than a hypothetical combined endpoint would.

**Alternatives considered**:

- **A new batch endpoint** (e.g. `GET /vehicles/aggregates` returning every owned vehicle's
  aggregates + reminder summary in one response): rejected — spec.md is explicit that this feature
  ships no new server code; a batch endpoint is a reasonable future optimization if vehicle counts
  ever grow large enough to matter, not a day-one requirement.
- **Sequential (non-parallel) fetches**: rejected — no reason to serialize independent per-vehicle
  requests; `Promise.all` costs nothing extra to write.

## Needs-attention flag: derived client-side from the existing status field

**Decision**: A vehicle "needs attention" if any of its reminder rules has `status === "coming_up"`
or `status === "overdue"` — computed by a plain filter over the already-fetched `ReminderRule[]`
(spec 011's `status` field), not a new server computation.

**Rationale**: `status` is already computed server-side per reminder rule (spec 011,
`computeReminderStatus`) and is exactly the four-state value Principle II already governs; filtering
an already-fetched array by two of those four string values client-side is not itself an "aggregate
computation" in the constitution's sense — it's the same class of client-side presentation logic the
app already does elsewhere (e.g. `FuelRecordPanel` choosing a color based on
`fuelEconomy !== null`).

**Alternatives considered**:

- **A server-side "needs attention" summary added to spec 013's aggregates endpoint**: rejected —
  would blur that endpoint's scope (aggregates, not reminder status) and require touching already-
  shipped, already-tested server code for a computation trivial enough to do client-side from data
  already being fetched anyway.

## View switching: local component state, not a router

**Decision**: `App.tsx` gains a single `view: "garage" | "dashboard"` state value. `AppShell`'s nav
rail renders both entries as buttons that call back into `App.tsx` to set `view`; selecting a
Dashboard vehicle card sets `view = "garage"` and `selectedVehicleId` together in one call.

**Rationale**: This app has no URL-based routing today (a single `App.tsx` component tree, no
`react-router` or similar dependency) — introducing one for a two-screen switch would be new tooling
this feature doesn't need (constitution Principle X: no new dependency without cause). Plain state
mirrors exactly how `selectedVehicleId` already drives which panels render within the Garage screen.

**Alternatives considered**:

- **Add a routing library**: rejected — disproportionate for two screens with no deep-linking
  requirement in this feature's scope (spec.md doesn't ask for a shareable Dashboard URL); can be
  revisited if a future feature genuinely needs URL-addressable screens.
- **URL query parameter (`?view=dashboard`) without a full router**: rejected as unnecessary
  complexity for the same reason — no deep-linking requirement exists yet, and it would still need
  the same state-reading logic this decision already provides.

## Reusing existing "not enough data" / empty-state conventions

**Decision**: Aggregate figures reuse the exact `fuelEconomyNotEnoughData` string/treatment
`FuelRecordPanel` already established for a `null` value (spec 009); the zero-reminders-needing-
attention state and the zero-vehicles empty state each get their own new i18n key, following
`noVehiclesYet`/`noReminderRulesYet`'s existing naming convention.

**Rationale**: Consistency — an owner who already knows "—" means "not enough data" on the fuel
screen shouldn't have to learn a second convention for the same concept on the Dashboard.

**Alternatives considered**: none — this is a direct extension of an existing, already-reviewed
pattern, not a new design decision.
