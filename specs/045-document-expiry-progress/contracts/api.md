# API Contracts: Document Expiry Progress Bar

Extends the existing document endpoints (`GET/POST /api/v1/vehicles/:vehicleId/documents`,
`GET/PATCH /api/v1/documents/:id`) — no new route.

## Response shape (existing, field added)

Every returned document gains `windowFraction`:

```json
{
  "id": "...",
  "title": "Insurance",
  "expiryDate": "2026-09-01",
  "isExpired": false,
  "reminderStatus": "coming_up",
  "windowFraction": 0.6
}
```

- `windowFraction`: `number | null`. Present only when `reminderStatus` is `coming_up` or
  `overdue`; `1` once past expiry (clamped). `null` for `on_track`, `null` `reminderStatus`, or no
  `expiryDate`.

No other field, status code, or error contract changes.

## Cross-cutting

- `windowFraction` always agrees with `reminderStatus`/`isExpired` for the same document — never
  independently computed.
