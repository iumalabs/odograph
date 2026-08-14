# Quickstart: History-Based Service Due Estimate

## API scenarios (curl against `deno task dev`)

Prereqs: a dev session (`POST /api/v1/_dev/session`) and a vehicle.

1. **No history** — `GET /api/v1/vehicles/:id/service-due-estimate` against a vehicle with zero
   service records → `200`, `{"estimate": null}`.
2. **One record only** — log one service record, repeat the `GET` → still `{"estimate": null}`
   (fewer than 2 matching records).
3. **Qualifying estimate** — log a second service record with the identical `description` and a
   higher `odometerReading` → `200`, `estimate.description` matches, `estimatedOdometer` equals
   the second record's odometer plus the distance between the two, `basedOnRecordCount: 2`.
4. **Averaging** — log a third record with the same description → `estimate.averageInterval` is
   the average of both consecutive gaps, not just the most recent one (contracts/api.md).
5. **Soonest-only** — log a second, different-description work group that also qualifies (≥2
   records) with a nearer `estimatedOdometer` → the `GET` response now surfaces that group
   instead; only ever one `estimate` object, never a list.
6. **Suppressed by an explicit reminder** — `POST /:id/reminder-rules` with a `label` matching a
   qualifying group's description → repeat the `GET` → that group's estimate no longer appears
   (falls back to `null`, or to the next-soonest qualifying group if one exists).
7. **Accept** — with a qualifying estimate showing, `POST
   /:id/service-due-estimate/accept` with that estimate's `description` → `201`, a new reminder
   rule appears in `GET /:id/reminder-rules` with the same `label`/computed interval; the
   subsequent `service-due-estimate` `GET` no longer surfaces that work (scenario 6's suppression
   now applies to it).
8. **Accept retried** — repeat the exact same accept request (same idempotency key) → the same
   `201` response, and `GET /:id/reminder-rules` still shows exactly one matching rule, not two.
9. **Accept a stale/already-taken estimate** — accept the same `description` a second time with a
   *different* idempotency key (simulating a second, non-retry accept after it was already taken)
   → `409 no_longer_available`.
10. **Wrong tenant / unknown vehicle** — both routes → `404`.

## Client walkthrough (manual, against `deno task dev`)

1. Log two service records for a vehicle with the same description (e.g. "Oil change") and
   different odometer readings.
2. Open that vehicle's service-entry form.
   **Expected**: a hint appears naming that work and an estimated next-due odometer reading,
   visually labeled as an estimate (not a confirmed schedule) — matches the source mockup's
   placement (near the top of the form, above the input fields).
3. Click the accept action next to the hint.
   **Expected**: the hint's action becomes unavailable/changes state; opening the Reminders screen
   shows a new reminder for that same work with a matching due estimate.
4. Reopen the service-entry form.
   **Expected**: the history-based hint for that work no longer appears (a real reminder now
   covers it).
5. Log a single service record for a vehicle with no other history.
   **Expected**: no hint appears anywhere in the form.

## Regression check

Confirm the reminders screen and reminder push/email delivery are completely unaffected for
manually-created reminder rules — an accepted estimate must be indistinguishable from a
hand-created rule everywhere downstream of creation (spec FR-009).
