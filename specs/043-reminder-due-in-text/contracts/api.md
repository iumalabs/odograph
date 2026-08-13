# API Contracts: Reminder Due-In Text

Extends the existing `GET /api/v1/vehicles/:vehicleId/reminder-rules` response — no new route.

## `GET /api/v1/vehicles/:vehicleId/reminder-rules` (existing, fields added)

Each entry gains two fields alongside specs/041's `remainingFraction`:

```json
{
  "id": "...",
  "label": "Oil change",
  "status": "coming_up",
  "remainingFraction": 0.05,
  "remainingValue": 50,
  "remainingUnit": "distance"
}
```

- `remainingValue`: `number | null`. `null` iff `status === "not_enough_data"`. Negative once
  `status === "overdue"`.
- `remainingUnit`: `"days" | "distance" | null`. `null` iff `remainingValue` is `null`.

No other field, status code, or error contract changes.

## Cross-cutting

- `remainingUnit` is a plain data tag, never a translated string — all wording is client-side
  (`strings.ts`), per constitution Principle IX.
- `remainingValue`/`remainingUnit` always agree with `status` and `remainingFraction` for the same
  rule (same underlying selection), never independently computed.
