# Phase 0 Research: Units Toggle Converts Fuel Economy

## Decision: convert-then-recompute, never reciprocally rescale

**Decision**: A new `computeFuelEconomyForDisplay(nativeUnit, displayUnit, deltaDistance, volume)`
converts `deltaDistance` and `volume` into the target unit system first, then calls the existing
`computeFuelEconomy(displayUnit, convertedDistance, convertedVolume)` unchanged.

**Rationale**: `computeVehicleAggregates`'s `averageFuelEconomy` is the mean of each fuel record's
already-computed per-record economy (`economies.reduce(...) / economies.length`), not a fresh
recompute from lifetime totals. Reciprocally rescaling that final native-unit average (e.g.
`avg_L_per_100km * 235.21 / avg_L_per_100km²`-style algebra) would NOT equal the average of the
individually-converted per-record economies, by the AM-HM/Jensen's inequality (mean of ratios ≠
ratio derived from the mean). The only mathematically correct approach converts each record's raw
inputs to the target unit system *before* computing that record's economy, then averages those.
Converting inputs and reusing the existing formula also means the existing `deltaDistance <= 0`
not-enough-data guard (constitution Principle II/IV) is inherited for free — no new edge case to
re-guard.

**Alternatives considered**:

- *Reciprocally rescale the final computed number* (e.g. `1 / (economy_L_per_100km / 100) * 2.352`
  for MPG). Rejected: mathematically wrong for any aggregate that's a mean of ratios
  (`averageFuelEconomy`), and even for a single record it papers over the fact that L/100km and MPG
  aren't reciprocals of each other without also converting the distance/volume units — it would
  work by coincidence for a single record only if the constants were composed correctly, which is
  exactly what `computeFuelEconomyForDisplay` already gets right by definition, so there's no
  reason to hand-derive a second formula that could get that composition wrong.
- *Client-side conversion of the already-fetched native economy figures*. Rejected outright:
  violates constitution Principle II (division-safe aggregates must be server-computed) — the
  server already owns this exact computation for the native-unit case; this feature only makes it
  display-unit-aware.

## Decision: server-side `convertDistance`/`convertVolume` duplicate `src/client/distance.ts`'s constants, not shared

**Decision**: Add small private `convertDistance`/`convertVolume` helpers directly in
`src/server/db/repository.ts`, using the exact same constants as `src/client/distance.ts`
(`KM_TO_MI = 0.621371`, `MI_TO_KM = 1.609344`) plus a new `L_TO_GAL = 0.264172` for volume — the
literal constant the mockup's own `vol()`/`cons()` reference implementation uses (confirmed via
`design-remote-kokpit.html` lines 396–399: `l * 0.264172` forward, `l / 0.264172` reverse — a
single constant used both ways, not two independently-rounded constants, avoiding a rounding
mismatch between forward and reverse conversion).

**Rationale**: This project has no shared code layer between `src/client/` and `src/server/` —
confirmed precedent from spec 040's own research.md, which duplicated a similar small pure
constant rather than introducing a shared module for one function's sake. The Cloudflare
Workers/Vite build for the client and the Workers runtime for the server are separate deployment
surfaces; introducing a shared import path is a bigger structural change than this issue calls for.

**Alternatives considered**:

- *Shared `src/shared/units.ts` module*. Rejected: no existing precedent in this codebase (every
  prior spec that needed the same small constant on both sides duplicated it), and it would be the
  first cross-surface import — out of proportion for two multiply/divide helpers.

## Decision: `computeFuelPreview`'s draft-form inputs are already native-unit; only the output needs conversion

**Decision**: `computeFuelPreview`'s `odometerReading`/`volume` parameters come from the
create-fuel-record form's raw field values, which spec 047's FR-004 already established are never
unit-toggled (forms always collect native-unit input). So `computeFuelPreview` computes its
`deltaDistance` in native units exactly as it does today, then passes that through
`computeFuelEconomyForDisplay(nativeUnit, displayUnit, deltaDistance, volume)` instead of calling
`computeFuelEconomy` directly — no client-side or route-level change to how the preview's *inputs*
are collected, only how its *output* is expressed.

**Rationale**: Keeps the change minimal and consistent with the already-shipped form behavior;
avoids inventing a second "which unit is this input in" question that spec 047 already answered.

## Decision: optional `?unit=km|mi` query parameter, default = vehicle's own native unit

**Decision**: All three routes (`GET /:vehicleId/fuel-records`, `GET /:vehicleId/aggregates`,
`GET /:vehicleId/fuel-preview`) accept an optional `unit` query parameter with values `"km"` or
`"mi"`; omitting it (or an unrecognized value) falls back to the vehicle's own `odometerUnit`,
preserving today's exact response shape and values for any caller that doesn't pass it (FR-003).
An explicitly-invalid non-empty value (e.g. `?unit=foo`) is a 400, matching this codebase's existing
`expense-breakdown` `groupBy` validation pattern (`EXPENSE_GROUP_BY_VALUES`).

**Rationale**: Matches the existing `groupBy` query-param convention in the same file
(`vehicles.ts`), keeps every existing caller (including offline/cache code that doesn't know about
this feature) working unchanged, and keeps the contract additive rather than breaking.
