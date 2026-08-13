# Phase 1 Data Model: Richer Garage Cards

No new persisted entity, no schema change. One existing derived-response type gains one field.

## `ReminderStatusResult` (extended)

| Field | Type | Notes |
|---|---|---|
| `status` | `ReminderStatus` | Unchanged. |
| `byDate` | `ReminderStatus \| null` | Unchanged. |
| `byMileage` | `ReminderStatus \| null` | Unchanged. |
| `dueDate` | `string \| null` | Unchanged. |
| `dueOdometer` | `number \| null` | Unchanged. |
| `remainingFraction` | `number \| null` | **New.** The fraction of the interval remaining, taken from whichever side (`byDate` or `byMileage`) determined the overall `status` — same selection rule `status` itself already uses. Negative once overdue (e.g. `-0.2` = 20% past due). `null` iff `status === "not_enough_data"`. |

`ReminderRuleWithStatus` (server) and the client's `ReminderRule` type both inherit this field
automatically, since both are `ReminderRule & ReminderStatusResult`-shaped already.

## `VehicleAggregates` (unchanged, reused)

`averageFuelEconomy: number | null` already exists (specs/013) and is unchanged by this feature —
`Garage.tsx` already fetches the containing `VehicleAggregates` object via `getVehicleAggregates`
for `currentOdometer`; this feature reads one more field off the same already-fetched object.

## Relationships

No new reads, no new writes. `remainingFraction` is computed inside the same
`computeReminderStatus` call `listReminderRulesWithStatus` already makes per rule, and travels
through the same `GET /:vehicleId/reminder-rules` response `Garage.tsx` already consumes via
`listReminderRules`.
