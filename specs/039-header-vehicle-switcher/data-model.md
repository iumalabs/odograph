# Phase 1 Data Model: Header Vehicle Switcher

No new entity, no schema change, no API change. Three new props on an existing component.

## `AppShellProps` (extended)

| Prop | Type | Source in `App.tsx` |
| ------ | ------ | ---------------------- |
| `vehicles` | `Vehicle[]` | `mergedVehicles` (already computed, already passed to `Garage`/`DashboardView` elsewhere) |
| `selectedVehicleId` | `string \| null` | existing `selectedVehicleId` state, unchanged |
| `onSelectVehicle` | `(id: string) => void` | new plain `setSelectedVehicleId` reference — never the select-and-navigate handler `Garage`/`SearchBar` use (research.md) |

No new prop for the quick-fuel button — it calls the already-existing `onSelectView("fuel")`.
