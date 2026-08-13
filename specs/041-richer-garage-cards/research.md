# Phase 0 Research: Richer Garage Cards

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Expose `remainingFraction` from the existing `computeReminderStatus`, don't recompute it

**Decision**: `classifyRemainingFraction`'s caller sites in `computeReminderStatus` (byDate:
`remainingDays / rule.intervalDays`; byMileage: `remainingDistance / rule.intervalDistance`) already
compute the exact fraction needed for a progress bar — currently discarded after being classified
into `on_track`/`coming_up`/`overdue`. `ReminderStatusResult` gains one new field,
`remainingFraction: number | null`, set to whichever side's fraction ultimately determined `status`
(mirroring the exact `byDate`-vs-`byMileage` selection logic the function already has), and `null`
whenever `status` is `not_enough_data`.

**Rationale**: Zero new division, zero new division-safety rule to get right — the value already
exists and is already correctly guarded; this only changes whether it's returned. Deriving a
*second*, independent fraction client-side (or a second server computation) would risk it
disagreeing with the status the reminder actually shows, which SC-003 explicitly rules out.

**Alternatives considered**: A brand-new client-side percentage computed from `intervalDays`/
`lastDoneDate`/`intervalDistance`/`lastDoneOdometer` directly — rejected outright, this is exactly
the kind of aggregate constitution Principle II reserves for the server, and duplicating
`computeReminderStatus`'s logic client-side would drift from it over time (same reasoning as spec
040's research.md).

## Decision: The progress bar's fill is `1 - remainingFraction`, clamped for display only

**Decision**: The server returns the raw `remainingFraction` (can be negative once overdue, e.g.
-0.2 for 20% past due); the client converts this to a display fill percentage
(`clamp(1 - remainingFraction, 0, 1) * 100`) purely for the CSS bar width — an unclamped, arbitrary-
precision number isn't itself meaningful as a bar width, but this clamping is display formatting,
not aggregate computation (no division happens client-side).

**Rationale**: Keeps the server's returned value simple and consistent with its own internal
semantics (same sign convention `classifyRemainingFraction` already uses: negative means overdue),
while the "cap the visual bar at 100% full" decision is a presentation choice appropriately made at
render time, the same way `.toFixed(2)` formatting already happens client-side for other
server-computed numbers throughout this app.

## Decision: Bar color reuses the existing status-color convention, not a new gradient

**Decision**: The bar's color is chosen from the reminder's own `status` field
(`overdue` → `var(--warn)`, `coming_up` → `var(--acc)`, `on_track` → `var(--line)`/dim), matching
`ReminderRulePanel.tsx`'s existing `STATUS_STYLES` convention, not a new continuous color gradient
the mockup's `g.pctColor` might otherwise suggest.

**Rationale**: Introducing a second, gradient-based color system for one card element would be
inconsistent with how every other status indicator in this app (Garage's own reminder badge,
Dashboard's reminder list, ReminderRulePanel's own badges) already communicates status via three
fixed colors — consistency with the rest of the app outweighs a closer literal match to the mockup's
own bespoke gradient.

## Decision: Odometer + fuel economy get shared "large stat" styling, not two different treatments

**Decision**: Both figures use one shared inline style object (font size ~24-25px mono, tight
letter-spacing) mirroring the mockup's `g.odo`/`g.per100` treatment; only the economy figure gets
`color: var(--acc)`, matching the mockup's distinction between a neutral odometer reading and an
accent-colored efficiency figure.

**Rationale**: Matches the mockup's own visual hierarchy (odometer = neutral fact, economy = the
figure worth drawing the eye to) without inventing a third style variant.
