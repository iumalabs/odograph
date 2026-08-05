# Phase 0 Research: Reminder Rules & Cron Scheduling

## Status computation: thresholds and combining date/mileage

**Decision**: For each interval side present on a rule, compute a fraction-remaining:
`remaining = (dueValue - currentValue) / intervalValue` (days or distance units, matching the
side). Classify:
- `remaining < 0` → `overdue`
- `0 <= remaining <= 0.1` (last 10% of the interval) → `coming_up`
- `remaining > 0.1` → `on_track`

For a rule with both sides present, the overall status is the more urgent of the two (`overdue` >
`coming_up` > `on_track`) — spec.md's "whichever comes first." For a rule with only one side, that
side's status is the overall status. If a mileage side can't be computed (no odometer data, see
below) and the rule also has a date side, the overall status is the date side's status alone with
the mileage side separately reported as `not_enough_data` for its own display; if the rule is
mileage-only and has no odometer data, the overall status is `not_enough_data`.

**Rationale**: A proportional (percentage-of-interval) threshold, not a fixed day/distance count,
directly satisfies spec.md's edge case: a 6-month interval and a 4-year interval shouldn't both
start warning at the same fixed number of days out — 10% of 6 months (~18 days) and 10% of 4 years
(~5 months) both feel like "coming up soon relative to how often this happens," which a fixed
30-day threshold would get wrong for the 4-year case (constantly "coming up") and the 6-month case
(barely any warning). This mirrors the design mockups' own reminder-legend language surfaced
during spec 008's research ("less than 10% of the interval remaining").

**Alternatives considered**: a fixed absolute threshold (e.g. "within 30 days or 500 units") —
rejected per the edge case above; a configurable-per-rule threshold — rejected as unnecessary
complexity for a v1 feature with no requirement asking for it (an owner can't currently tune
anything else about the status computation either, like the fuel-economy unit).

## Current odometer reading: reuse fuel/service history, no new field

**Decision**: `MAX(odometer_reading)` across the union of that vehicle's `fuel_records` (always
has one, required field) and `service_records` (nullable field, only non-null rows count),
scoped by tenant. If neither table has a matching row, there's no known current odometer reading.

**Rationale**: Directly reuses spec 009's own precedent (fuel-economy ordering already treats "the
vehicle's records" as the source of truth for odometer history) rather than introducing a new,
separately-maintained "current mileage" field on `vehicles` that could drift out of sync with what
the owner has actually logged. A single `MAX()` over a `UNION ALL` of both tables' odometer columns
is a cheap, already-indexed query (both tables already index `vehicle_id`).

**Alternatives considered**: adding a `current_odometer` column to `vehicles`, updated whenever a
fuel/service record is created — rejected: two sources of truth for the same fact is exactly the
kind of drift risk the "reuse existing data" choice avoids, and no feature has asked for a
vehicle-level odometer field independent of its records.

## Cron schedule and the Worker's `scheduled()` export

**Decision**: `wrangler.toml` gains `[triggers]\ncrons = ["0 8 * * *"]` (once daily, 08:00 UTC) on
the default, `env.preview`, and `env.production` sections. `src/server/index.ts` changes its
default export from the bare Hono `app` to `{ fetch: app.fetch, scheduled: evaluateAllReminders }`
— Cloudflare's modules-worker convention for a Worker that handles both HTTP requests and
scheduled events from the same entry point.

**Rationale**: Daily is frequent enough that a reminder is never more than about a day stale
between scheduled checks, while every reminder interval in this feature is measured in days,
weeks, or months (never minutes/hours) — matching spec.md's own Assumption. Hono's `app` object is
itself just a `fetch`-shaped handler; Cloudflare's module-worker format supports named exports on
the default-exported object for other event types (`scheduled`, `queue`, etc.) alongside `fetch`,
so no framework or dependency change is needed, only a small change to what `index.ts` exports.

**Alternatives considered**: a more frequent schedule (e.g. hourly) — rejected as needless
Worker-invocation cost for a feature whose fastest-changing due condition (mileage) only updates
when a fuel/service record is logged, not continuously; a less frequent schedule (e.g. weekly) —
rejected as too coarse for the notification-latency goal the still-to-come delivery features
(#14/#15) will need once built.

## Scheduled sweep: continuing past a single rule's failure

**Decision**: `evaluateAllReminders` iterates every reminder rule (across all tenants — this is
the one function in the codebase that legitimately isn't tenant-scoped, since a Cron Trigger has
no session) and wraps each rule's evaluate-and-persist step in its own try/catch, logging and
continuing rather than letting one throw abort the whole run (FR-011).

**Rationale**: A single malformed row or a transient per-row write conflict shouldn't silently
stop every other tenant's reminders from being refreshed that day — this is a direct requirement
(FR-011/Edge Cases), and the failure-isolation pattern (per-item try/catch in a loop) is the
simplest way to satisfy it without introducing retry queues or batching infrastructure the project
doesn't otherwise have (and Cloudflare Queues are explicitly disallowed).

**Alternatives considered**: `Promise.allSettled` over all rules processed concurrently — considered,
but rejected in favor of a simple sequential loop for this feature's expected scale (Scope: no
pagination/batching needed yet); revisit if rule counts ever make sequential evaluation a real
latency concern, at which point `Promise.allSettled` (already failure-isolated per-promise) is a
drop-in upgrade requiring no shape change to the per-rule evaluation function itself.

## Testing the scheduled handler

**Decision**: `tests/server/reminder-rules.test.ts` invokes the exported `scheduled` handler
directly using `createScheduledController()` from `cloudflare:test` (bundled with
`@cloudflare/vitest-pool-workers`, already a project dependency) plus `env` and a `waitUntil`-
capturing execution context — not through any HTTP route, since the scheduled handler has none.

**Rationale**: This is the documented, supported way `@cloudflare/vitest-pool-workers` exercises a
`scheduled()` export — the same package this project already uses for D1/R2/KV local simulation in
every other test file, so no new testing dependency or pattern is introduced.

**Alternatives considered**: extracting `evaluateAllReminders` as a plain function and testing it
without going through the `scheduled()` wrapper at all — actually the primary test strategy (most
of the logic and edge-case coverage lives in the plain repository function, per Project Structure);
the `createScheduledController()` invocation is reserved for the one test proving the *Worker
export itself* is correctly wired to the underlying function (User Story 5's own acceptance
scenario explicitly calls for triggering "the scheduled evaluation" as the thing under test, not
just the function it happens to call).
