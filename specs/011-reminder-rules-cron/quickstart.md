# Quickstart: Reminder Rules & Cron Scheduling

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/reminder-rules.test.ts` to pass — CRUD lifecycle, cross-tenant isolation,
dedicated status-computation cases (on track, coming up, overdue, not-enough-data for a mileage
rule with no odometer history, both-intervals-disagree), mark-done, and the scheduled handler
invoked directly via `createScheduledController()` confirming every rule across every tenant gets
a fresh `cachedStatus`/`lastEvaluatedAt`, with one rule's simulated failure not blocking the rest.

## 3. Manual smoke test end-to-end

```sh
deno task dev
```

1. Create a reminder rule with only a date interval (e.g. "Registration renewal," every 365 days,
   last done today) — confirm it shows "on track."
2. Create one with only a mileage interval on a vehicle with no fuel/service records yet — confirm
   it shows "not enough data," not a crash or a guessed status.
3. Log a fuel record for that vehicle to give it an odometer reading, then re-view the mileage
   rule — confirm it now computes a real status.
4. Create a rule with both intervals where one is close to due and the other isn't — confirm the
   overall status matches the more urgent side.
5. Mark a rule done — confirm its status resets to "on track" and its last-done fields update.
6. Delete a rule — confirm it's gone from the list immediately.
7. Confirm the Cron Trigger is declared: `wrangler.toml`'s `[triggers]` section lists a `crons`
   schedule on the default/preview/production sections (this can't be triggered from a local
   `deno task dev` session the way the HTTP routes can — it's verified by the automated test's
   direct `createScheduledController()` invocation, step 2 above, and by inspecting the deployed
   Worker's triggers in the Cloudflare dashboard after merge).
