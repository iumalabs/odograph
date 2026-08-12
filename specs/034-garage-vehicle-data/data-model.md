# Phase 1 Data Model: Garage Cards Show Vehicle Data

No new entity, no schema change. One field added to an existing response shape.

## `VehicleAggregates` (extended)

| Attribute        | Type             | Notes                                                                 |
| ----------------- | ---------------- | ---------------------------------------------------------------------- |
| `costPerDistance` | `number \| null` | Existing, unchanged.                                                   |
| `costPerTime`      | `number \| null` | Existing, unchanged.                                                   |
| `averageFuelEconomy` | `number \| null` | Existing, unchanged.                                                |
| `currentOdometer`  | `number \| null` | New. Highest odometer reading among the vehicle's service/fuel records; `null` if none recorded yet. |

Server: `computeVehicleAggregates` (`src/server/db/repository.ts`) gains one more parallel query
(`getVehicleCurrentOdometer`, already existing) and one more field on its returned object.

Client: `VehicleAggregates` type (`src/client/vehicle-aggregates.ts`) gains the matching field —
`getVehicleAggregates` itself needs no change, since it's a thin `jsonFetch` wrapper already
returning whatever the server sends.

## Garage card display model (client-only, not persisted)

Per vehicle, `Garage.tsx` derives a local summary (mirroring `DashboardView.tsx`'s `VehicleSummary`
shape):

| Field            | Type                     | Source                                                          |
| ------------------ | ------------------------ | ------------------------------------------------------------------ |
| `currentOdometer`  | `number \| null`         | `getVehicleAggregates(vehicle.id).currentOdometer`                |
| `mostUrgentReminder` | `ReminderRule \| null` | Derived client-side from `listReminderRules(vehicle.id)` (research.md) |

Neither field is written back anywhere — this is a read/derive-only addition to the card's render.
