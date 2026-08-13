# Quickstart: Reminder Due-In Text

## API scenarios (curl against `deno task dev`)

1. **Coming-up, distance-based** — create a reminder close to due by mileage → `remainingValue` a
   small positive number, `remainingUnit: "distance"`.
2. **Overdue, distance-based** — push it past due → `remainingValue` negative, `remainingUnit:
   "distance"`.
3. **Coming-up, date-based** — create a reminder close to due by date → `remainingValue` a small
   positive number, `remainingUnit: "days"`.
4. **Not-enough-data** — a rule with no computable status → `remainingValue: null`,
   `remainingUnit: null`.

## Client walkthrough (manual, against `deno task dev`)

1. Open the Dashboard for a vehicle with a coming-up (distance) reminder and an overdue (date)
   reminder.
   **Expected**: each row shows a due-in value next to its label; the overdue row's wording clearly
   reads as past-due, distinct from the coming-up row's wording, not just a different color.
2. Confirm the distance-based reminder's value is shown in the vehicle's own odometer unit (km or
   mi, matching what's shown elsewhere for that vehicle).

## Regression check

Confirm a not-enough-data reminder still doesn't appear in this list at all (existing filter,
unrelated to this feature — this list already only shows coming_up/overdue), and that
`ReminderRulePanel.tsx`'s own Reminders-screen list is visually unaffected (out of scope, per
spec.md).
