# Phase 0 Research: Header Currency and Units Toggles

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Exact conversion constants, `km * 0.621371 = mi` / `mi * 1.609344 = km`

**Decision**: `convertDistance(value, from, to)` uses the standard, universally-agreed constants
(1 km = 0.621371 mi; 1 mi = 1.609344 km) — a no-op when `from === to`.

**Rationale**: Unlike currency (which has no fixed, universal exchange rate — the reason spec 035
deliberately never converts currency values, only the symbol), distance units have one single,
unchanging, exact relationship. Applying it is not "interpolating data" (constitution Principle IV)
the way a currency exchange rate or a guessed reference date would be — it's the same number,
expressed in a different, exactly-equivalent unit.

## Decision: Fuel economy and cost-per-distance are explicitly NOT converted in this pass

**Decision**: Every fuel-economy (L/100km vs MPG) and cost-per-distance figure in the app continues
to reflect each vehicle's own native unit, unaffected by the new units toggle.

**Rationale**: L/100km and MPG are not linearly related — MPG = 235.214583 / (L/100km), a reciprocal
relationship combining both a distance and a volume unit change at once. Getting this formula wrong
would be a silent, hard-to-notice correctness bug (unlike a broken UI, a subtly-wrong efficiency
number could mislead an owner's real maintenance/fuel decisions). Converting it correctly would also
require re-deriving cost-per-distance's own linear-but-different conversion at more call sites (the
Dashboard KPI, Garage's economy stat). Given this feature is already substantial, deferring this
half — as an explicit, spec'd-out boundary (FR-006), not a silently-missed case — is the safer
choice; it can be its own follow-up if wanted.

## Decision: Form inputs are never converted — they always reflect the vehicle's own native unit

**Decision**: Every distance-related input field (fuel/service odometer entry, reminder
intervalDistance/lastDoneOdometer) keeps showing and accepting values in the vehicle's own stored
`odometerUnit`, labeled accordingly, regardless of the header's units toggle.

**Rationale**: Converting an input field's label without also converting what gets submitted (or
vice versa) is a real data-corruption risk — an owner could type a number believing it's in one unit
while the app stores it as the other. The safest, simplest rule that fully avoids this: inputs are
never touched by this feature at all. Read-only display sites carry zero such risk, since nothing is
written back.

## Decision: `useDistanceUnit()` mirrors `useCurrency()`'s exact shape

**Decision**: `src/client/distance.ts` follows `currency.ts`'s structure verbatim — a
`localStorage`-backed `useState`, a `readStoredDistanceUnit()` validator defaulting to `"km"`, and a
`[unit, setUnit]` tuple return, called once in `App.tsx` and threaded down as props (no Context API,
per this codebase's established convention, spec 035 research.md).

**Rationale**: Consistency with the only other existing global-display-preference hook in this
codebase; a reviewer already familiar with `useCurrency()` can read `useDistanceUnit()` for free.

## Decision: Currency pill duplicates Settings' control, both backed by the same `useCurrency()` call

**Decision**: The header's currency pill and Settings' existing `<select>` both read/write the
exact same `currency`/`setCurrency` App.tsx already holds — no second, independent piece of state.

**Rationale**: Spec.md User Story 1's Acceptance Scenario 2 requires the two to never drift out of
sync; sharing the single existing hook instance guarantees this by construction rather than needing
any synchronization logic.
