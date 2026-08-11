# Phase 1 Data Model: VIN Lookup on Vehicle Add

No new D1 migration. `vehicles.make`, `vehicles.model`, `vehicles.year`, `vehicles.vin` are already
nullable columns (migration 0006) and already accepted, validated, optional inputs on
`POST /api/v1/vehicles` (`src/server/routes/v1/vehicles.ts`'s `validateCreate`) — this feature only
adds owner-facing entry for them at creation time, it does not change the `Vehicle` entity itself.

## Transient value: VIN lookup result

Not a persisted entity — exists only for the duration of a single add-vehicle form session, used to
pre-fill (not replace) form state.

| Field | Type | Notes |
|---|---|---|
| `make` | `string \| null` | Only set if NHTSA returned a non-empty value |
| `model` | `string \| null` | Only set if NHTSA returned a non-empty value |
| `year` | `number \| null` | Only set if NHTSA returned a parseable model year |
| `found` | `boolean` | `false` for both "lookup failed" and "no usable details" — spec.md explicitly does not require distinguishing these in the UI |

This shape is the server proxy route's response body (see `contracts/api.md`) and the client
wrapper's return type — it is never written to D1.
