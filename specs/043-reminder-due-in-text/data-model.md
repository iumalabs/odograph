# Phase 1 Data Model: Reminder Due-In Text

No new persisted entity, no schema change. `ReminderStatusResult` gains two more derived fields
alongside specs/041's `remainingFraction`.

## `ReminderStatusResult` (extended again)

| Field | Type | Notes |
|---|---|---|
| `remainingFraction` | `number \| null` | Unchanged (specs/041). |
| `remainingValue` | `number \| null` | **New.** Absolute remaining days or remaining distance, from whichever side (`byDate`/`byMileage`) determined `status` — same selection as `remainingFraction`. Negative once overdue (matching `remainingFraction`'s sign convention). `null` iff `status === "not_enough_data"`. |
| `remainingUnit` | `"days" \| "distance" \| null` | **New.** Which unit `remainingValue` is in. `null` iff `remainingValue` is `null`. |

## Relationships

No new reads, no new writes. Both fields are computed inside the same `computeReminderStatus` call
`listReminderRulesWithStatus` already makes, and travel through the same
`GET /:vehicleId/reminder-rules` response the Dashboard already consumes via `listReminderRules`.
