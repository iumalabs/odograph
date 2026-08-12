# Phase 1 Data Model: Per-Vehicle Dashboard

No new entity, no schema change, no API change. This feature only recombines four already-existing
client-fetchable shapes for one vehicle at a time.

## Reused shapes (all pre-existing, unchanged)

| Source | Shape | Used for |
| -------- | ------- | ---------- |
| `getVehicleAggregates(vehicleId)` | `VehicleAggregates` (`costPerDistance`, `costPerTime`, `averageFuelEconomy`, `currentOdometer`) | Cost-per-distance KPI |
| `getVehicleExpenseBreakdown(vehicleId, "month")` | `ExpensePeriod[]` (`period`, `maintenanceCost`, `fuelCost`, `totalCost`) | Total/fuel/service spend KPIs (summed across periods); monthly chart (zero-filled, research.md) |
| `listReminderRules(vehicleId)` | `ReminderRule[]` (incl. `status`) | Upcoming-reminders list (filtered to `coming_up`/`overdue`, sorted, capped at 5) |
| `listServiceRecords(vehicleId)` + `listFuelRecords(vehicleId)` | `ServiceRecord[]` / `FuelRecord[]` | Recent-activity list (merged by date desc, capped at 5) |

## Client-local derived shape (not persisted, not a new entity)

```ts
type ChartMonth = { period: string; maintenanceCost: number; fuelCost: number };
type RecentEntry = { date: string; title: string; cost: number | null };
```

Both are pure display-layer reshaping of the already-fetched data above — computed in
`DashboardView.tsx`, never sent anywhere, never stored.

## `DashboardView` prop shape change

| Before | After |
| -------- | ------- |
| `vehicles: Vehicle[]` | `vehicle: Vehicle \| null` (the currently selected one, or none) |
| `onSelectVehicle: (id: string) => void` | removed — no longer a list of clickable cards |
| `currencySymbol: string` | unchanged |
