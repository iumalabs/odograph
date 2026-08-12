# Phase 1 Data Model: Top-Level Nav Screens

No new entity, no schema change, no API change. This is purely a navigation/rendering-location
restructuring.

## `AppView` union (extended)

| Before | After |
| -------- | ------- |
| `"garage" \| "dashboard" \| "review" \| "settings"` | `"garage" \| "dashboard" \| "fuel" \| "service" \| "reminders" \| "planner" \| "documents" \| "review" \| "settings"` |

## `NAV_ITEMS` (extended, order matches the source design's own nav order for the five new entries,
existing four kept in place)

| view | icon | label key |
| ------ | ------ | ----------- |
| `garage` | `GarageIcon` (existing) | `garageNavLabel` (existing) |
| `dashboard` | `DashboardIcon` (existing) | `dashboardNavLabel` (existing) |
| `fuel` | `FuelIcon` (existing) | `fuelNavLabel` (new) |
| `service` | `ServiceIcon` (existing) | `serviceNavLabel` (new) |
| `reminders` | `BellIcon` (existing) | `remindersNavLabel` (new) |
| `planner` | `PlannerIcon` (new) | `plannerNavLabel` (new) |
| `documents` | `DocumentIcon` (new) | `documentsNavLabel` (new) |
| `review` | `AlertIcon` (existing) | `syncReviewNavLabel` (existing) |
| `settings` | `SettingsIcon` (existing) | `settingsNavLabel` (existing) |

## Rendering relocation (no prop-shape changes to any panel)

| Panel component | Was rendered | Now rendered |
| ------------------ | -------------- | -------------- |
| `ServiceRecordPanel` | Inline on Garage, `{selectedVehicleId && ...}` | `view === "service"` branch |
| `FuelRecordPanel` | Inline on Garage | `view === "fuel"` branch |
| `ReminderRulePanel` | Inline on Garage | `view === "reminders"` branch |
| `PlanBoard` | Inline on Garage | `view === "planner"` branch |
| `DocumentPanel` | Inline on Garage | `view === "documents"` branch |
| `ExpenseBreakdownPanel` + PDF link | Inline on Garage | `view === "dashboard"` branch (spec.md Assumptions) |

Every one of the six moved blocks keeps its exact existing props/handlers verbatim — only the
`if (view === "...")` branch it lives in changes.
