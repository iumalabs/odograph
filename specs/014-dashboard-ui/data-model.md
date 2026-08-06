# Phase 1 Data Model: Dashboard UI

No new table, column, migration, or server-side type. This feature composes three data shapes that
already exist and are already returned by already-shipped routes.

## Composed view model (client-side only, not persisted)

| Field            | Source                                                          | Notes                                                                                                                          |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `vehicle`        | `Vehicle` (spec 006, already fetched by `listVehicles`)         | id, name, make/model/year, `odometerUnit`                                                                                      |
| `aggregates`     | `VehicleAggregates` (spec 013, `GET /vehicles/:id/aggregates`)  | `costPerDistance`/`costPerTime`/`averageFuelEconomy`, each independently `number \| null`                                      |
| `reminderRules`  | `ReminderRule[]` (spec 011, `GET /vehicles/:id/reminder-rules`) | each carries its own computed `status`                                                                                         |
| `needsAttention` | derived                                                         | `true` if any `reminderRules[i].status` is `"coming_up"` or `"overdue"` (research.md) — not fetched, computed in the component |

Assembled per vehicle by `DashboardView` into a `VehicleSummary` array; nothing here is a new
persisted entity, and nothing is written back anywhere — this is a pure read/derive/render pipeline.

## Client layer additions

- `src/client/vehicle-aggregates.ts`: `VehicleAggregates` type (mirrors
  `src/server/db/repository.ts`'s exported type of the same name) and
  `getVehicleAggregates(vehicleId: string): Promise<VehicleAggregates>` — same `jsonFetch`-wrapper
  shape every other client data module (`vehicles.ts`, `reminder-rules.ts`) already uses.
- `DashboardView` itself holds no new exported type beyond an internal `VehicleSummary` shape
  (vehicle + aggregates + reminder rules + derived `needsAttention`), scoped to the component file —
  nothing else needs to import it.

## GDPR erasure

N/A — no new table, column, or stored data of any kind.
