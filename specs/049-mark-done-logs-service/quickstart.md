# Quickstart: Mark-Done Logs a Service Record

## API scenarios (curl against `deno task dev`)

1. **Known odometer** — create a vehicle with a fuel record (establishing a current odometer),
   create a reminder, mark it done → `GET .../service-records` shows a new record with
   `description` = the reminder's label, `serviceDate` = today, `odometerReading` = the vehicle's
   current odometer, `cost: null`, `performedBy: null`, a fixed provenance note.
2. **No odometer yet** — mark a reminder done on a vehicle with zero fuel/service history →
   the new service record's `odometerReading` is `null`, not a guessed value.
3. **Retry (idempotency)** — mark-done twice with the same `Idempotency-Key` header → only one
   service record exists after both calls.

## Regression check

Confirm the reminder's own `last_done_date`/`last_done_odometer` update (existing behavior) is
unchanged, and that the Planner's own done-transition service-record creation is unaffected.
