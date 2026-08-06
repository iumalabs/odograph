# UI Contract: Dashboard UI

No new HTTP API — this feature is a pure client consumer of three already-shipped, already-
documented routes (`GET /vehicles`, `GET /vehicles/:id/aggregates` [contracts/api.md, spec 013],
`GET /vehicles/:id/reminder-rules` [contracts/api.md, spec 011]). This document instead specifies
the client-side contract: the states each new component must render.

## `AppShell` nav rail

Two entries, both clickable, mutually exclusive active state: **Garage** (existing) and
**Dashboard** (new). Selecting either calls back into `App.tsx` to switch `view`. Exactly one entry
is visually marked active at a time, matching the highlighted-entry treatment the mockup already
established for the single existing entry.

## `DashboardView`

**Inputs**: the signed-in owner's vehicle list (already held by `App.tsx`).

**States**:

1. **Zero vehicles**: an explicit empty state (FR-007) — same visual treatment as `Garage`'s own
   zero-vehicles empty state (icon + message), not a blank area.
2. **One or more vehicles, still loading their aggregates/reminder data**: acceptable to render
   vehicle cards with their identity known and figures in a loading/pending state briefly; this
   feature does not require a distinct full-screen loading spinner.
3. **One or more vehicles, data loaded**: one summary card per vehicle (see below).

## Vehicle summary card

**Always shows**: vehicle name/identity (mirrors `Garage`'s own identity line: name + make/model/
year + odometer unit chip).

**Cost figures** (`costPerDistance`, `costPerTime`, `averageFuelEconomy`), each independently one
of:

- A formatted number, when non-`null`.
- The existing "not enough data" treatment (`fuelEconomyNotEnoughData`'s established look, per
  research.md), when `null` — never blank space, never `0`, never an error string.

**Needs-attention indicator**, one of:

- A visually distinct "needs attention" state when `needsAttention` is `true` (research.md) — at
  minimum communicates that at least one reminder is due soon or overdue; a count and/or the most
  urgent reminder's label is an acceptable additional detail, not a requirement.
- An explicit "all good" state when `needsAttention` is `false` — never an empty gap where the
  indicator would otherwise be, so an owner can't mistake "nothing rendered yet" for "nothing to
  worry about."

**Interaction**: selecting the card anywhere outside its own interactive sub-elements (there are
none in this feature — no per-card actions beyond navigation) sets `App.tsx`'s `view` to `"garage"`
and `selectedVehicleId` to that vehicle's id, landing on the existing detail flow unchanged
(FR-005).

## Cross-cutting

- Every string this feature introduces routes through `src/client/i18n/strings.ts` (FR-008) — no
  literal user-facing text at any call site.
- Every card only ever reflects the signed-in owner's own vehicles — inherited for free from the
  existing session-scoped `listVehicles`/aggregates/reminder-rules routes (FR-006); this feature
  introduces no new authorization surface to verify.
