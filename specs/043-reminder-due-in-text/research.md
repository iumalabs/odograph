# Phase 0 Research: Reminder Due-In Text

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Extend `computeReminderStatus` again, mirroring specs/041's `remainingFraction` pattern exactly

**Decision**: Alongside `remainingFraction`, expose the raw `remainingDays`/`remainingDistance`
value (absolute number) and a `remainingUnit: "days" | "distance"` tag, selected via the exact same
byDate-vs-byMileage winner logic already used for `status` and `remainingFraction`.

**Rationale**: Zero new selection logic to get right — reuses the branch that already exists from
specs/041. Keeps `remainingFraction` (proportional, for the progress bar) and `remainingValue`
(absolute, for this due-in text) as two views over the same already-computed numbers, guaranteed
consistent with each other and with `status`.

## Decision: Server returns numbers + a unit tag, never a formatted sentence — client owns all wording

**Decision**: `remainingUnit` is a plain enum tag (`"days" | "distance"`), not a translated string.
The client picks one of four `strings.ts` templates (due-in-days / overdue-days / due-in-distance /
overdue-distance) based on `remainingUnit` and `status`, filling in `remainingValue` and — for the
distance case — the vehicle's own `odometerUnit`.

**Rationale**: Constitution Principle IX requires all user-facing language to route through
`strings.ts`; a server-formatted sentence (even something as small as "km" or "days") would bake
English into a data response, foreclosing future locales the way the existing i18n layer is
explicitly designed to avoid.

## Decision: Overdue gets distinct wording, not just distinct color

**Decision**: Four separate label templates (not two, with a shared "when" value and a sign-based
color) — `reminderDueInDaysLabel`/`reminderOverdueDaysLabel`/`reminderDueInDistanceLabel`/
`reminderOverdueDistanceLabel` — each phrased for its own case ("In 12 days" vs. "Overdue by 12
days").

**Rationale**: FR-004 explicitly requires overdue to be textually distinguishable, not just
color-coded — accessibility and clarity (a color-blind owner, or a quick glance without noticing
color, should still be able to tell overdue from upcoming from the words alone).

## Decision: Distance unit label reuses the vehicle's existing `odometerUnit`, no new unit field

**Decision**: The distance-case template takes `{value}` and `{unit}` params, where `{unit}` is
filled with the vehicle's already-known `odometerUnit` ("km"/"mi") at render time — no new field on
the reminder-status response itself.

**Rationale**: The vehicle object is already in scope in `DashboardView.tsx` (the component only
ever renders one vehicle at a time); a reminder's distance is inherently in that same vehicle's
odometer unit, so duplicating the unit onto every reminder row would be redundant.
