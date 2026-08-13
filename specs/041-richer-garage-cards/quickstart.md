# Quickstart: Richer Garage Cards

## API scenarios (curl against `deno task dev`)

Prereqs: a dev session, a vehicle, and a reminder rule on it.

1. **On-track reminder** — create a reminder rule far from due, `GET .../reminder-rules` →
   `status: "on_track"`, `remainingFraction` a positive number close to `1`.
2. **Coming-up reminder** — create/update so it's within the coming-up threshold → `status:
   "coming_up"`, `remainingFraction` a small positive number (≤ the existing threshold).
3. **Overdue reminder** — set `lastDoneOdometer`/`lastDoneDate` far enough in the past → `status:
   "overdue"`, `remainingFraction` negative.
4. **Not-enough-data reminder** — a distance-interval rule with no current odometer data yet →
   `status: "not_enough_data"`, `remainingFraction: null`.
5. **Fuel economy on aggregates** — with ≥2 fuel records, `GET .../aggregates` still returns a
   populated `averageFuelEconomy` exactly as before (regression check — this feature doesn't touch
   that computation).

## Client walkthrough (manual, against `deno task dev`)

1. Open the Garage screen for a vehicle with fuel history and a reminder.
   **Expected**: the card shows a large odometer figure and a large, accent-colored fuel-economy
   figure, visually distinct from the smaller VIN/unit chips.
2. **Expected**: a progress bar appears reflecting the most urgent reminder's status — mostly full
   and dim for on-track, more filled and accent-colored for coming-up, full and warn-colored for
   overdue.
3. Open the Garage screen for a brand-new vehicle with no fuel records and no reminders.
   **Expected**: the fuel-economy figure shows the existing not-enough-data placeholder; no
   progress bar appears at all.

## Regression check

Confirm the odometer chip's existing not-enough-data behavior (vehicle with zero fuel/service
records → no odometer figure shown) is unchanged, and that `ReminderRulePanel.tsx`'s own status
badges (unrelated to this feature) are visually unaffected.
