# Phase 1 Data Model: Reminder Rules & Cron Scheduling

## `reminder_rules`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `tenant_id` | TEXT | `REFERENCES tenants(id) ON DELETE CASCADE` |
| `vehicle_id` | TEXT | `REFERENCES vehicles(id) ON DELETE CASCADE` |
| `label` | TEXT | required (FR-001) |
| `interval_days` | INTEGER nullable | at least one of `interval_days`/`interval_distance`
  required — enforced by a table-level `CHECK (interval_days IS NOT NULL OR interval_distance IS
  NOT NULL)` (FR-002) |
| `interval_distance` | INTEGER nullable | same unit as the vehicle's `odometerUnit` (km/mi) —
  not stored per-rule, read from the vehicle at computation time, same pattern as spec 009's fuel
  volume unit |
| `last_done_date` | TEXT nullable | required if `interval_days` is set (validated at the route
  layer, same shape as the DB-level interval check); anchor for the date-side computation |
| `last_done_odometer` | INTEGER nullable | required if `interval_distance` is set; anchor for
  the mileage-side computation |
| `cached_status` | TEXT nullable | written only by the scheduled sweep (`evaluateAllReminders`),
  never by any request handler directly — one of `on_track`/`coming_up`/`overdue`/
  `not_enough_data`. Exists so a not-yet-built future notification feature (#14/#15) has a durable
  signal to read between requests (spec.md Assumptions) — never read by this feature's own API
  responses, which always compute status fresh (FR-004/FR-005) |
| `last_evaluated_at` | TEXT nullable | written alongside `cached_status`, by the scheduled sweep
  only |
| `created_at` / `updated_at` | TEXT | ISO 8601, same convention as every other record table |

**GDPR erasure**: Delete, cascading from `vehicles` — same decision and rationale as
`service_records`/`fuel_records` (specs 007/009 data-model.md): no independent retention value
once the owning vehicle is gone.

**No `due_date`/`due_odometer`/`status` columns** — all three are derived at read time (and at
scheduled-sweep time, via the identical function) from `interval_*` + `last_done_*` compared to
today's date and the vehicle's current known odometer reading (research.md), never persisted as
the source of truth (FR-004/FR-005) — `cached_status`/`last_evaluated_at` are a *cache* for other
features to read, not this feature's own authority on "what is this rule's status right now."

Indexes: `idx_reminder_rules_vehicle_id (vehicle_id)`, `idx_reminder_rules_tenant_id (tenant_id)`
— same shape as every other vehicle-scoped table's indexes.

## Repository layer additions (`src/server/db/repository.ts`)

- `ReminderRule`/`ReminderRuleInput` types; `ReminderStatus = "on_track" | "coming_up" |
  "overdue" | "not_enough_data"`.
- `createReminderRule(db, ctx, vehicleId, input)`, `listReminderRules(db, ctx, vehicleId)`,
  `findReminderRuleById(db, ctx, id)`, `updateReminderRule(db, ctx, id, patch)`,
  `deleteReminderRule(db, ctx, id)` — same shapes as the equivalent fuel/service record functions.
- `markReminderRuleDone(db, ctx, id): Promise<ReminderRule | null>` — sets `last_done_date` to
  today and, if the rule has `interval_distance` set, `last_done_odometer` to the vehicle's
  current known odometer reading (looked up the same way the status computation does).
- `getVehicleCurrentOdometer(db, ctx, vehicleId): Promise<number | null>` — the `MAX()`-over-
  `UNION` query from research.md; `null` if the vehicle has no fuel or service records yet.
- `computeReminderStatus(rule, currentOdometer, now): { status: ReminderStatus, byDate:
  ReminderStatus | null, byMileage: ReminderStatus | null, dueDate: string | null, dueOdometer:
  number | null }` — a **pure function**, no D1 access, so its four-state logic (research.md) is
  directly unit-testable without a database round trip; used identically by
  `listReminderRulesWithStatus`/`findReminderRuleById`'s response shaping and by
  `evaluateAllReminders`.
- `listReminderRulesWithStatus(db, ctx, vehicleId)` — fetches the vehicle's rules plus its current
  odometer reading once, then maps `computeReminderStatus` over each rule (avoiding an N+1 odometer
  lookup per rule).
- `evaluateAllReminders(db): Promise<{ evaluated: number; failed: number }>` — the scheduled
  sweep: iterates every `reminder_rules` row across every tenant (no `TenantContext` — this is the
  documented exception, research.md), computing and persisting `cached_status`/
  `last_evaluated_at` per row, continuing past any single row's failure (FR-011).
