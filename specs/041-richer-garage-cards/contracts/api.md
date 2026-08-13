# API Contracts: Richer Garage Cards

Extends the existing `GET /api/v1/vehicles/:vehicleId/reminder-rules` response — no new route.

## `GET /api/v1/vehicles/:vehicleId/reminder-rules` (existing, field added)

Each entry in `reminderRules` gains one field:

```json
{
  "id": "...",
  "label": "Oil change",
  "status": "coming_up",
  "byDate": null,
  "byMileage": "coming_up",
  "dueDate": null,
  "dueOdometer": 214380,
  "remainingFraction": 0.08
}
```

- `remainingFraction`: `number | null`. `null` iff `status === "not_enough_data"`. Negative once
  `status === "overdue"`.

No other field, status code, or error contract changes. `GET /api/v1/vehicles/:vehicleId/aggregates`
is unchanged — `averageFuelEconomy` already exists there (specs/013) and this feature only renders
it more prominently on the Garage screen.

## Cross-cutting

- No new endpoint, no new query parameter, no new request body.
- `remainingFraction`'s sign/zero convention exactly matches the internal fraction
  `classifyRemainingFraction` already classifies into `on_track`/`coming_up`/`overdue` — a client
  reading both `status` and `remainingFraction` for the same rule will never see them disagree.
